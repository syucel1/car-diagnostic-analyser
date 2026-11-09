import { describe, expect, it } from 'vitest';
import { runScan } from '../../src/scan/runner';
import { buildDemoPlan } from '../../src/scan/demoPlan';
import { etaMs, initialView, reduceScan, type ScanView } from '../../src/scan/progress';
import { leanEngine as lean } from '../../sim/scenarios';
import { simulator } from '../helpers';

describe('reduceScan', () => {
  it('builds the same counts as the runner, with a monotonic counter', async () => {
    const { sim, clock } = simulator(lean);
    let view: ScanView = initialView;
    const completed: number[] = [];
    let sawEta = false;
    const result = await runScan(sim, buildDemoPlan(lean.manual), {
      now: clock.now,
      onEvent: (e) => {
        view = reduceScan(view, e);
        completed.push(view.summary.completed);
        if (etaMs(view) !== undefined) sawEta = true;
      },
    });
    expect(completed).toEqual([...completed].sort((a, b) => a - b));
    expect(view.phase).toBe('done');
    expect(view.summary).toEqual(result.summary);
    expect(Object.values(view.status).every((s) => s !== 'pending' && s !== 'running')).toBe(true);
    expect(sawEta).toBe(true);
  });

  it('marks a check running on start', () => {
    let v = reduceScan(initialView, { type: 'scan:connecting', t: 0 });
    v = reduceScan(v, {
      type: 'scan:planned', t: 1, total: 1,
      checks: [{ id: 'a', system: 'engine', label: 'A', source: 'generic' }],
    });
    v = reduceScan(v, { type: 'check:start', t: 2, checkId: 'a', attempt: 1 });
    expect(v.status.a).toBe('running');
    expect(v.current).toEqual({ checkId: 'a', attempt: 1, since: 2 });
  });
});

describe('reduceScan — partial scans', () => {
  it('leaves no check "running" after a disconnect', async () => {
    const { flakyAdapter } = await import('../../sim/scenarios');
    const { sim, clock } = simulator(flakyAdapter);
    let view: ScanView = initialView;
    await runScan(sim, buildDemoPlan(flakyAdapter.manual), { now: clock.now, onEvent: (e) => (view = reduceScan(view, e)) });
    expect(view.result?.partial).toBe(true);
    expect(Object.values(view.status)).not.toContain('running');
    expect(Object.values(view.status)).toContain('pending');
  });
});
