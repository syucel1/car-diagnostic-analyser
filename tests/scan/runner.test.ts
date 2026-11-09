import { describe, expect, it } from 'vitest';
import { runScan } from '../../src/scan/runner';
import { buildDemoPlan } from '../../src/scan/demoPlan';
import type { ScanEvent } from '../../src/scan/types';
import { flakyAdapter as flaky, healthy, leanEngine as lean } from '../../sim/scenarios';
import type { Scenario } from '../../src/transport/scenario';
import { simulator } from '../helpers';

async function scan(scenario: Scenario, signal?: AbortSignal) {
  const { sim, clock } = simulator(scenario);
  const events: ScanEvent[] = [];
  const plan = buildDemoPlan(scenario.manual);
  const result = await runScan(sim, plan, { now: clock.now, onEvent: (e) => events.push(e), signal });
  return { result, events, plan, sim };
}

const byId = (r: Awaited<ReturnType<typeof scan>>['result'], id: string) => r.results.find((x) => x.checkId === id)!;

describe('runScan — lean engine scenario', () => {
  it('plans at least 20 checks and completes all of them', async () => {
    const { result, plan } = await scan(lean);
    expect(plan.length).toBeGreaterThanOrEqual(20);
    expect(result.partial).toBe(false);
    expect(result.summary.completed).toBe(plan.length);
    const { ok, fault, unsupported, no_response, manual } = result.summary;
    expect(ok + fault + unsupported + no_response + manual).toBe(plan.length);
  });

  it('progress only goes up and the total is known before the first check', async () => {
    const { events, plan } = await scan(lean);
    const plannedAt = events.findIndex((e) => e.type === 'scan:planned');
    const firstStart = events.findIndex((e) => e.type === 'check:start');
    expect(plannedAt).toBeGreaterThan(-1);
    expect(plannedAt).toBeLessThan(firstStart);
    const planned = events[plannedAt] as Extract<ScanEvent, { type: 'scan:planned' }>;
    expect(planned.total).toBe(plan.length);
    const resultIds = events.filter((e) => e.type === 'check:result').map((e) => (e as any).result.checkId);
    expect(new Set(resultIds).size).toBe(resultIds.length); // each check reported exactly once
    expect(events.at(-1)?.type).toBe('scan:done');
  });

  it('reports the expected outcomes', async () => {
    const { result } = await scan(lean);
    expect(byId(result, 'engine.mil')).toMatchObject({ status: 'fault', summary: 'ON · 1 emission code' });
    expect(byId(result, 'engine.dtc.stored')).toMatchObject({ status: 'fault', dtcs: ['P0171'] });
    expect(byId(result, 'engine.dtc.pending')).toMatchObject({ status: 'ok', summary: 'None' });
    expect(byId(result, 'engine.coolant')).toMatchObject({ status: 'ok', summary: '88 °C' });
    expect(byId(result, 'engine.rpm')).toMatchObject({ status: 'ok', summary: '812 rpm' });
    expect(byId(result, 'engine.ltft1')).toMatchObject({ status: 'fault', summary: '+14.1 % · outside ±10 %' });
    expect(byId(result, 'engine.oiltemp')).toMatchObject({ status: 'unsupported' });
    expect(byId(result, 'emissions.readiness').summary).toBe('6 of 7 complete · Catalyst incomplete');
    expect(byId(result, 'emissions.standard').summary).toBe('EOBD (Europe)');
    expect(byId(result, 'battery.socket')).toMatchObject({ status: 'ok', summary: '14.1 V · charging' });
    expect(byId(result, 'gearbox.dtc')).toMatchObject({ status: 'ok' });
    expect(byId(result, 'tyres.pressure')).toMatchObject({ status: 'fault', summary: 'FR 1.8 bar · low (recommended 2.2)' });
    expect(byId(result, 'brakes.pads')).toMatchObject({ status: 'manual' });
  });

  it('keeps "no response" distinct from "no faults" (ABS offline, retried once)', async () => {
    const { result } = await scan(lean);
    expect(byId(result, 'abs.dtc')).toMatchObject({ status: 'no_response', attempts: 2 });
  });
});

describe('runScan — healthy scenario', () => {
  it('has no faults and ABS answers with no codes', async () => {
    const { result } = await scan(healthy);
    expect(result.summary.fault).toBe(0);
    expect(result.summary.no_response).toBe(0);
    expect(byId(result, 'abs.dtc')).toMatchObject({ status: 'ok', summary: 'Checked · no faults reported' });
  });
});

describe('runScan — flaky adapter', () => {
  it('recovers from a timeout and a bus error by retrying, then stops on disconnect with a partial report', async () => {
    const { result, events, plan } = await scan(flaky);
    expect(result.partial).toBe(true);
    expect(result.reason).toBe('disconnected');
    expect(result.summary.completed).toBeLessThan(plan.length);
    expect(result.results.filter((r) => r.attempts === 2).length).toBeGreaterThanOrEqual(2);
    expect(result.results.every((r) => r.status !== 'no_response')).toBe(true);
    expect(events.some((e) => e.type === 'scan:error')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'scan:done' });
  });
});

describe('runScan — cancel', () => {
  it('stops between checks and returns what it has', async () => {
    const controller = new AbortController();
    const { sim, clock } = simulator(lean);
    let results = 0;
    const r = await runScan(sim, buildDemoPlan(), {
      now: clock.now,
      signal: controller.signal,
      onEvent: (e) => {
        if (e.type === 'check:result' && ++results === 5) controller.abort();
      },
    });
    expect(r).toMatchObject({ partial: true, reason: 'cancelled' });
    expect(r.summary.completed).toBe(5);
  });
});

describe('runScan — connection failure', () => {
  it('rejects and emits a connect error', async () => {
    const { sim, clock } = simulator(lean);
    sim.disconnect();
    const events: ScanEvent[] = [];
    await expect(runScan(sim, buildDemoPlan(), { now: clock.now, onEvent: (e) => events.push(e) })).rejects.toThrow();
    expect(events.at(-1)).toMatchObject({ type: 'scan:error', stage: 'connect' });
  });
});
