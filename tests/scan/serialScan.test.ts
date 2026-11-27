import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../src/scan/demoPlan';
import { runScan } from '../../src/scan/runner';
import type { ScanEvent } from '../../src/scan/types';
import { ElmSerialTransport } from '../../src/transport/serial';
import { defaultResponder, FakeElmPort } from '../fakeSerialPort';

describe('real-car scan over the serial transport', () => {
  it('runs the generic plan end to end', async () => {
    const port = new FakeElmPort();
    const t = new ElmSerialTransport(port, { resetTimeoutMs: 100 });
    const result = await runScan(t, buildPlan(), { timeoutMs: 300 });
    expect(result.partial).toBe(false);
    expect(result.results.find((r) => r.checkId === 'engine.coolant')).toMatchObject({ status: 'ok', summary: '88 °C' });
    expect(result.results.find((r) => r.checkId === 'engine.rpm')).toMatchObject({ status: 'unsupported' });
    expect(result.results.find((r) => r.checkId === 'battery.socket')).toMatchObject({ status: 'ok', summary: '12.4 V' });
    expect(port.isOpen).toBe(false); // closed after the scan
  });

  it('produces a partial report when the cable is pulled mid-scan', async () => {
    let requests = 0;
    const port = new FakeElmPort({
      respond: (c) => {
        if (/^0[1-9A]/.test(c) && ++requests === 6) return null; // hang so the unplug lands mid-request
        return defaultResponder(c);
      },
    });
    const t = new ElmSerialTransport(port, { resetTimeoutMs: 100 });
    const events: ScanEvent[] = [];
    const done = runScan(t, buildPlan(), {
      timeoutMs: 2000,
      onEvent: (e) => {
        events.push(e);
        if (e.type === 'check:start' && requests >= 6) setTimeout(() => port.unplug(), 5);
      },
    });
    const result = await done;
    expect(result).toMatchObject({ partial: true, reason: 'disconnected' });
    expect(result.summary.completed).toBeLessThan(buildPlan().length);
    expect(events.some((e) => e.type === 'scan:error' && e.stage === 'run')).toBe(true);
  });
});
