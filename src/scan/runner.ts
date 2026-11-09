import { parseReply } from '../protocol/elm';
import { DisconnectedError, TimeoutError, type AdapterInfo, type Transport } from '../transport/types';
import type { CheckOutcome, CheckPlan, CheckResult, ScanEvent, ScanResult, ScanSummary } from './types';

export interface RunOptions {
  /** Cancels the scan between checks; the result is a partial report. */
  signal?: AbortSignal;
  onEvent?: (e: ScanEvent) => void;
  /** Retries after a timeout or bus error (default 1). */
  retries?: number;
  /** Default per-request timeout in ms (default 1000). */
  timeoutMs?: number;
  now?: () => number;
}

const FUNCTIONAL_HEADER = '7DF';

export function emptySummary(total: number): ScanSummary {
  return { total, completed: 0, ok: 0, fault: 0, unsupported: 0, no_response: 0, manual: 0 };
}

/**
 * Connects, then runs every check in the plan sequentially, emitting events.
 * Always resolves with a ScanResult (partial if cancelled or disconnected);
 * rejects only if the connection cannot be opened.
 */
export async function runScan(transport: Transport, plan: CheckPlan[], opts: RunOptions = {}): Promise<ScanResult> {
  const now = opts.now ?? Date.now;
  const emit = opts.onEvent ?? (() => {});
  const retries = opts.retries ?? 1;
  const defaultTimeout = opts.timeoutMs ?? 1000;
  const startedAt = now();

  let disconnected = false;
  const unsubscribe = transport.onDisconnect(() => {
    disconnected = true;
  });

  emit({ type: 'scan:connecting', t: now() });
  let adapter: AdapterInfo;
  try {
    adapter = await transport.open();
  } catch (err) {
    unsubscribe();
    emit({ type: 'scan:error', t: now(), stage: 'connect', message: messageOf(err) });
    throw err;
  }
  emit({ type: 'scan:connected', t: now(), adapter });

  emit({
    type: 'scan:planned',
    t: now(),
    total: plan.length,
    checks: plan.map(({ id, system, label, source, requestLabel, module }) => ({ id, system, label, source, requestLabel, module })),
  });

  const results: CheckResult[] = [];
  const summary = emptySummary(plan.length);
  let header = FUNCTIONAL_HEADER;
  let reason: ScanResult['reason'];

  for (const check of plan) {
    if (opts.signal?.aborted) {
      reason = 'cancelled';
      break;
    }
    if (disconnected) {
      reason = 'disconnected';
      break;
    }

    const t0 = now();
    let attempts = 0;
    let outcome: CheckOutcome | undefined;

    if (!check.request) {
      emit({ type: 'check:start', t: t0, checkId: check.id, attempt: 1 });
      attempts = 1;
      outcome = check.manual ?? { status: 'manual', summary: 'Not logged yet' };
    } else {
      try {
        const wanted = check.header ?? FUNCTIONAL_HEADER;
        if (!check.request.startsWith('AT') && wanted !== header) {
          await transport.send(`ATSH${wanted}`, 1000);
          header = wanted;
        }
        while (!outcome) {
          attempts += 1;
          emit({ type: 'check:start', t: now(), checkId: check.id, attempt: attempts });
          const attempt = await attemptCheck(transport, check, check.timeoutMs ?? defaultTimeout);
          if (attempt.retryable && attempts <= retries) continue;
          outcome = attempt.outcome;
        }
      } catch (err) {
        if (err instanceof DisconnectedError) {
          disconnected = true;
          reason = 'disconnected';
          emit({ type: 'scan:error', t: now(), stage: 'run', message: 'Adapter disconnected during the scan' });
          break;
        }
        outcome = { status: 'no_response', summary: `Error: ${messageOf(err)}` };
      }
    }

    const result: CheckResult = { ...outcome, checkId: check.id, durationMs: now() - t0, attempts };
    results.push(result);
    summary.completed += 1;
    summary[result.status] += 1;
    emit({ type: 'check:result', t: now(), result });
  }

  unsubscribe();
  if (!disconnected) await transport.close().catch(() => {});

  const result: ScanResult = {
    partial: reason !== undefined,
    reason,
    adapter,
    results,
    summary,
    startedAt,
    finishedAt: now(),
  };
  emit({ type: 'scan:done', t: now(), result });
  return result;
}

interface Attempt {
  outcome: CheckOutcome;
  /** True when another attempt might succeed (timeout, bus error). */
  retryable: boolean;
}

async function attemptCheck(transport: Transport, check: CheckPlan, timeoutMs: number): Promise<Attempt> {
  let lines: string[];
  try {
    lines = await transport.send(check.request!, timeoutMs);
  } catch (err) {
    if (err instanceof TimeoutError) {
      return { retryable: true, outcome: { status: 'no_response', summary: `No response (timed out after ${timeoutMs / 1000} s)` } };
    }
    throw err;
  }

  if (check.evaluateRaw) return { retryable: false, outcome: check.evaluateRaw(lines) };

  const reply = parseReply(lines);
  if (reply.ok) {
    try {
      return { retryable: false, outcome: check.evaluate ? check.evaluate(reply) : { status: 'ok', summary: 'Reading received' } };
    } catch (err) {
      return { retryable: false, outcome: { status: 'no_response', summary: `Unreadable reply: ${messageOf(err)}` } };
    }
  }
  switch (reply.reason) {
    case 'NO_DATA':
      return { retryable: false, outcome: { status: 'unsupported', summary: 'Not supported by this car' } };
    case 'BUS_ERROR':
    case 'STOPPED':
      return { retryable: true, outcome: { status: 'no_response', summary: 'No response (bus error)' } };
    case 'UNABLE_TO_CONNECT':
      return { retryable: false, outcome: { status: 'no_response', summary: 'No response (car not reachable — ignition on?)' } };
    default:
      return { retryable: false, outcome: { status: 'no_response', summary: `Unexpected reply: ${reply.raw.join(' ')}` } };
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
