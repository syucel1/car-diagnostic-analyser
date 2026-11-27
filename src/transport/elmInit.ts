import { parseReply } from '../protocol/elm';
import { protocolFromDpn } from '../protocol/protocols';
import type { AdapterInfo } from './types';

type Send = (cmd: string, timeoutMs: number) => Promise<string[]>;

/** Settings sent after reset (see design/obd-reference.md). */
export const INIT_COMMANDS = ['ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATAT1', 'ATSP0'] as const;

/** The first OBD request triggers the adapter's protocol search, which can take several seconds. */
export const PROTOCOL_SEARCH_TIMEOUT_MS = 12_000;

/**
 * Runs the ELM327 init sequence after a successful ATZ and finds out whether a
 * car is answering. Shared by the serial and simulated transports so both
 * behave identically.
 */
export async function initElm(send: Send, banner: string): Promise<AdapterInfo> {
  for (const cmd of INIT_COMMANDS) {
    // Some clone adapters answer "?" to settings they don't implement (e.g. ATAT1); carry on.
    await send(cmd, 1000);
  }

  const [ati] = await send('ATI', 1000);
  const id = (ati && /ELM|STN|OBD/i.test(ati) ? ati : banner).trim();

  const [rv = ''] = await send('ATRV', 1000);
  const voltage = Number.parseFloat(rv);

  const probe = parseReply(await send('0100', PROTOCOL_SEARCH_TIMEOUT_MS));
  const vehicleResponding = probe.ok || probe.reason === 'MALFORMED';

  const info: AdapterInfo = { id, vehicleResponding };
  if (Number.isFinite(voltage)) info.voltage = voltage;
  if (vehicleResponding) {
    const protocol = protocolFromDpn((await send('ATDPN', 1000))[0]);
    if (protocol) {
      info.protocol = protocol.id;
      info.protocolName = protocol.name;
    }
  }
  return info;
}
