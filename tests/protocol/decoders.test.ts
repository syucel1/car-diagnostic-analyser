import { describe, expect, it } from 'vitest';
import { decodeDtc, decodeDtcList, decodeMonitorStatus, decodePid } from '../../src/protocol/decoders';

describe('decodePid', () => {
  it.each([
    [0x05, [0x80], 88, '°C'],
    [0x0c, [0x0c, 0xb0], 812, 'rpm'],
    [0x07, [0x92], 14.0625, '%'],
    [0x06, [0x80], 0, '%'],
    [0x06, [0x00], -100, '%'],
    [0x10, [0x01, 0x40], 3.2, 'g/s'],
    [0x42, [0x37, 0x14], 14.1, 'V'],
    [0x21, [0x00, 0xd4], 212, 'km'],
    [0x04, [0xff], 100, '%'],
  ])('PID %i from %j → %d %s', (pid, data, value, unit) => {
    const r = decodePid(pid, data);
    expect(r.value).toBeCloseTo(value, 4);
    expect(r.unit).toBe(unit);
  });

  it('rejects short data', () => {
    expect(() => decodePid(0x0c, [0x0c])).toThrow();
  });
});

describe('decodeDtc', () => {
  it.each([
    [0x01, 0x71, 'P0171'],
    [0x04, 0x20, 'P0420'],
    [0x41, 0x23, 'C0123'],
    [0x92, 0x34, 'B1234'],
    [0xc1, 0x00, 'U0100'],
    [0x3f, 0xff, 'P3FFF'],
  ])('%i %i → %s', (hi, lo, code) => {
    expect(decodeDtc(hi, lo)).toBe(code);
  });

  it('reads the CAN count byte and skips padding', () => {
    expect(decodeDtcList([0x02, 0x01, 0x71, 0x04, 0x20], true)).toEqual(['P0171', 'P0420']);
    expect(decodeDtcList([0x00], true)).toEqual([]);
  });

  it('handles non-CAN 3-per-frame padding', () => {
    expect(decodeDtcList([0x01, 0x71, 0x00, 0x00, 0x00, 0x00], false)).toEqual(['P0171']);
  });
});

describe('decodeMonitorStatus', () => {
  it('decodes MIL, count and petrol monitors', () => {
    const m = decodeMonitorStatus([0x81, 0x07, 0x65, 0x01]);
    expect(m.milOn).toBe(true);
    expect(m.dtcCount).toBe(1);
    expect(m.diesel).toBe(false);
    expect(m.monitors.map((x) => x.name)).toEqual([
      'Misfire', 'Fuel system', 'Components', 'Catalyst', 'EVAP system', 'O₂ sensor', 'O₂ sensor heater',
    ]);
    expect(m.monitors.filter((x) => !x.ready).map((x) => x.name)).toEqual(['Catalyst']);
  });

  it('uses the diesel monitor list when bit B3 is set', () => {
    const m = decodeMonitorStatus([0x00, 0x0f, 0x40, 0x40]);
    expect(m.diesel).toBe(true);
    expect(m.monitors.find((x) => x.name === 'Particulate filter')).toEqual({ name: 'Particulate filter', ready: false });
  });
});
