# Roadmap

**Progress:** Phase 1 complete (9 Nov 2026). Next: Phase 2 — USB connection.

Start with one car, one adapter and a read-only generic scan; extend one system at a time. Every phase ends with something you can demo.

## Milestone A — First release (v0.1): generic engine scan with live progress

| Phase | Deliverable | Acceptance criteria |
|---|---|---|
| **1** Skeleton + simulator ✅ | Vite/React/TS project, `Transport` interface, `SimulatorTransport`, scan engine running a fake plan, progress UI (counter, bar, list) | `npm test` green; demo scan of 20 fake checks shows `k of N` increasing monotonically and a final summary |
| **2** USB connection | `ElmSerialTransport` over Web Serial; AT init; adapter ID + `ATRV`; `ReadOnlyGuard` | Real adapter connects, shows firmware and voltage; guard tests prove blocked SIDs never reach the port; unplug mid-session handled cleanly |
| **3** Discovery | Protocol detection, supported-PID bitmaps, VIN, responding ECUs | On the real car: protocol, VIN and supported PID list match a serial-terminal check |
| **4** Engine fault codes | Services 03 / 07 / 0A, DTC decoding, generic P-code descriptions | Correct codes for CAN and non-CAN reply formats in tests; real car result matches another scanner |
| **5** MIL + readiness | PID 01 / 41 decoding, readiness panel | All 3 continuous + supported non-continuous monitors shown with ready / not ready |
| **6** Freeze frame | Service 02 for the DTC that stored the frame | Freeze frame shown on the fault card; "unsupported" when the car has none |
| **7** Live data | PID polling, multi-PID requests on CAN, uPlot charts | ≥ 5 samples/s on STN adapter; values plausible against dashboard gauges |
| **8** Car diagram | Animated top-down diagram bound to scan events | Zones change state in sync with checks; demo scenarios look right; release **v0.1** |

## Milestone B — History and reporting (v0.2)

| Phase | Deliverable | Acceptance criteria |
|---|---|---|
| **9** Persistence | IndexedDB stores, raw log, history list | Scans survive reload; raw log re-decodes to the same result |
| **10** Compare | Diff two scans | New / persisting / gone DTCs and readiness changes correct in tests |
| **11** Export | Print stylesheet → PDF; JSON export/import | Exported PDF readable on A4; VIN masked by default |
| **12** Maintenance & inspection log | Service items, inspection entries, due logic, report integration | Due items appear as Manual rows; tyre gauge entries show on the tyre panel |

## Milestone C — Beyond generic OBD-II (v0.3+)

| Phase | Deliverable | Acceptance criteria |
|---|---|---|
| **13** Profiles | Profile JSON schema, VIN matching, first make/model/year profile | Profile auto-selected from VIN; modules probed; unreachable modules reported as "No response" |
| **14** ABS | ABS module DTCs via UDS 19 (or KWP equivalent) | ABS codes read on the profile car; "checked, 0 faults" vs "not reachable" distinguished |
| **15** Tyre pressures | Per-wheel TPMS values where the car exposes them | Values match the car's own display; indirect-TPMS cars show warning-only with explanation |
| **16** Oil life / service | Oil-life % / service-due counters via profile DIDs | Matches instrument cluster; falls back to the maintenance log when unsupported |

## Later ideas

- Bluetooth LE adapters (Web Bluetooth) for phone use
- Mode 06 test results viewer (misfire counts per cylinder)
- More profiles (contributed as JSON)
- Trip logging with fuel-economy estimates from MAF
- PWA install + offline
