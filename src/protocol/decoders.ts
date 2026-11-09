/**
 * Pure decoders: bytes in, values out. Formulas from SAE J1979 / ISO 15031-5
 * (see design/obd-reference.md). `data` is the bytes after service + PID.
 */

export interface PidValue {
  value: number;
  unit: string;
}

type PidDecoder = (d: number[]) => number;

const A = (d: number[]) => d[0] ?? NaN;
const AB = (d: number[]) => (d[0] ?? NaN) * 256 + (d[1] ?? NaN);
const trim = (d: number[]) => ((A(d) - 128) * 100) / 128;

export const PIDS: Record<number, { name: string; unit: string; decode: PidDecoder }> = {
  0x04: { name: 'Calculated engine load', unit: '%', decode: (d) => (A(d) * 100) / 255 },
  0x05: { name: 'Coolant temperature', unit: '°C', decode: (d) => A(d) - 40 },
  0x06: { name: 'Short-term fuel trim bank 1', unit: '%', decode: trim },
  0x07: { name: 'Long-term fuel trim bank 1', unit: '%', decode: trim },
  0x0b: { name: 'Intake manifold pressure', unit: 'kPa', decode: A },
  0x0c: { name: 'Engine speed', unit: 'rpm', decode: (d) => AB(d) / 4 },
  0x0d: { name: 'Vehicle speed', unit: 'km/h', decode: A },
  0x0f: { name: 'Intake air temperature', unit: '°C', decode: (d) => A(d) - 40 },
  0x10: { name: 'MAF air flow', unit: 'g/s', decode: (d) => AB(d) / 100 },
  0x11: { name: 'Throttle position', unit: '%', decode: (d) => (A(d) * 100) / 255 },
  0x1c: { name: 'OBD standard', unit: '', decode: A },
  0x1f: { name: 'Run time since start', unit: 's', decode: AB },
  0x21: { name: 'Distance with check-engine light on', unit: 'km', decode: AB },
  0x2f: { name: 'Fuel tank level', unit: '%', decode: (d) => (A(d) * 100) / 255 },
  0x31: { name: 'Distance since codes cleared', unit: 'km', decode: AB },
  0x42: { name: 'Control module voltage', unit: 'V', decode: (d) => AB(d) / 1000 },
  0x46: { name: 'Ambient air temperature', unit: '°C', decode: (d) => A(d) - 40 },
  0x5c: { name: 'Engine oil temperature', unit: '°C', decode: (d) => A(d) - 40 },
};

export function decodePid(pid: number, data: number[]): PidValue {
  const def = PIDS[pid];
  if (!def) throw new Error(`No decoder for PID 0x${pid.toString(16)}`);
  const value = def.decode(data);
  if (!Number.isFinite(value)) throw new Error(`Not enough data for PID 0x${pid.toString(16)}`);
  return { value, unit: def.unit };
}

/** OBD standards reported by PID 1C (subset). */
export const OBD_STANDARDS: Record<number, string> = {
  1: 'OBD-II (CARB)',
  2: 'OBD (EPA)',
  3: 'OBD and OBD-II',
  6: 'EOBD (Europe)',
  7: 'EOBD and OBD-II',
  9: 'EOBD, OBD and OBD-II',
};

// ---------------------------------------------------------------- DTCs

const DTC_SYSTEM = ['P', 'C', 'B', 'U'] as const;

/** Decodes a 2-byte DTC, e.g. (0x01, 0x71) → "P0171". */
export function decodeDtc(hi: number, lo: number): string {
  const system = DTC_SYSTEM[(hi >> 6) & 0x3];
  const d1 = (hi >> 4) & 0x3;
  const d2 = (hi & 0xf).toString(16);
  const rest = lo.toString(16).padStart(2, '0');
  return `${system}${d1}${d2}${rest}`.toUpperCase();
}

/**
 * Decodes a service 03 / 07 / 0A reply (bytes after the response SID).
 * CAN replies start with a count byte; non-CAN replies are padded with 0000.
 */
export function decodeDtcList(data: number[], isCan: boolean): string[] {
  const body = isCan ? data.slice(1) : data;
  const codes: string[] = [];
  for (let i = 0; i + 1 < body.length; i += 2) {
    const hi = body[i]!;
    const lo = body[i + 1]!;
    if (hi === 0 && lo === 0) continue;
    codes.push(decodeDtc(hi, lo));
  }
  return codes;
}

// ---------------------------------------------------------------- monitor status (PID 01)

export interface MonitorStatus {
  milOn: boolean;
  dtcCount: number;
  diesel: boolean;
  /** Monitors supported by this car, with ready = test complete. */
  monitors: { name: string; ready: boolean }[];
}

const CONTINUOUS = ['Misfire', 'Fuel system', 'Components'];
const SPARK = ['Catalyst', 'Heated catalyst', 'EVAP system', 'Secondary air', 'A/C refrigerant', 'O₂ sensor', 'O₂ sensor heater', 'EGR / VVT'];
const COMPRESSION = ['NMHC catalyst', 'NOx / SCR', '', 'Boost pressure', '', 'Exhaust gas sensor', 'Particulate filter', 'EGR / VVT'];

export function decodeMonitorStatus(data: number[]): MonitorStatus {
  const [a = 0, b = 0, c = 0, d = 0] = data;
  const diesel = (b & 0x08) !== 0;
  const monitors: MonitorStatus['monitors'] = [];
  CONTINUOUS.forEach((name, i) => {
    if (b & (1 << i)) monitors.push({ name, ready: (b & (1 << (i + 4))) === 0 });
  });
  (diesel ? COMPRESSION : SPARK).forEach((name, i) => {
    if (name && c & (1 << i)) monitors.push({ name, ready: (d & (1 << i)) === 0 });
  });
  return { milOn: (a & 0x80) !== 0, dtcCount: a & 0x7f, diesel, monitors };
}

// ---------------------------------------------------------------- descriptions

/** Small bundled set of common generic descriptions; a full table comes in phase 4. */
export const DTC_DESCRIPTIONS: Record<string, string> = {
  P0101: 'Mass air flow sensor range/performance',
  P0128: 'Coolant thermostat below regulating temperature',
  P0171: 'System too lean (bank 1)',
  P0172: 'System too rich (bank 1)',
  P0300: 'Random/multiple cylinder misfire detected',
  P0301: 'Cylinder 1 misfire detected',
  P0420: 'Catalyst system efficiency below threshold (bank 1)',
  P0442: 'EVAP system small leak detected',
  P0455: 'EVAP system large leak detected',
};

export function describeDtc(code: string): string {
  return DTC_DESCRIPTIONS[code] ?? 'Description not in the bundled list yet';
}
