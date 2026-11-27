import type { ScanView } from '../scan/progress';
import type { LogEntry } from '../transport/types';

/**
 * Plain-text session log: every command and reply with timestamps. Useful for
 * debugging a real car, and the raw material for replay scenarios later.
 * The VIN is never written here (it's only read from phase 3).
 */
export function formatSessionLog(entries: LogEntry[], view: ScanView, sourceLabel: string): string {
  const t0 = entries[0]?.t ?? 0;
  const header = [
    '# car-diagnostic-analyser session log',
    `# date: ${new Date(t0 || Date.now()).toISOString()}`,
    `# source: ${sourceLabel}`,
    view.adapter ? `# adapter: ${view.adapter.id}${view.adapter.voltage !== undefined ? ` · ${view.adapter.voltage} V` : ''}` : '# adapter: not identified',
    view.adapter?.protocolName ? `# protocol: ${view.adapter.protocolName}` : undefined,
    `# checks: ${view.summary.completed} of ${view.total}${view.result?.partial ? ' (partial)' : ''}`,
    '#',
    '# time(s)  dir   text',
  ].filter((l): l is string => l !== undefined);

  const lines = entries.map((e) => {
    const secs = ((e.t - t0) / 1000).toFixed(3).padStart(8);
    const dir = e.dir === 'tx' ? 'TX  ' : e.dir === 'rx' ? '  RX' : '----';
    return `${secs}  ${dir}  ${e.text}`;
  });
  return [...header, ...lines, ''].join('\n');
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
