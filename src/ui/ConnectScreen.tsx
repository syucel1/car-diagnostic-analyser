import { useEffect, useState } from 'react';
import { scenarios } from '../../sim/scenarios';
import { describePort, getSerial, type SerialPortLike } from '../transport/webSerial';

interface Props {
  onRunDemo: (scenarioId: string) => void;
  onConnect: (port: SerialPortLike) => void;
}

export function ConnectScreen({ onRunDemo, onConnect }: Props) {
  const [scenarioId, setScenarioId] = useState(scenarios[0]!.id);
  const selected = scenarios.find((s) => s.id === scenarioId)!;
  const serial = getSerial();
  const [safe, setSafe] = useState(false);
  const [error, setError] = useState<string>();
  const [knownPorts, setKnownPorts] = useState<SerialPortLike[]>([]);

  useEffect(() => {
    // Ports the user already allowed for this site can be reopened without the picker.
    serial
      ?.getPorts()
      .then(setKnownPorts)
      .catch(() => {});
  }, [serial]);

  async function choosePort() {
    setError(undefined);
    try {
      const port = await serial!.requestPort();
      onConnect(port);
    } catch (err) {
      // NotFoundError = the user closed the picker without choosing.
      if (err instanceof Error && err.name !== 'NotFoundError') setError(err.message);
    }
  }

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

        {serial ? (
          <>
            <label className="check">
              <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} />
              <span>The car is parked with the handbrake on, and I won't drive while scanning</span>
            </label>
            <button className="btn btn--green" disabled={!safe} onClick={choosePort}>
              Choose adapter…
            </button>
            {knownPorts.length > 0 && (
              <div className="known">
                <span className="note">Previously used:</span>
                {knownPorts.map((p, i) => (
                  <button key={i} className="btn btn--ghost btn--small" disabled={!safe} onClick={() => onConnect(p)}>
                    {describePort(p)}
                  </button>
                ))}
              </div>
            )}
            {error && <p className="note note--error">{error}</p>}
          </>
        ) : (
          <p className="banner banner--warn">
            This browser can't talk to USB adapters. Use Chrome or Edge on a desktop computer (the page must be served
            over https or from localhost). The demo car works here.
          </p>
        )}
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
