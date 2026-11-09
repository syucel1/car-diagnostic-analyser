import { useEffect, useMemo, useRef, useState } from 'react';
import { etaMs, type ScanView } from '../scan/progress';
import type { OutcomeStatus } from '../scan/types';
import type { Scenario } from '../transport/scenario';
import { formatDuration, OUTCOME_ORDER, STATUS, SYSTEM_LABEL } from './status';
import { useDemoScan } from './useScan';

interface Props {
  scenario: Scenario;
  onBack: () => void;
}

export function ScanScreen({ scenario, onBack }: Props) {
  const { view, start, stop } = useDemoScan(scenario);
  const [filter, setFilter] = useState<OutcomeStatus | null>(null);
  const now = useTicker(view.phase === 'running' || view.phase === 'connecting');

  return (
    <main className="scan">
      <TopBar view={view} vehicle={scenario.vehicle} onStop={stop} onBack={onBack} onRestart={start} />
      <ProgressPanel view={view} now={now} filter={filter} onFilter={setFilter} />
      {view.phase === 'done' && <Summary view={view} />}
      {view.phase === 'error' && (
        <div className="banner banner--error">
          Could not connect: {view.error}. Check the adapter and that the ignition is on.
        </div>
      )}
      <CheckList view={view} filter={filter} />
    </main>
  );
}

function TopBar(props: { view: ScanView; vehicle: string; onStop: () => void; onBack: () => void; onRestart: () => void }) {
  const { view } = props;
  const running = view.phase === 'running' || view.phase === 'connecting';
  return (
    <div className="topbar">
      <div className={`pill ${view.adapter ? 'pill--ok' : 'pill--idle'}`}>
        <span className="dot" />
        {view.adapter
          ? `${view.adapter.id} · ${view.adapter.voltage?.toFixed(1) ?? '–'} V`
          : view.phase === 'error'
            ? 'Not connected'
            : 'Connecting…'}
      </div>
      <span className="muted">{props.vehicle}</span>
      <span className="spacer" />
      {running ? (
        <button className="btn btn--stop" onClick={props.onStop}>
          Stop scan
        </button>
      ) : (
        <>
          <button className="btn btn--ghost" onClick={props.onBack}>
            Back
          </button>
          <button className="btn btn--blue" onClick={props.onRestart}>
            Run again
          </button>
        </>
      )}
    </div>
  );
}

function ProgressPanel(props: { view: ScanView; now: number; filter: OutcomeStatus | null; onFilter: (f: OutcomeStatus | null) => void }) {
  const { view, now } = props;
  const { total, summary } = view;
  const elapsed = view.startedAt ? (view.finishedAt ?? now) - view.startedAt : 0;
  const eta = etaMs(view);
  const current = view.current && view.checks.find((c) => c.id === view.current!.checkId);

  const headline =
    view.phase === 'connecting'
      ? 'Connecting to adapter…'
      : view.phase === 'running'
        ? `Scanning · ${summary.completed} of ${total} checks`
        : view.phase === 'done'
          ? view.result?.partial
            ? `Stopped · ${summary.completed} of ${total} checks`
            : `Scan complete · ${total} checks`
          : view.phase === 'error'
            ? 'Connection failed'
            : '';

  return (
    <section className="panel progress" aria-live="polite">
      <div className="progress__head">
        <h1>{headline}</h1>
        <span className="muted">
          {formatDuration(elapsed)} elapsed{eta !== undefined ? ` · ~${formatDuration(eta)} left` : ''}
        </span>
      </div>

      <div
        className="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={summary.completed}
        aria-label="Checks completed"
      >
        {total > 0 &&
          OUTCOME_ORDER.map((s) =>
            summary[s] ? (
              <div key={s} className={`bar__seg tone-${STATUS[s].tone}`} style={{ width: `${(summary[s] / total) * 100}%` }} />
            ) : null,
          )}
        {view.phase === 'running' && view.current && (
          <div className="bar__seg tone-running bar__seg--pulse" style={{ width: `${(1 / total) * 100}%` }} />
        )}
      </div>

      <div className="chips">
        {OUTCOME_ORDER.map((s) => (
          <button
            key={s}
            className={`chip tone-${STATUS[s].tone} ${props.filter === s ? 'chip--active' : ''}`}
            onClick={() => props.onFilter(props.filter === s ? null : s)}
            aria-pressed={props.filter === s}
          >
            {summary[s]} {STATUS[s].label.toLowerCase()}
          </button>
        ))}
      </div>

      <div className="activity">
        {current && view.current ? (
          <>
            → {current.module ?? 'Adapter'} · {current.requestLabel} {current.label}
            {view.current.attempt > 1 ? ` · retry ${view.current.attempt - 1}` : ''} · waiting {Math.max(0, now - view.current.since)} ms
          </>
        ) : view.phase === 'done' ? (
          <span className="muted">Finished in {formatDuration(elapsed)}.</span>
        ) : (
          <span className="muted">&nbsp;</span>
        )}
      </div>
    </section>
  );
}

function CheckList({ view, filter }: { view: ScanView; filter: OutcomeStatus | null }) {
  const runningRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    runningRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [view.current?.checkId]);

  const rows = useMemo(
    () => view.checks.filter((c) => !filter || view.status[c.id] === filter),
    [view.checks, view.status, filter],
  );
  if (!view.checks.length) return null;

  return (
    <section className="panel">
      <table className="checks">
        <thead>
          <tr>
            <th>System</th>
            <th>Check</th>
            <th>Source</th>
            <th className="right">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const status = view.status[c.id] ?? 'pending';
            const result = view.results[c.id];
            const meta = STATUS[status];
            return (
              <tr key={c.id} ref={status === 'running' ? runningRef : undefined} className={`row--${meta.tone}`}>
                <td>{SYSTEM_LABEL[c.system]}</td>
                <td>
                  {c.label}
                  {c.requestLabel && <span className="req"> ({c.requestLabel})</span>}
                </td>
                <td className="muted">{c.source}</td>
                <td className={`right tone-text-${meta.tone}`}>
                  <span aria-label={meta.label} title={meta.label}>
                    {meta.icon}
                  </span>{' '}
                  {result ? result.summary : status === 'running' ? 'querying…' : view.phase === 'done' ? 'not run' : ''}
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={4} className="muted">
                No checks with this result.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function Summary({ view }: { view: ScanView }) {
  const s = view.summary;
  const result = view.result;
  // Coverage counts checks with an electronic source, whatever their result.
  const electronicIds = view.checks.filter((c) => c.source !== 'manual' && view.results[c.id]).map((c) => c.id);
  const electronic = electronicIds.length;
  const answered = electronicIds.filter((id) => ['ok', 'fault'].includes(view.status[id] ?? '')).length;
  const faultSystems = [
    ...new Set(
      view.checks.filter((c) => view.status[c.id] === 'fault').map((c) => SYSTEM_LABEL[c.system].toLowerCase()),
    ),
  ];
  const manualTodo = view.checks.filter((c) => view.status[c.id] === 'manual').map((c) => c.label.toLowerCase());

  return (
    <>
      {result?.partial && (
        <div className="banner banner--warn">
          {result.reason === 'disconnected'
            ? `The adapter disconnected after ${s.completed} of ${s.total} checks.`
            : `Scan stopped after ${s.completed} of ${s.total} checks.`}{' '}
          This is a partial report: {s.total - s.completed} checks were not run.
        </div>
      )}
      <section className="tiles">
        <div className={`tile ${s.fault ? 'tile--fault' : 'tile--ok'}`}>
          <div className="tile__label">{s.fault ? 'Needs attention' : 'No faults reported'}</div>
          <div className="tile__value">
            {s.fault} fault{s.fault === 1 ? '' : 's'}
          </div>
          <div className="tile__note">{faultSystems.join(' · ') || 'in the checks that answered'}</div>
        </div>
        <div className="tile">
          <div className="tile__label">Coverage</div>
          <div className="tile__value">
            {answered} / {electronic}
          </div>
          <div className="tile__note">
            answered · {s.unsupported} unsupported · {s.no_response} no response
          </div>
        </div>
        <div className="tile tile--manual">
          <div className="tile__label">Manual inspection</div>
          <div className="tile__value">{s.manual} items</div>
          <div className="tile__note">{manualTodo.join(' · ') || 'nothing outstanding'}</div>
        </div>
      </section>
    </>
  );
}

/** Re-renders every 250 ms while active, for the elapsed timer and wait counter. */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return active ? now : Date.now();
}
