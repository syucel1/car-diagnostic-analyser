import { framingOf, type Framing } from './protocols';

/**
 * Parsing of ELM327 reply lines (headers on, ATH1) into per-ECU messages.
 *
 * - 11-bit CAN:  "7E8 03 41 05 80"            id(3 hex) + ISO-TP PCI + data
 * - 29-bit CAN:  "18DAF110 03 41 05 80"       id(8 hex) + ISO-TP PCI + data
 * - K-line/J1850 "48 6B 10 41 05 80 5C"       3 header bytes + data + checksum
 *
 * CAN multi-frame (ISO-TP) messages are reassembled per ECU. Spaces optional.
 */
export type ElmFailure = 'NO_DATA' | 'UNABLE_TO_CONNECT' | 'BUS_ERROR' | 'UNKNOWN_CMD' | 'STOPPED' | 'MALFORMED';

export interface EcuReply {
  /** Responding ECU: CAN id ("7E8", "18DAF110") or K-line source address ("10"). */
  ecu: string;
  /** Message bytes, starting with the response service id, e.g. [0x41, 0x05, 0x80]. */
  bytes: number[];
}

export type ParsedReply =
  | { ok: true; replies: EcuReply[] }
  | { ok: false; reason: ElmFailure; raw: string[] };

const FAILURES: [RegExp, ElmFailure][] = [
  [/^NO DATA$/, 'NO_DATA'],
  [/^UNABLE TO CONNECT$/, 'UNABLE_TO_CONNECT'],
  [/^(CAN ERROR|BUS ERROR|BUS BUSY|FB ERROR|DATA ERROR|BUFFER FULL|BUS INIT:.*ERROR|<RX ERROR|ERR\d\d)$/, 'BUS_ERROR'],
  [/^\?$/, 'UNKNOWN_CMD'],
  [/^STOPPED$/, 'STOPPED'],
];

/**
 * @param protocolId ELM protocol number from ATDPN ("6", "3", …). Defaults to 11-bit CAN.
 */
export function parseReply(lines: string[], protocolId?: string): ParsedReply {
  const clean = lines
    .map((l) => l.trim().toUpperCase())
    .filter((l) => l.length > 0 && !l.startsWith('SEARCHING'));

  for (const line of clean) {
    for (const [re, reason] of FAILURES) {
      if (re.test(line)) return { ok: false, reason, raw: lines };
    }
  }
  if (!clean.length) return { ok: false, reason: 'NO_DATA', raw: lines };

  const framing = framingOf(protocolId);
  const replies = framing === 'kline' ? parseKline(clean) : parseCan(clean, framing);
  return replies ? { ok: true, replies } : { ok: false, reason: 'MALFORMED', raw: lines };
}

function hexBytes(hex: string): number[] | null {
  if (!/^([0-9A-F]{2})*$/.test(hex)) return null;
  return (hex.match(/../g) ?? []).map((b) => Number.parseInt(b, 16));
}

function parseCan(lines: string[], framing: Framing): EcuReply[] | null {
  const idLen = framing === 'can29' ? 8 : 3;
  /** In-progress multi-frame messages per ECU. */
  const pending = new Map<string, { total: number; data: number[]; seq: number }>();
  const replies: EcuReply[] = [];

  for (const line of lines) {
    const compact = line.replace(/\s+/g, '');
    const ecu = compact.slice(0, idLen);
    if (!/^[0-9A-F]+$/.test(ecu) || ecu.length !== idLen) return null;
    const frame = hexBytes(compact.slice(idLen));
    if (!frame || frame.length < 1) return null;
    const pci = frame[0]!;

    switch (pci >> 4) {
      case 0: {
        // Single frame: low nibble = length.
        const len = pci & 0x0f;
        if (len === 0 || frame.length - 1 < len) return null;
        replies.push({ ecu, bytes: frame.slice(1, 1 + len) });
        break;
      }
      case 1: {
        // First frame: 12-bit total length, then up to 6 data bytes.
        if (frame.length < 2) return null;
        const total = ((pci & 0x0f) << 8) | frame[1]!;
        pending.set(ecu, { total, data: frame.slice(2), seq: 1 });
        break;
      }
      case 2: {
        // Consecutive frame: low nibble = sequence number (wraps at 16).
        const msg = pending.get(ecu);
        if (!msg || (pci & 0x0f) !== msg.seq % 16) return null;
        msg.data.push(...frame.slice(1));
        msg.seq += 1;
        break;
      }
      default:
        return null;
    }
  }

  for (const [ecu, msg] of pending) {
    if (msg.data.length < msg.total) return null; // incomplete multi-frame
    replies.push({ ecu, bytes: msg.data.slice(0, msg.total) });
  }
  return replies.length ? replies : null;
}

function parseKline(lines: string[]): EcuReply[] | null {
  const replies: EcuReply[] = [];
  for (const line of lines) {
    const bytes = hexBytes(line.replace(/\s+/g, ''));
    // 3 header bytes + at least a service byte + checksum.
    if (!bytes || bytes.length < 5) return null;
    const source = bytes[2]!.toString(16).toUpperCase().padStart(2, '0');
    replies.push({ ecu: source, bytes: bytes.slice(3, -1) });
  }
  return replies;
}
