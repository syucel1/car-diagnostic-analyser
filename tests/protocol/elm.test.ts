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

describe('parseReply — CAN multi-frame (ISO-TP)', () => {
  it('reassembles a VIN split over three frames', () => {
    // 09 02 reply: 49 02 01 + "WVWZZZ1KZ8W386752"
    const r = parseReply(['7E8 10 14 49 02 01 57 56 57', '7E8 21 5A 5A 5A 31 4B 5A 38', '7E8 22 57 33 38 36 37 35 32'], '6');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const bytes = r.replies[0]!.bytes;
    expect(bytes.slice(0, 3)).toEqual([0x49, 0x02, 0x01]);
    expect(String.fromCharCode(...bytes.slice(3))).toBe('WVWZZZ1KZ8W386752');
  });

  it('reassembles per ECU when two ECUs interleave', () => {
    const r = parseReply(['7E8 10 08 43 03 01 71 04 20', '7E9 02 43 00', '7E8 21 03 00 00 00 00 00 00'], '6');
    expect(r.ok && r.replies).toEqual([
      { ecu: '7E9', bytes: [0x43, 0x00] },
      { ecu: '7E8', bytes: [0x43, 0x03, 0x01, 0x71, 0x04, 0x20, 0x03, 0x00] },
    ]);
  });

  it('rejects an out-of-sequence or incomplete message', () => {
    expect(parseReply(['7E8 10 14 49 02 01 57 56 57', '7E8 22 57 33 38 36 37 35 32'], '6')).toMatchObject({ ok: false, reason: 'MALFORMED' });
    expect(parseReply(['7E8 10 14 49 02 01 57 56 57'], '6')).toMatchObject({ ok: false, reason: 'MALFORMED' });
  });
});

describe('parseReply — other protocols', () => {
  it('parses 29-bit CAN', () => {
    expect(parseReply(['18DAF110 03 41 05 80'], '7')).toEqual({ ok: true, replies: [{ ecu: '18DAF110', bytes: [0x41, 0x05, 0x80] }] });
  });

  it('parses ISO 9141 / KWP with 3 header bytes and a checksum', () => {
    expect(parseReply(['48 6B 10 41 05 80 89'], '3')).toEqual({ ok: true, replies: [{ ecu: '10', bytes: [0x41, 0x05, 0x80] }] });
  });

  it('keeps each K-line DTC frame (3 codes per frame)', () => {
    const r = parseReply(['486B1043017104200000F2', '486B10430000000000002E'], '4');
    expect(r.ok && r.replies.map((x) => x.bytes)).toEqual([
      [0x43, 0x01, 0x71, 0x04, 0x20, 0x00, 0x00],
      [0x43, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    ]);
  });
});
