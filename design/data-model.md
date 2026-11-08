# Data model and storage

Everything is stored locally in the browser's IndexedDB (database `cda`, via the `idb` library). No server, no account. Export/import of the whole database as JSON is provided for backup.

## Entities

```ts
interface Vehicle {
  id: string;                    // uuid
  vin?: string;                  // from 09 02, or typed in
  nickname: string;              // "Golf"
  make?: string; model?: string; year?: number;
  fuel?: 'petrol' | 'diesel' | 'hybrid' | 'other';   // from PID 01 B bit 3 if available
  profileId: string;             // "generic-obd2" or "vw-golf-mk5-2008"
  tyreSpec?: { frontBar: number; rearBar: number };  // from door-pillar sticker
  odometerKm?: number;           // last known, typed in or from profile
  createdAt: string;
}

interface Scan {
  id: string;
  vehicleId: string;
  startedAt: string; finishedAt?: string;
  transport: 'serial' | 'simulator' | 'replay';
  adapter?: { id: string; firmware: string; baud: number };
  protocol?: string;             // "ISO 15765-4 CAN (11 bit, 500 kbaud)"
  batteryV?: number;
  partial: boolean;              // cancelled / disconnected
  summary: { total: number; ok: number; fault: number; unsupported: number;
             noResponse: number; manual: number };
  appVersion: string;
}

interface CheckResult {
  scanId: string;
  checkId: string;               // "engine.dtc.stored"
  system: SystemId; zone: ZoneId;
  label: string;
  source: 'generic' | 'profile' | 'manual';
  ecu?: string;                  // "7E8"
  status: 'ok' | 'fault' | 'unsupported' | 'no_response' | 'manual';
  value?: number | string | boolean | Record<string, unknown>;
  unit?: string;
  dtcs?: Dtc[];
  note?: string;                 // e.g. "catalyst monitor incomplete"
  durationMs: number;
}

interface Dtc {
  code: string;                  // "P0171"
  kind: 'stored' | 'pending' | 'permanent';
  ecu: string;
  description?: string;          // from bundled generic list or profile table
  statusByte?: number;           // UDS only
  freezeFrame?: Record<string, { value: number; unit: string }>;
}

interface RawLogEntry { scanId: string; seq: number; t: number; dir: 'tx' | 'rx'; text: string; }

interface LiveSession {
  id: string; vehicleId: string; startedAt: string;
  pids: number[];
  samples: [t: number, pid: number, value: number][];
}

interface ServiceItem {
  id: string; vehicleId: string;
  kind: 'oil_and_filter' | 'air_filter' | 'cabin_filter' | 'fuel_filter' | 'brake_fluid'
      | 'spark_plugs' | 'timing_belt' | 'coolant' | 'custom';
  label: string;
  intervalKm?: number; intervalMonths?: number;   // from the owner's manual
  lastDoneAt?: string; lastDoneKm?: number;
}

interface Inspection {
  id: string; vehicleId: string; at: string;
  kind: 'tyre_pressure' | 'tyre_tread' | 'brake_pad' | 'brake_disc' | 'oil_level' | 'note';
  position?: 'FL' | 'FR' | 'RL' | 'RR' | 'front' | 'rear';
  value?: number; unit?: 'bar' | 'psi' | 'mm';
  note?: string;
}
```

## IndexedDB stores

| Store | Key | Indexes |
|---|---|---|
| `vehicles` | `id` | `vin` |
| `scans` | `id` | `vehicleId`, `startedAt` |
| `checkResults` | `[scanId, checkId]` | `scanId` |
| `rawLog` | `[scanId, seq]` | `scanId` |
| `liveSessions` | `id` | `vehicleId` |
| `serviceItems` | `id` | `vehicleId` |
| `inspections` | `id` | `vehicleId`, `at` |

Schema version starts at 1; migrations live in `src/data/migrations.ts`.

## Why keep the raw log

- Decoders will have bugs. Storing raw `tx`/`rx` lines means old scans can be **re-decoded** after a fix.
- Any real scan can be converted into a simulator scenario (`Export → test scenario`), turning field bugs into regression tests.
- The VIN is stored in full locally; it's masked in exported reports and scenarios by default.

## Derived values (computed, not stored)

- Service item due state: `due` when either distance or time interval is exceeded, `soon` within 10 %.
- Report "Manual inspection" rows: latest `Inspection` per kind/position, plus due `ServiceItem`s.
- Scan comparison: set difference of DTC codes (new / still present / gone) and readiness changes.
