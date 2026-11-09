/**
 * Parsing of ELM327 reply lines into per-ECU byte arrays.
 * Phase 1 handles single-frame CAN replies with headers on (ATH1), with or
 * without spaces. Multi-frame ISO-TP reassembly arrives with VIN reading.
 */
export type ElmFailure = 'NO_DATA' | 'UNABLE_TO_CONNECT' | 'BUS_ERROR' | 'UNKNOWN_CMD' | 'STOPPED' | 'MALFORMED';

export interface EcuReply {
  /** Response CAN id, e.g. "7E8". */
  ecu: string;
  /** Data bytes after the length byte, e.g. [0x41, 0x05, 0x80]. */
  bytes: number[];
}

export type ParsedReply =
  | { ok: true; replies: EcuReply[] }
  | { ok: false; reason: ElmFailure; raw: string[] };

const FAILURES: [RegExp, ElmFailure][] = [
  [/^NO DATA$/, 'NO_DATA'],
  [/^UNABLE TO CONNECT$/, 'UNABLE_TO_CONNECT'],
  [/^(CAN ERROR|BUS ERROR|BUS BUSY|FB ERROR|DATA ERROR|BUS INIT:.*ERROR)$/, 'BUS_ERROR'],
  [/^\?$/, 'UNKNOWN_CMD'],
  [/^STOPPED$/, 'STOPPED'],
];

export function parseReply(lines: string[]): ParsedReply {
  const clean = lines
    .map((l) => l.trim().toUpperCase())
    .filter((l) => l.length > 0 && !l.startsWith('SEARCHING'));

  for (const line of clean) {
    for (const [re, reason] of FAILURES) {
      if (re.test(line)) return { ok: false, reason, raw: lines };
    }
  }

  const replies: EcuReply[] = [];
  for (const line of clean) {
    const compact = line.replace(/\s+/g, '');
    // 11-bit CAN with headers: 3 hex id + 2 hex length + data.
    const m = /^([0-9A-F]{3})([0-9A-F]{2})((?:[0-9A-F]{2})*)$/.exec(compact);
    if (!m) return { ok: false, reason: 'MALFORMED', raw: lines };
    const [, ecu = '', lenHex = '', dataHex = ''] = m;
    const len = Number.parseInt(lenHex, 16);
    const bytes = (dataHex.match(/../g) ?? []).map((b) => Number.parseInt(b, 16)).slice(0, len);
    if (bytes.length < len) return { ok: false, reason: 'MALFORMED', raw: lines };
    replies.push({ ecu, bytes });
  }
  if (!replies.length) return { ok: false, reason: 'NO_DATA', raw: lines };
  return { ok: true, replies };
}
