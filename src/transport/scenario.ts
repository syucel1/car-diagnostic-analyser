/**
 * Simulator scenario format (see design/testing-and-simulator.md).
 * The same JSON files drive the demo car and the automated tests.
 */
export interface Scenario {
  name: string;
  description?: string;
  /** Vehicle label shown in the UI, e.g. "2008 VW Golf 1.6 (simulated)". */
  vehicle: string;
  adapter: {
    /** Reply to ATZ / ATI. */
    ati: string;
    /** Reply to ATRV, e.g. "12.6V". */
    voltage: string;
    /** Min/max simulated latency per request in ms. */
    latencyMs: [number, number];
  };
  /** ELM327 protocol number reported by ATDPN, e.g. "6" (ISO 15765-4 CAN 11/500). */
  protocol: string;
  /**
   * ECUs keyed by response CAN id (e.g. "7E8"). Requests are keyed by the
   * request hex without spaces (e.g. "0105", "03"); values are the data bytes
   * of the reply without the length byte (e.g. "41 05 80").
   */
  ecus: Record<string, EcuSpec>;
  faults?: FaultSpec[];
  /** Values for checks that have no electronic source (inspection log). */
  manual?: ManualSpec;
}

export interface EcuSpec {
  /** Module never answers: requests addressed to it time out. */
  noResponse?: boolean;
  responses: Record<string, string>;
}

export interface FaultSpec {
  /** Activates once this many OBD requests (not AT commands) have been sent. */
  after: number;
  type: 'noData' | 'timeout' | 'busError' | 'disconnect';
  /** Only affect this request (normalised hex, e.g. "0110"); any request if omitted. */
  request?: string;
  /** How many times the fault fires; default 1. */
  times?: number;
}

export interface ManualSpec {
  /** Tyre pressures in bar keyed by position; missing positions = not logged. */
  tyrePressureBar?: Partial<Record<'FL' | 'FR' | 'RL' | 'RR', number>>;
  recommendedBar?: number;
  /** Brake pad thickness in mm. */
  brakePadMm?: Partial<Record<'front' | 'rear', number>>;
  oilLevel?: 'low' | 'ok' | 'high';
}

/**
 * Validates scenario JSON (shape only) and returns it typed.
 * Throws with a readable message if a field is missing or wrong.
 */
export function parseScenario(raw: unknown): Scenario {
  const fail = (msg: string): never => {
    throw new Error(`Invalid scenario: ${msg}`);
  };
  if (typeof raw !== 'object' || raw === null) fail('not an object');
  const s = raw as Record<string, any>;
  for (const key of ['name', 'vehicle', 'protocol'] as const) {
    if (typeof s[key] !== 'string') fail(`"${key}" must be a string`);
  }
  const a = s.adapter;
  if (typeof a !== 'object' || a === null) fail('"adapter" missing');
  if (typeof a.ati !== 'string' || typeof a.voltage !== 'string') fail('"adapter.ati" and "adapter.voltage" must be strings');
  const lat = a.latencyMs;
  if (!Array.isArray(lat) || lat.length !== 2 || !lat.every((n: unknown) => typeof n === 'number') || lat[0]! > lat[1]!) {
    fail('"adapter.latencyMs" must be [min, max]');
  }
  if (typeof s.ecus !== 'object' || s.ecus === null) fail('"ecus" missing');
  for (const [id, ecu] of Object.entries(s.ecus as Record<string, any>)) {
    if (!/^[0-9A-F]{3}$/.test(id)) fail(`ECU id "${id}" must be 3 hex digits`);
    if (typeof ecu?.responses !== 'object') fail(`ECU ${id} needs "responses"`);
    for (const [req, data] of Object.entries(ecu.responses as Record<string, unknown>)) {
      if (!/^[0-9A-F]+$/.test(req)) fail(`ECU ${id}: request "${req}" must be hex without spaces`);
      if (typeof data !== 'string' || !/^([0-9A-F]{2})( [0-9A-F]{2})*$/.test(data.trim())) {
        fail(`ECU ${id}: reply to ${req} must be space-separated hex bytes`);
      }
    }
  }
  if (s.faults !== undefined && !Array.isArray(s.faults)) fail('"faults" must be an array');
  return raw as Scenario;
}
