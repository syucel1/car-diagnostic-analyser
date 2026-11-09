import { parseScenario, type Scenario } from '../../src/transport/scenario';
import leanJson from './lean-engine-low-tyre.json';
import healthyJson from './healthy.json';
import flakyJson from './flaky-adapter.json';

export const leanEngine = parseScenario(leanJson);
export const healthy = parseScenario(healthyJson);
export const flakyAdapter = parseScenario(flakyJson);

export interface ScenarioEntry {
  id: string;
  scenario: Scenario;
}

/** Scenarios offered on the demo-car card, in display order. */
export const scenarios: ScenarioEntry[] = [
  { id: 'lean-engine-low-tyre', scenario: leanEngine },
  { id: 'healthy', scenario: healthy },
  { id: 'flaky-adapter', scenario: flakyAdapter },
];
