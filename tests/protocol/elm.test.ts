import { describe, expect, it } from 'vitest';
import { parseReply } from '../../src/protocol/elm';

describe('parseReply', () => {
  it('parses a single-frame reply with spaces', () => {
    expect(parseReply(['7E8 03 41 05 80'])).toEqual({ ok: true, replies: [{ ecu: '7E8', bytes: [0x41, 0x05, 0x80] }] });
  });

  it('parses without spaces and ignores trailing padding', () => {
    expect(parseReply(['7E803410580AAAAAAAA'])).toEqual({ ok: true, replies: [{ ecu: '7E8', bytes: [0x41, 0x05, 0x80] }] });
  });

  it('keeps one entry per answering ECU', () => {
    const r = parseReply(['7E8 04 43 01 01 71', '7E9 02 43 00']);
    expect(r.ok && r.replies.map((x) => x.ecu)).toEqual(['7E8', '7E9']);
  });

  it('ignores SEARCHING... and blank lines', () => {
    expect(parseReply(['SEARCHING...', '', '7E8 03 41 0D 00']).ok).toBe(true);
  });

  it.each([
    ['NO DATA', 'NO_DATA'],
    ['UNABLE TO CONNECT', 'UNABLE_TO_CONNECT'],
    ['CAN ERROR', 'BUS_ERROR'],
    ['BUS INIT: ...ERROR', 'BUS_ERROR'],
    ['?', 'UNKNOWN_CMD'],
    ['STOPPED', 'STOPPED'],
    ['HELLO', 'MALFORMED'],
  ])('maps %s to %s', (line, reason) => {
    expect(parseReply([line])).toMatchObject({ ok: false, reason });
  });

  it('flags a truncated frame as malformed', () => {
    expect(parseReply(['7E8 05 41 0C 0C'])).toMatchObject({ ok: false, reason: 'MALFORMED' });
  });
});
