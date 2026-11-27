import { describe, expect, it } from 'vitest';
import { framingOf, isCan, protocolFromDpn } from '../../src/protocol/protocols';

describe('protocols', () => {
  it('reads ATDPN replies', () => {
    expect(protocolFromDpn('A6')?.name).toBe('ISO 15765-4 CAN (11-bit, 500 kbaud)');
    expect(protocolFromDpn('3')?.framing).toBe('kline');
    expect(protocolFromDpn('A0')).toBeUndefined();
    expect(protocolFromDpn('?')).toBeUndefined();
  });

  it('classifies framing', () => {
    expect(framingOf('6')).toBe('can11');
    expect(framingOf('9')).toBe('can29');
    expect(framingOf('5')).toBe('kline');
    expect(framingOf(undefined)).toBe('can11');
    expect(isCan('8')).toBe(true);
    expect(isCan('2')).toBe(false);
  });
});
