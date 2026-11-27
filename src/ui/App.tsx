import { useState } from 'react';
import { scenarios } from '../../sim/scenarios';
import { describePort } from '../transport/webSerial';
import { ConnectScreen } from './ConnectScreen';
import { ScanScreen } from './ScanScreen';
import type { ScanSource } from './useScan';

type Screen = { name: 'connect' } | { name: 'scan'; source: ScanSource; key: number };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'connect' });
  const [runs, setRuns] = useState(0);
  const back = () => setScreen({ name: 'connect' });
  const scan = (source: ScanSource) => {
    setRuns((n) => n + 1);
    setScreen({ name: 'scan', source, key: runs + 1 });
  };

  return (
    <div className="app">
      <header className="appbar">
        <button className="brand" onClick={back}>
          car-diagnostic-analyser
        </button>
        <span className="muted">read-only · v0.0.2 · phase 2 preview</span>
      </header>
      {screen.name === 'scan' ? (
        <ScanScreen key={screen.key} source={screen.source} onBack={back} />
      ) : (
        <ConnectScreen
          onRunDemo={(id) => {
            const entry = scenarios.find((s) => s.id === id);
            if (entry) scan({ kind: 'demo', scenario: entry.scenario });
          }}
          onConnect={(port) => scan({ kind: 'serial', port, label: describePort(port) })}
        />
      )}
    </div>
  );
}
