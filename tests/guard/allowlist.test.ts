import { describe, expect, it } from 'vitest';
import { assertAllowed, ForbiddenRequestError, isAllowed } from '../../src/guard/allowlist';

describe('read-only guard — allowed', () => {
  it.each([
    // adapter
    'ATZ', 'ATI', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATAT1', 'ATSP0', 'ATSP6', 'ATSPA6', 'ATDPN', 'ATRV',
    'ATST32', 'ATSH7E0', 'ATSH686AF1', 'ATSH18DB33F1', 'ATCRA7E8', 'ATCAF1', 'ATFCSH7E0', 'ATFCSD300000', 'ATFCSM1',
    'STI', 'STDI', 'at z', 'atsh 7e0',
    // OBD-II read services
    '0100', '0101', '010C', '01 0C 05 0D', '0202', '020C00', '03', '07', '0A', '0902', '090A', '0600',
    // UDS reads
    '1902FF', '190A', '3E00', '3E80', '1001',
  ])('%s', (cmd) => {
    expect(() => assertAllowed(cmd)).not.toThrow();
  });

  it('normalises spaces and case', () => {
    expect(assertAllowed(' 01 0c ')).toBe('010C');
  });

  it('allows UDS 22 only for DIDs in the active profile', () => {
    expect(isAllowed('22F190')).toBe(false);
    expect(isAllowed('22F190', { allowedDids: new Set(['F190']) })).toBe(true);
    expect(isAllowed('22F190F18C', { allowedDids: new Set(['F190']) })).toBe(false);
  });
});

describe('read-only guard — blocked', () => {
  it.each([
    ['04', 'clears fault codes'],
    ['08', 'on-board tests'],
    ['1101', 'resets an ECU'],
    ['14FFFFFF', 'clears diagnostic information'],
    ['2701', 'security access'],
    ['280301', 'silence modules'],
    ['2EF19000', 'writes data'],
    ['2F', 'actuators'],
    ['310101', 'routines'],
    ['3400', 'download'],
    ['3500', 'upload'],
    ['3601', 'transfers data'],
    ['37', 'ends a transfer'],
    ['3D', 'writes memory'],
    ['3B01', 'writes data'],
    ['3001', 'inputs/outputs'],
    ['8502', 'stops modules recording'],
    ['1002', 'default diagnostic session'],
    ['1003', 'default diagnostic session'],
    ['1914', 'sub-function'],
    ['19', 'sub-function'],
    ['3E01', 'TesterPresent'],
    ['01', 'missing PID'],
    ['0300', 'unexpected data'],
    ['0100010203040506', 'too many PIDs'],
    ['22F1', 'malformed'],
    ['105', 'hex bytes'],
    ['01ZZ', 'hex bytes'],
    ['21', 'not on the allowlist'],
    ['1A90', 'not on the allowlist'],
    ['ATMA', 'monitors the bus'],
    ['STMA', 'monitors the bus'],
    ['ATPP0CSV23', 'reconfigures the adapter'],
    ['ATBRD23', 'reconfigures the adapter'],
    ['STPBR115200', 'reconfigures the adapter'],
    ['ATD', 'not on the allowlist'],
    ['ATSHXYZ', 'invalid argument'],
    ['ATST', 'invalid argument'],
    ['ATSPD', 'invalid argument'],
    ['', 'empty'],
  ])('%s (%s)', (cmd, reason) => {
    expect(() => assertAllowed(cmd)).toThrow(ForbiddenRequestError);
    expect(() => assertAllowed(cmd)).toThrow(reason);
  });
});

describe('read-only guard — fuzzing', () => {
  // Deterministic PRNG so failures are reproducible.
  function rng(seed: number) {
    return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  }

  it('never allows a hex request whose service is not a read service', () => {
    const rand = rng(42);
    const readServices = new Set(['01', '02', '03', '06', '07', '09', '0A', '19', '3E', '10']);
    for (let i = 0; i < 20_000; i++) {
      const len = 1 + Math.floor(rand() * 8);
      const cmd = Array.from({ length: len }, () => Math.floor(rand() * 256).toString(16).padStart(2, '0').toUpperCase()).join('');
      if (isAllowed(cmd)) {
        expect(readServices.has(cmd.slice(0, 2)), cmd).toBe(true);
        if (cmd.startsWith('10')) expect(cmd).toBe('1001');
      }
    }
  });

  it('never allows random adapter commands outside the allowlist shapes', () => {
    const rand = rng(7);
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@';
    for (let i = 0; i < 20_000; i++) {
      const len = 1 + Math.floor(rand() * 6);
      const cmd = 'AT' + Array.from({ length: len }, () => letters[Math.floor(rand() * letters.length)]).join('');
      if (isAllowed(cmd)) {
        expect(cmd, cmd).toMatch(/^AT(Z|WS|I|@1|[ELSH][01]|DPN?|AT[012]|CAF[01]|FCSM[012]|RV|SPA?[0-9A-C]|ST[0-9A-F]{2}|SH[0-9A-F]{3}|CRA[0-9A-F]{3}|FCSH[0-9A-F]{3}|FCSD([0-9A-F]{2}){1,2})$/);
      }
    }
  });
});
