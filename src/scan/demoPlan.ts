import { decodeDtc, decodeDtcList, decodeMonitorStatus, decodePid, describeDtc, OBD_STANDARDS, PIDS } from '../protocol/decoders';
import type { EcuReply, ParsedReply } from '../protocol/elm';
import type { ManualSpec } from '../transport/scenario';
import type { CheckOutcome, CheckPlan, SystemId } from './types';

/**
 * Phase 1 plan: a fixed list of checks. From phase 3 the planner builds this
 * from discovery (supported-PID bitmaps, responding modules, vehicle profile).
 */
export function buildDemoPlan(manual: ManualSpec = {}): CheckPlan[] {
  return [
    // Engine
    monitorCheck('engine.mil', 'engine', 'Check-engine light', (m) =>
      m.milOn
        ? { status: 'fault', summary: `ON · ${m.dtcCount} emission code${m.dtcCount === 1 ? '' : 's'}`, value: true }
        : { status: 'ok', summary: 'Off', value: false },
    ),
    dtcCheck('engine.dtc.stored', 'engine', 'Stored fault codes', '03', 0x43, '7E0', 'Engine ECU (7E8)'),
    dtcCheck('engine.dtc.pending', 'engine', 'Pending fault codes', '07', 0x47, '7E0', 'Engine ECU (7E8)'),
    dtcCheck('engine.dtc.permanent', 'engine', 'Permanent fault codes', '0A', 0x4a, '7E0', 'Engine ECU (7E8)'),
    pidCheck('engine.coolant', 'engine', 0x05, (v) =>
      v > 110 ? ['fault', 'overheating'] : v < 70 ? ['ok', 'engine not warm yet'] : ['ok'],
    ),
    pidCheck('engine.rpm', 'engine', 0x0c),
    pidCheck('engine.load', 'engine', 0x04),
    pidCheck('engine.iat', 'engine', 0x0f),
    pidCheck('engine.throttle', 'engine', 0x11),
    pidCheck('engine.stft1', 'engine', 0x06, trimRange),
    pidCheck('engine.ltft1', 'engine', 0x07, trimRange),
    pidCheck('engine.maf', 'engine', 0x10),
    pidCheck('engine.oiltemp', 'oil', 0x5c, (v) => (v > 130 ? ['fault', 'very hot'] : ['ok'])),

    // Emissions
    monitorCheck('emissions.readiness', 'emissions', 'Readiness monitors', (m) => {
      const ready = m.monitors.filter((x) => x.ready).length;
      const notReady = m.monitors.filter((x) => !x.ready).map((x) => x.name);
      return {
        status: 'ok',
        summary: `${ready} of ${m.monitors.length} complete${notReady.length ? ` · ${notReady.join(', ')} incomplete` : ''}`,
        value: `${ready}/${m.monitors.length}`,
      };
    }),
    pidCheck('emissions.standard', 'emissions', 0x1c, undefined, (v) => OBD_STANDARDS[v] ?? `Type ${v}`),
    pidCheck('emissions.milDistance', 'emissions', 0x21, (v) => (v > 0 ? ['fault', 'driven with the light on'] : ['ok'])),
    pidCheck('emissions.sinceCleared', 'emissions', 0x31),

    // Battery
    {
      id: 'battery.socket',
      system: 'battery',
      label: 'Battery voltage at socket',
      source: 'generic',
      request: 'ATRV',
      requestLabel: 'ATRV',
      module: 'Adapter',
      evaluateRaw: (lines) => {
        const v = Number.parseFloat(lines[0] ?? '');
        if (!Number.isFinite(v)) return { status: 'no_response', summary: `Unreadable: ${lines.join(' ')}` };
        if (v < 11.8) return { status: 'fault', summary: `${v.toFixed(1)} V · low`, value: v, unit: 'V' };
        return { status: 'ok', summary: `${v.toFixed(1)} V${v >= 13.5 ? ' · charging' : ''}`, value: v, unit: 'V' };
      },
    },
    pidCheck('battery.module', 'battery', 0x42, (v) => (v < 11.8 ? ['fault', 'low'] : ['ok'])),

    // Other modules (fixed addresses for the demo; phase 13 moves these into vehicle profiles)
    dtcCheck('gearbox.dtc', 'gearbox', 'Gearbox fault codes', '03', 0x43, '7E1', 'Gearbox (7E9)'),
    {
      id: 'abs.dtc',
      system: 'abs',
      label: 'ABS fault codes',
      source: 'profile',
      request: '1902FF',
      requestLabel: 'UDS 19 02',
      header: '7B0',
      module: 'ABS module (7B8)',
      timeoutMs: 2000,
      evaluate: (reply) => {
        const bytes = reply.replies[0]?.bytes ?? [];
        if (bytes[0] === 0x7f) return { status: 'unsupported', summary: 'Request not supported by the module' };
        if (bytes[0] !== 0x59) throw new Error('unexpected service in reply');
        const codes: string[] = [];
        for (let i = 3; i + 3 < bytes.length; i += 4) codes.push(decodeDtc(bytes[i]!, bytes[i + 1]!));
        return codes.length
          ? { status: 'fault', summary: codes.join(', '), dtcs: codes }
          : { status: 'ok', summary: 'Checked · no faults reported', dtcs: [] };
      },
    },

    // Manual inspection
    tyreCheck(manual),
    {
      id: 'brakes.pads',
      system: 'brakes',
      label: 'Brake pad thickness',
      source: 'manual',
      manual: padOutcome(manual),
    },
    {
      id: 'oil.level',
      system: 'oil',
      label: 'Oil level (dipstick)',
      source: 'manual',
      manual:
        manual.oilLevel === undefined
          ? { status: 'manual', summary: 'Not logged — check the dipstick' }
          : manual.oilLevel === 'ok'
            ? { status: 'manual', summary: 'Logged OK' }
            : { status: 'fault', summary: `Logged ${manual.oilLevel}` },
    },
  ];
}

// ---------------------------------------------------------------- helpers

type Range = (v: number) => ['ok' | 'fault', string?];
const trimRange: Range = (v) => (Math.abs(v) > 10 ? ['fault', 'outside ±10 %'] : ['ok']);

const DECIMALS: Record<string, number> = { '%': 1, V: 1, 'g/s': 1 };

function hex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

/** Picks the engine ECU's reply if several ECUs answered a functional request. */
function engineReply(reply: Extract<ParsedReply, { ok: true }>): EcuReply {
  return reply.replies.find((r) => r.ecu === '7E8') ?? reply.replies[0]!;
}

function pidCheck(id: string, system: SystemId, pid: number, range?: Range, format?: (v: number) => string): CheckPlan {
  const def = PIDS[pid];
  if (!def) throw new Error(`Unknown PID ${pid}`);
  return {
    id,
    system,
    label: def.name,
    source: 'generic',
    request: `01${hex2(pid)}`,
    requestLabel: `01 ${hex2(pid)}`,
    module: 'Engine ECU (7E8)',
    evaluate: (reply) => {
      const { bytes } = engineReply(reply);
      if (bytes[0] !== 0x41 || bytes[1] !== pid) throw new Error('reply does not match request');
      if (format) {
        const raw = bytes[2] ?? NaN;
        return { status: 'ok', summary: format(raw), value: format(raw) };
      }
      const { value, unit } = decodePid(pid, bytes.slice(2));
      const [status, note] = range ? range(value) : (['ok'] as const);
      const shown = value.toFixed(DECIMALS[unit] ?? 0);
      const sign = (pid === 0x06 || pid === 0x07) && value > 0 ? '+' : '';
      return { status, summary: `${sign}${shown} ${unit}${note ? ` · ${note}` : ''}`, value, unit };
    },
  };
}

function monitorCheck(
  id: string,
  system: SystemId,
  label: string,
  judge: (m: ReturnType<typeof decodeMonitorStatus>) => CheckOutcome,
): CheckPlan {
  return {
    id,
    system,
    label,
    source: 'generic',
    request: '0101',
    requestLabel: '01 01',
    module: 'Engine ECU (7E8)',
    evaluate: (reply) => {
      const { bytes } = engineReply(reply);
      if (bytes[0] !== 0x41 || bytes[1] !== 0x01) throw new Error('reply does not match request');
      return judge(decodeMonitorStatus(bytes.slice(2)));
    },
  };
}

function dtcCheck(
  id: string,
  system: SystemId,
  label: string,
  request: string,
  responseSid: number,
  header: string,
  module: string,
): CheckPlan {
  return {
    id,
    system,
    label,
    source: system === 'engine' ? 'generic' : 'profile',
    request,
    requestLabel: request,
    header,
    module,
    evaluate: (reply) => {
      const codes = reply.replies.flatMap((r) => {
        if (r.bytes[0] !== responseSid) throw new Error('reply does not match request');
        return decodeDtcList(r.bytes.slice(1), true);
      });
      if (!codes.length) return { status: 'ok', summary: 'None', dtcs: [] };
      return {
        status: 'fault',
        summary: codes.map((c) => `${c} ${describeDtc(c)}`).join(' · '),
        dtcs: codes,
      };
    },
  };
}

function tyreCheck(manual: ManualSpec): CheckPlan {
  const positions = ['FL', 'FR', 'RL', 'RR'] as const;
  const logged = manual.tyrePressureBar ?? {};
  const rec = manual.recommendedBar;
  const low = positions.filter((p) => rec !== undefined && logged[p] !== undefined && logged[p]! < rec - 0.2);
  const missing = positions.filter((p) => logged[p] === undefined);
  let outcome: CheckOutcome;
  if (low.length) {
    outcome = {
      status: 'fault',
      summary: `${low.map((p) => `${p} ${logged[p]!.toFixed(1)} bar`).join(', ')} · low (recommended ${rec!.toFixed(1)})`,
    };
  } else if (missing.length === positions.length) {
    outcome = { status: 'manual', summary: 'Not logged — check with a gauge' };
  } else if (missing.length) {
    outcome = { status: 'manual', summary: `${missing.join(', ')} not logged` };
  } else {
    outcome = { status: 'manual', summary: `Logged: ${positions.map((p) => logged[p]!.toFixed(1)).join(' / ')} bar` };
  }
  return { id: 'tyres.pressure', system: 'tyres', label: 'Tyre pressures', source: 'manual', manual: outcome };
}

function padOutcome(manual: ManualSpec): CheckOutcome {
  const pads = manual.brakePadMm ?? {};
  const parts = (['front', 'rear'] as const).filter((p) => pads[p] !== undefined).map((p) => `${p} ${pads[p]} mm`);
  if (!parts.length) return { status: 'manual', summary: 'Not logged — inspect by hand' };
  const thin = (['front', 'rear'] as const).some((p) => pads[p] !== undefined && pads[p]! < 3);
  return thin
    ? { status: 'fault', summary: `${parts.join(', ')} · replace soon (under 3 mm)` }
    : { status: 'manual', summary: `Logged: ${parts.join(', ')}` };
}
