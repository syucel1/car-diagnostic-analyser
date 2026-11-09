import { SimulatorTransport } from '../src/transport/simulator';
import type { Scenario } from '../src/transport/scenario';

/** A fake clock advanced by the simulator's sleeps, so tests run instantly but durations are realistic. */
export function fakeTime() {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

export function simulator(scenario: Scenario, clock = fakeTime()) {
  return { sim: new SimulatorTransport(scenario, { sleep: clock.sleep, random: () => 0.5 }), clock };
}
