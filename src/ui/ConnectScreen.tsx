import { useState } from 'react';
import { scenarios } from '../../sim/scenarios';

interface Props {
  onRunDemo: (scenarioId: string) => void;
}

export function ConnectScreen({ onRunDemo }: Props) {
  const [scenarioId, setScenarioId] = useState(scenarios[0]!.id);
  const selected = scenarios.find((s) => s.id === scenarioId)!;
  const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

  return (
    <main className="connect">
      <section className="card card--real">
        <h2>Scan my car</h2>
        <p className="muted">USB OBD-II adapter · Chrome or Edge on desktop</p>
        <ol className="steps">
          <li>Park, handbrake on, ignition on (engine off or idling)</li>
          <li>Plug the adapter into the socket under the dashboard</li>
          <li>Connect USB, then pick its COM port</li>
        </ol>
        <button className="btn btn--green" disabled title="USB connection arrives in phase 2">
          Choose adapter…
        </button>
        <p className="note">
          {hasWebSerial
            ? 'Your browser supports Web Serial. USB scanning arrives in the next phase.'
            : 'This browser has no Web Serial. Use Chrome or Edge on a desktop for real scans.'}
        </p>
        <p className="note">Read-only: this app cannot clear codes, run tests or change settings.</p>
      </section>

      <section className="card">
        <h2>Try the demo car</h2>
        <p className="muted">No hardware needed · simulated ECU replies</p>
        <label className="field">
          <span>Scenario</span>
          <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.scenario.name}
              </option>
            ))}
          </select>
        </label>
        <p className="note scenario-desc">{selected.scenario.description}</p>
        <button className="btn btn--blue" onClick={() => onRunDemo(scenarioId)}>
          Run demo scan
        </button>
        <p className="note">Uses exactly the same scan engine; only the adapter is simulated.</p>
      </section>
    </main>
  );
}
