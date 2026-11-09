import type { AdapterInfo } from '../transport/types';
import type { CheckInfo, CheckResult, CheckStatus, ScanEvent, ScanResult, ScanSummary } from './types';
import { emptySummary } from './runner';

/** View state for the scan screen, built purely from scan events. */
export interface ScanView {
  phase: 'idle' | 'connecting' | 'running' | 'done' | 'error';
  adapter?: AdapterInfo;
  total: number;
  summary: ScanSummary;
  checks: CheckInfo[];
  status: Record<string, CheckStatus>;
  results: Record<string, CheckResult>;
  /** The check in flight, for the activity line. */
  current?: { checkId: string; attempt: number; since: number };
  startedAt?: number;
  finishedAt?: number;
  /** Recent check durations (ms) for the ETA. */
  durations: number[];
  result?: ScanResult;
  error?: string;
}

export const initialView: ScanView = {
  phase: 'idle',
  total: 0,
  summary: emptySummary(0),
  checks: [],
  status: {},
  results: {},
  durations: [],
};

const ETA_WINDOW = 10;

export function reduceScan(view: ScanView, e: ScanEvent): ScanView {
  switch (e.type) {
    case 'scan:connecting':
      return { ...initialView, phase: 'connecting', startedAt: e.t };
    case 'scan:connected':
      return { ...view, adapter: e.adapter };
    case 'scan:planned':
      return {
        ...view,
        phase: 'running',
        total: e.total,
        summary: emptySummary(e.total),
        checks: e.checks,
        status: Object.fromEntries(e.checks.map((c) => [c.id, 'pending' as const])),
      };
    case 'check:start':
      return {
        ...view,
        status: { ...view.status, [e.checkId]: 'running' },
        current: { checkId: e.checkId, attempt: e.attempt, since: e.t },
      };
    case 'check:result': {
      const r = e.result;
      const summary = { ...view.summary, completed: view.summary.completed + 1, [r.status]: view.summary[r.status] + 1 };
      return {
        ...view,
        summary,
        status: { ...view.status, [r.checkId]: r.status },
        results: { ...view.results, [r.checkId]: r },
        current: undefined,
        durations: [...view.durations, r.durationMs].slice(-ETA_WINDOW),
      };
    }
    case 'scan:done': {
      // Anything still running or pending was not run (cancel / disconnect).
      const status = Object.fromEntries(
        Object.entries(view.status).map(([id, s]) => [id, s === 'running' ? ('pending' as const) : s]),
      );
      return { ...view, phase: 'done', status, current: undefined, finishedAt: e.t, result: e.result };
    }
    case 'scan:error':
      // A connect error ends the scan; a run error is followed by scan:done (partial).
      return e.stage === 'connect' ? { ...view, phase: 'error', error: e.message } : { ...view, error: e.message };
  }
}

/** Estimated milliseconds left, or undefined until enough checks have run. */
export function etaMs(view: ScanView): number | undefined {
  if (view.phase !== 'running' || view.durations.length < 3) return undefined;
  const avg = view.durations.reduce((a, b) => a + b, 0) / view.durations.length;
  return Math.round((view.total - view.summary.completed) * avg);
}
