import { describe, expect, it } from 'vitest';
import { ForbiddenRequestError } from '../../src/guard/allowlist';
import { SimulatorTransport } from '../../src/transport/simulator';
import { DisconnectedError, TimeoutError } from '../../src/transport/types';
import { leanEngine as lean, ignitionOff } from '../../sim/scenarios';
import { simulator } from '../helpers';

const scenario = lean;

describe('SimulatorTransport', () => {
  it('runs the shared init sequence and reports adapter, voltage and protocol', async () => {
    const { sim } = simulator(scenario);
    expect(await sim.open()).toEqual({
      id: 'ELM327 v1.4b (simulated)',
      voltage: 14.1,
      vehicleResponding: true,
      protocol: '6',
      protocolName: 'ISO 15765-4 CAN (11-bit, 500 kbaud)',
    });
    expect(sim.sent).toEqual(['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATAT1', 'ATSP0', 'ATI', 'ATRV', '0100', 'ATDPN']);
  });

  it('reports a car that is not responding', async () => {
    const { sim } = simulator(ignitionOff);
    expect(await sim.open()).toMatchObject({ vehicleResponding: false });
    expect(await sim.send('0105', 1000)).toEqual(['SEARCHING...', 'UNABLE TO CONNECT']);
  });

  it('answers with headers and a length byte (spaces off after init)', async () => {
    const { sim } = simulator(scenario);
    await sim.open();
    expect(await sim.send('01 05', 1000)).toEqual(['7E803410580']);
  });

  it('lets every OBD ECU answer a functional request', async () => {
    const { sim } = simulator(scenario);
    await sim.open();
    expect(await sim.send('03', 1000)).toEqual(['7E80443010171', '7E9024300']);
  });

  it('routes physical requests to one ECU', async () => {
    const { sim } = simulator(scenario);
    await sim.open();
    await sim.send('ATSH7E1', 1000);
    expect(await sim.send('03', 1000)).toEqual(['7E9024300']);
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
    // Request 1 is the 0100 probe during open().
    const { sim } = simulator({
      ...scenario,
      faults: [
        { after: 2, type: 'busError' },
        { after: 4, type: 'disconnect' },
      ],
    });
    let disconnects = 0;
    sim.onDisconnect(() => disconnects++);
    await sim.open();
    expect(await sim.send('0105', 1000)).toEqual(['CAN ERROR']);
    expect(await sim.send('0105', 1000)).toEqual(['7E803410580']);
    await expect(sim.send('0105', 1000)).rejects.toBeInstanceOf(DisconnectedError);
    expect(disconnects).toBe(1);
    await expect(sim.send('0105', 1000)).rejects.toBeInstanceOf(DisconnectedError);
  });

  it('refuses forbidden commands before anything is sent', async () => {
    const { sim } = simulator(scenario);
    await sim.open();
    const before = [...sim.sent];
    for (const cmd of ['04', '14FFFFFF', '2EF19000', '310101', '1101', '2701', '1003', 'ATMA']) {
      await expect(sim.send(cmd, 1000)).rejects.toBeInstanceOf(ForbiddenRequestError);
    }
    expect(sim.sent).toEqual(before);
  });

  it('writes a session log', async () => {
    const log: string[] = [];
    const sim = new SimulatorTransport(scenario, { sleep: async () => {}, onLog: (e) => log.push(`${e.dir} ${e.text}`) });
    await sim.open();
    expect(log).toContain('tx 0100');
    expect(log).toContain('rx 7E8064100BE3FA813');
  });
});
