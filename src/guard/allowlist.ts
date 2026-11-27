/**
 * Read-only guard (design/safety-allowlist.md, ADR-002).
 *
 * Every command passes `assertAllowed` inside each Transport's `send` before
 * a single byte is written. Default deny: anything not explicitly listed here
 * is refused. There is deliberately no override or "expert mode".
 */

export class ForbiddenRequestError extends Error {
  constructor(
    readonly command: string,
    reason: string,
  ) {
    super(`Blocked by the read-only guard: "${command}" — ${reason}`);
    this.name = 'ForbiddenRequestError';
  }
}

export interface GuardContext {
  /**
   * UDS 22 data identifiers (4 hex digits, e.g. "F190") allowed by the active
   * vehicle profile. Empty until profiles exist (phase 13).
   */
  allowedDids?: ReadonlySet<string>;
}

// ---------------------------------------------------------------- adapter commands

/** Exact adapter commands that change no persistent state. */
const AT_EXACT = new Set([
  'ATZ', 'ATWS', 'ATI', 'AT@1', 'STI', 'STDI',
  'ATE0', 'ATE1', 'ATL0', 'ATL1', 'ATS0', 'ATS1', 'ATH0', 'ATH1',
  'ATDP', 'ATDPN', 'ATAT0', 'ATAT1', 'ATAT2', 'ATCAF0', 'ATCAF1',
  'ATFCSM0', 'ATFCSM1', 'ATFCSM2', 'ATRV',
]);

/** Adapter commands with a hex argument, and the argument shape they accept. */
const AT_WITH_ARG: [prefix: string, arg: RegExp][] = [
  ['ATSP', /^[0-9A-C]$/], // select protocol (adapter setting only; ATSP0 = automatic)
  ['ATSPA', /^[0-9A-C]$/],
  ['ATST', /^[0-9A-F]{2}$/], // timeout
  ['ATSH', /^([0-9A-F]{3}|[0-9A-F]{6}|[0-9A-F]{8})$/], // request header
  ['ATCRA', /^([0-9A-F]{3}|[0-9A-F]{8})$/], // receive filter
  ['ATFCSH', /^([0-9A-F]{3}|[0-9A-F]{8})$/], // flow-control header
  ['ATFCSD', /^([0-9A-F]{2}){1,5}$/], // flow-control data
];

function checkAdapterCommand(cmd: string): void {
  if (AT_EXACT.has(cmd)) return;
  // Longest prefix first so ATSPA isn't read as ATSP + "A…".
  const match = [...AT_WITH_ARG]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([prefix]) => cmd.startsWith(prefix));
  if (match) {
    const [prefix, arg] = match;
    if (arg.test(cmd.slice(prefix.length))) return;
    throw new ForbiddenRequestError(cmd, `invalid argument for ${prefix}`);
  }
  if (/^AT(MA|MR|MT|BRD|BRT|PP)|^STP|^STM|^STSBR|^STBR/.test(cmd)) {
    throw new ForbiddenRequestError(cmd, 'adapter command that monitors the bus or reconfigures the adapter');
  }
  throw new ForbiddenRequestError(cmd, 'adapter command not on the allowlist');
}

// ---------------------------------------------------------------- diagnostic requests

const OBD_READ_SERVICES: Record<number, string> = {
  0x01: 'current data',
  0x02: 'freeze frame',
  0x03: 'stored DTCs',
  0x06: 'test results',
  0x07: 'pending DTCs',
  0x09: 'vehicle information',
  0x0a: 'permanent DTCs',
};

/** Explicit reasons for well-known dangerous services (anything else: default deny). */
const BLOCKED_REASONS: Record<number, string> = {
  0x04: 'OBD 04 clears fault codes, freeze frame and readiness monitors',
  0x08: 'OBD 08 runs on-board tests / actuators',
  0x11: 'UDS 11 resets an ECU',
  0x14: 'UDS 14 clears diagnostic information',
  0x27: 'UDS 27 security access unlocks writing and programming',
  0x28: 'UDS 28 can silence modules on the bus',
  0x2e: 'UDS 2E writes data (settings, coding)',
  0x2f: 'UDS 2F drives actuators',
  0x31: 'UDS 31 runs routines',
  0x34: 'UDS 34 starts a download (flashing)',
  0x35: 'UDS 35 starts an upload',
  0x36: 'UDS 36 transfers data (flashing)',
  0x37: 'UDS 37 ends a transfer',
  0x3b: 'KWP 3B writes data',
  0x3d: 'UDS 3D writes memory',
  0x30: 'KWP 30 controls inputs/outputs',
  0x85: 'UDS 85 stops modules recording faults',
};

/** UDS 19 sub-functions that only report DTC information. */
const UDS_19_SUBFUNCTIONS = new Set([0x01, 0x02, 0x04, 0x06, 0x0a]);

function checkDiagnosticRequest(cmd: string, ctx: GuardContext): void {
  if (!/^([0-9A-F]{2})+$/.test(cmd)) {
    throw new ForbiddenRequestError(cmd, 'not a whole number of hex bytes');
  }
  const bytes = cmd.match(/../g)!.map((b) => Number.parseInt(b, 16));
  const [sid = -1, ...data] = bytes;

  if (OBD_READ_SERVICES[sid]) {
    // Service 01/02/09 need a PID; 03/07/0A take none. 06 takes a test id.
    if ((sid === 0x01 || sid === 0x02 || sid === 0x09 || sid === 0x06) && data.length === 0) {
      throw new ForbiddenRequestError(cmd, 'missing PID');
    }
    if ((sid === 0x03 || sid === 0x07 || sid === 0x0a) && data.length > 0) {
      throw new ForbiddenRequestError(cmd, 'unexpected data after service');
    }
    if (data.length > 6) throw new ForbiddenRequestError(cmd, 'too many PIDs');
    return;
  }

  switch (sid) {
    case 0x19: {
      const sub = data[0];
      if (sub !== undefined && UDS_19_SUBFUNCTIONS.has(sub)) return;
      throw new ForbiddenRequestError(cmd, 'UDS 19 sub-function not on the allowlist');
    }
    case 0x22: {
      if (data.length < 2 || data.length % 2 !== 0) throw new ForbiddenRequestError(cmd, 'malformed data identifier');
      const allowed = ctx.allowedDids ?? new Set<string>();
      for (let i = 0; i < data.length; i += 2) {
        const did = cmd.slice(2 + i * 2, 6 + i * 2);
        if (!allowed.has(did)) throw new ForbiddenRequestError(cmd, `data identifier ${did} is not in the active vehicle profile`);
      }
      return;
    }
    case 0x3e:
      if (data.length === 1 && (data[0] === 0x00 || data[0] === 0x80)) return;
      throw new ForbiddenRequestError(cmd, 'only TesterPresent 3E 00 / 3E 80 is allowed');
    case 0x10:
      if (data.length === 1 && data[0] === 0x01) return;
      throw new ForbiddenRequestError(cmd, 'only the default diagnostic session (10 01) is allowed');
  }

  throw new ForbiddenRequestError(cmd, BLOCKED_REASONS[sid] ?? `service ${cmd.slice(0, 2)} is not on the allowlist`);
}

// ---------------------------------------------------------------- entry point

/** Normalises a command the same way the transports send it. */
export function normaliseCommand(cmd: string): string {
  return cmd.replace(/\s+/g, '').toUpperCase();
}

/**
 * Throws ForbiddenRequestError unless the command is on the allowlist.
 * Returns the normalised command that may be sent.
 */
export function assertAllowed(rawCmd: string, ctx: GuardContext = {}): string {
  const cmd = normaliseCommand(rawCmd);
  if (!cmd) throw new ForbiddenRequestError(rawCmd, 'empty command');
  if (cmd.startsWith('AT') || cmd.startsWith('ST')) {
    checkAdapterCommand(cmd);
  } else {
    checkDiagnosticRequest(cmd, ctx);
  }
  return cmd;
}

export function isAllowed(cmd: string, ctx: GuardContext = {}): boolean {
  try {
    assertAllowed(cmd, ctx);
    return true;
  } catch {
    return false;
  }
}
