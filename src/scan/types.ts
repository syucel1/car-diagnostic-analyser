import type { ParsedReply } from '../protocol/elm';
import type { AdapterInfo } from '../transport/types';

/** Final outcome of one check. */
export type OutcomeStatus = 'ok' | 'fault' | 'unsupported' | 'no_response' | 'manual';
/** Status as seen by the UI, including in-flight states. */
export type CheckStatus = 'pending' | 'running' | OutcomeStatus;

export type SystemId =
  | 'engine'
  | 'emissions'
  | 'battery'
  | 'identity'
  | 'gearbox'
  | 'abs'
  | 'brakes'
  | 'tyres'
  | 'oil';

export type CheckSource = 'generic' | 'profile' | 'manual';

export interface CheckOutcome {
  status: OutcomeStatus;
  /** One-line result for the check list, e.g. "P0171 System too lean (bank 1)". */
  summary: string;
  value?: number | string | boolean;
  unit?: string;
  dtcs?: string[];
}

/** Metadata about a check that is safe to send to the UI. */
export interface CheckInfo {
  id: string;
  system: SystemId;
  label: string;
  source: CheckSource;
  /** Request as shown to the user, e.g. "01 05" or "ATRV". */
  requestLabel?: string;
  /** Module name and id shown in the activity line, e.g. "Engine ECU (7E8)". */
  module?: string;
}

export interface CheckPlan extends CheckInfo {
  /** Command to send. Absent for manual checks. */
  request?: string;
  /** CAN request header (ATSH). Defaults to functional 7DF. */
  header?: string;
  timeoutMs?: number;
  /** Turns a successful reply into an outcome. */
  evaluate?: (reply: Extract<ParsedReply, { ok: true }>) => CheckOutcome;
  /** For adapter commands (AT…) the raw lines are evaluated instead. */
  evaluateRaw?: (lines: string[]) => CheckOutcome;
  /** Outcome for checks with no electronic source. */
  manual?: CheckOutcome;
}

export interface ScanSummary {
  total: number;
  completed: number;
  ok: number;
  fault: number;
  unsupported: number;
  no_response: number;
  manual: number;
}

export interface CheckResult extends CheckOutcome {
  checkId: string;
  durationMs: number;
  attempts: number;
}

export interface ScanResult {
  partial: boolean;
  reason?: 'cancelled' | 'disconnected' | 'error';
  adapter?: AdapterInfo;
  results: CheckResult[];
  summary: ScanSummary;
  startedAt: number;
  finishedAt: number;
}

export type ScanEvent =
  | { type: 'scan:connecting'; t: number }
  | { type: 'scan:connected'; t: number; adapter: AdapterInfo }
  | { type: 'scan:planned'; t: number; total: number; checks: CheckInfo[] }
  | { type: 'check:start'; t: number; checkId: string; attempt: number }
  | { type: 'check:result'; t: number; result: CheckResult }
  | { type: 'scan:done'; t: number; result: ScanResult }
  | { type: 'scan:error'; t: number; stage: 'connect' | 'run'; message: string };
