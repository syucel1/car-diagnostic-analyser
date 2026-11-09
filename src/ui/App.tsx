import { useState } from 'react';
import { scenarios } from '../../sim/scenarios';
import { ConnectScreen } from './ConnectScreen';
import { ScanScreen } from './ScanScreen';

type Screen = { name: 'connect' } | { name: 'scan'; scenarioId: string };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'connect' });
  const scenario = screen.name === 'scan' ? scenarios.find((s) => s.id === screen.scenarioId)?.scenario : undefined;

  return (
    <div className="app">
      <header className="appbar">
        <button className="brand" onClick={() => setScreen({ name: 'connect' })}>
          car-diagnostic-analyser
        </button>
        <span className="muted">read-only · v0.0.1 · phase 1 preview</span>
      </header>
      {scenario ? (
        <ScanScreen key={screen.name === 'scan' ? screen.scenarioId : ''} scenario={scenario} onBack={() => setScreen({ name: 'connect' })} />
      ) : (
        <ConnectScreen onRunDemo={(scenarioId) => setScreen({ name: 'scan', scenarioId })} />
      )}
    </div>
  );
}
