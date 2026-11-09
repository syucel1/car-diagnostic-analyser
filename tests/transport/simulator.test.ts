import { describe, expect, it } from 'vitest';
import { DisconnectedError, TimeoutError } from '../../src/transport/types';
import { leanEngine as lean } from '../../sim/scenarios';
import { simulator } from '../helpers';

const scenario = lean;

describe('SimulatorTransport', () => {
  it('runs the init sequence and reports adapter + voltage', async () => {
    const { sim } = simulator(scenario);
    expect(await sim.open()).toEqual({ id: 'ELM327 v1.4b (simulated)', voltage: 14.1 });
    expect(sim.sent.slice(0, 2)).toEqual(['ATZ', 'ATE0']);
  });

  it('answers with headers and a length byte', async () => {
    const { sim } = simulator(scenario);
    await sim.open();
    expect(await sim.send('01 05', 1000)).toEqual(['7E8 03 41 05 80']);
  });

  it('lets every OBD ECU answer a functional request', async () => {
    const { sim } = simulator(scenario);
    await sim.open();
    expect(await sim.send('03', 1000)).toEqual(['7E8 04 43 01 01 71', '7E9 02 43 00']);
  });

  it('routes physical requests to one ECU', async () => {
    const { sim } = simulator(scenario);
    await sim.open();
    await sim.send('ATSH7E1', 1000);
    expect(await sim.send('03', 1000)).toEqual(['7E9 02 43 00']);
  });

  it('returns NO DATA for unknown requests', async () => {
    const { sim } = simulator(scenario);
    await sim.open();
    expect(await sim.send('015C', 1000)).toEqual(['NO DATA']);
  });

  it('times out for a module that never answers, after the full timeout', async () => {
    const { sim, clock } = simulator(scenario);
    await sim.open();
    await sim.send('ATSH7B0', 1000);
    const t0 = clock.now();
    await expect(sim.send('1902FF', 2000)).rejects.toBeInstanceOf(TimeoutError);
    expect(clock.now() - t0).toBe(2000);
  });

  it('injects faults and disconnects', async () => {
    const { sim } = simulator({
      ...scenario,
      faults: [
        { after: 1, type: 'busError' },
        { after: 3, type: 'disconnect' },
      ],
    });
    let disconnects = 0;
    sim.onDisconnect(() => disconnects++);
    await sim.open();
    expect(await sim.send('0105', 1000)).toEqual(['CAN ERROR']);
    expect(await sim.send('0105', 1000)).toEqual(['7E8 03 41 05 80']);
    await expect(sim.send('0105', 1000)).rejects.toBeInstanceOf(DisconnectedError);
    expect(disconnects).toBe(1);
    await expect(sim.send('0105', 1000)).rejects.toBeInstanceOf(DisconnectedError);
  });
});
