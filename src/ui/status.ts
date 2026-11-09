import type { CheckStatus, SystemId } from '../scan/types';

/** Single source of status wording, icons and colours (design/ui-screens.md). */
export const STATUS: Record<CheckStatus, { label: string; icon: string; tone: string }> = {
  pending: { label: 'Pending', icon: '○', tone: 'pending' },
  running: { label: 'Querying…', icon: '●', tone: 'running' },
  ok: { label: 'Reading received', icon: '✓', tone: 'ok' },
  fault: { label: 'Fault reported', icon: '⚠', tone: 'fault' },
  unsupported: { label: 'Unsupported', icon: '—', tone: 'unsupported' },
  no_response: { label: 'No response', icon: '✕', tone: 'noresp' },
  manual: { label: 'Manual inspection', icon: '◆', tone: 'manual' },
};

/** Order of the outcome chips and progress-bar segments. */
export const OUTCOME_ORDER = ['ok', 'fault', 'unsupported', 'no_response', 'manual'] as const;

export const SYSTEM_LABEL: Record<SystemId, string> = {
  engine: 'Engine',
  emissions: 'Emissions',
  battery: 'Battery',
  identity: 'Vehicle',
  gearbox: 'Gearbox',
  abs: 'ABS',
  brakes: 'Brakes',
  tyres: 'Tyres',
  oil: 'Oil',
};

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
