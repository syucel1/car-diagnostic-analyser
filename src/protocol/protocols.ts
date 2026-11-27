/** ELM327 protocol numbers (ATDPN) and how their replies are framed. */
export type Framing = 'can11' | 'can29' | 'kline' | 'unknown';

export interface ProtocolInfo {
  id: string;
  name: string;
  framing: Framing;
}

export const PROTOCOLS: Record<string, ProtocolInfo> = {
  '1': { id: '1', name: 'SAE J1850 PWM', framing: 'kline' },
  '2': { id: '2', name: 'SAE J1850 VPW', framing: 'kline' },
  '3': { id: '3', name: 'ISO 9141-2', framing: 'kline' },
  '4': { id: '4', name: 'ISO 14230-4 KWP (5-baud init)', framing: 'kline' },
  '5': { id: '5', name: 'ISO 14230-4 KWP (fast init)', framing: 'kline' },
  '6': { id: '6', name: 'ISO 15765-4 CAN (11-bit, 500 kbaud)', framing: 'can11' },
  '7': { id: '7', name: 'ISO 15765-4 CAN (29-bit, 500 kbaud)', framing: 'can29' },
  '8': { id: '8', name: 'ISO 15765-4 CAN (11-bit, 250 kbaud)', framing: 'can11' },
  '9': { id: '9', name: 'ISO 15765-4 CAN (29-bit, 250 kbaud)', framing: 'can29' },
  A: { id: 'A', name: 'SAE J1939 CAN', framing: 'unknown' },
};

/** Parses an ATDPN reply such as "A6" (auto, found 6) or "6". */
export function protocolFromDpn(reply: string | undefined): ProtocolInfo | undefined {
  const m = /^A?([1-9A-C])$/.exec((reply ?? '').trim().toUpperCase());
  return m ? PROTOCOLS[m[1]!] : undefined;
}

export function framingOf(protocolId: string | undefined): Framing {
  // Without a known protocol, assume the most common case (11-bit CAN).
  return protocolId ? (PROTOCOLS[protocolId]?.framing ?? 'unknown') : 'can11';
}

export function isCan(protocolId: string | undefined): boolean {
  const f = framingOf(protocolId);
  return f === 'can11' || f === 'can29';
}
