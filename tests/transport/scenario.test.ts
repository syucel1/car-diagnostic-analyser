import { describe, expect, it } from 'vitest';
import { parseScenario } from '../../src/transport/scenario';
import { scenarios } from '../../sim/scenarios';

describe('parseScenario', () => {
  it('accepts every bundled scenario', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(3);
  });

  const base = {
    name: 'x', vehicle: 'y', protocol: '6',
    adapter: { ati: 'ELM327', voltage: '12.6V', latencyMs: [10, 20] },
    ecus: { '7E8': { responses: { '0105': '41 05 80' } } },
  };

  it('accepts a minimal scenario', () => {
    expect(parseScenario(base).name).toBe('x');
  });

  it.each([
    ['bad latency', { ...base, adapter: { ...base.adapter, latencyMs: [20, 10] } }, 'latencyMs'],
    ['bad ECU id', { ...base, ecus: { '7E': { responses: {} } } }, '3 hex digits'],
    ['spaced request', { ...base, ecus: { '7E8': { responses: { '01 05': '41 05 80' } } } }, 'hex without spaces'],
    ['bad reply', { ...base, ecus: { '7E8': { responses: { '0105': '41058' } } } }, 'space-separated'],
  ])('rejects %s', (_n, raw, msg) => {
    expect(() => parseScenario(raw)).toThrow(msg);
  });
});
