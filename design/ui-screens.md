# UI screens

Dark theme, desktop-first (min width 1100 px; the scan runs on a laptop in or next to the car). Mockups are in [`wireframes/`](wireframes/).

## Navigation

`Connect` (home) · `Scan` · `Report` · `Live` · `History` · `Maintenance` · `Vehicles` · `Settings`

## 1. Connect — [connect-screen.svg](wireframes/connect-screen.svg)

- Two equal cards: **Scan my car** and **Try the demo car**.
- Checklist: parked & handbrake on → adapter plugged in → USB connected.
- **Choose adapter…** calls `navigator.serial.requestPort()` (must be a click).
- If Web Serial is unavailable: real-car card explains "Use Chrome or Edge on a desktop"; demo card still works.
- Demo scenario dropdown lists the simulator scenarios.
- Footer text: read-only statement.

## 2. Scan — [scan-screen.svg](wireframes/scan-screen.svg)

**Top bar**: adapter, port, protocol, battery voltage, masked VIN, **Stop scan**.

**Left — car diagram (top-down, front at top)**

| Zone | Checks mapped to it |
|---|---|
| Engine bay | engine DTCs, MIL, freeze frame, engine PIDs, oil |
| Battery | `ATRV`, PID 42 |
| Each wheel (×4) | tyre pressure (profile or manual), brake pad (manual / profile), ABS wheel sensor (profile) |
| Cabin | airbags (SRS), body module (profile) |
| Gearbox | transmission DTCs (profile) |
| Rear | emissions / EVAP, readiness monitors |

Zone states: pending (grey), running (blue outline + soft pulse), ok, fault, no response, manual, not covered (dashed outline + reason). Clicking a zone filters the check list.

**Right — progress panel**

- Headline: `Scanning · k of N checks` + elapsed / ETA.
- Segmented progress bar coloured by result.
- Status chips with counts (clickable filters).
- Activity line: `→ <module> (<ecu>) · <request> <label> · waiting <ms>`.
- Check list: system, check, result — newest-running row auto-scrolls into view.
- Live strip: 4 sparklines (RPM, coolant, battery, long-term fuel trim) sampled between checks.

## 3. Report — [report-screen.svg](wireframes/report-screen.svg)

1. Summary tiles: **Needs attention**, **Coverage** (answered / total, with unsupported & no-response counts), **Emissions readiness**, **Manual inspection**.
2. Fault cards: code, kind (stored / pending / permanent), plain-English meaning, common causes, freeze frame. Footer note: the app never clears codes.
3. Tyres panel: four corners, value + source (car / gauge entry / unknown), recommended pressure.
4. Systems table: system · status · detail · **source**.
5. Not checked: explicit list of systems not covered for this car.
6. Actions: Export PDF (print stylesheet), Compare…, Save as test scenario.

## 4. Live

Pick up to 6 supported PIDs → uPlot charts with 60 s window, min/max/current, pause, record to CSV.

## 5. History & Compare

- Per vehicle, newest first: date, coverage, faults count, partial flag.
- Compare two scans: DTCs new / still present / gone; readiness changes; key value deltas (battery V, LTFT).

## 6. Maintenance & inspection

- Service items with interval (km and/or months), last done, next due, status (ok / soon / due).
- "Log inspection" quick form: tyre pressures (4 inputs), tread depth, pad thickness, oil level, note.
- Due and recent items flow into the report as **Manual** rows.

## Status wording (single source in `src/ui/status.ts`)

| Status | Label | Icon | Colour |
|---|---|---|---|
| running | Querying… | ● | `#58a6ff` |
| ok | Reading received / No faults reported | ✓ | `#3fb950` |
| fault | Fault reported | ⚠ | `#d29922` |
| unsupported | Not supported by this car | — | `#6e7681` |
| no_response | No response | ✕ | `#f85149` |
| manual | Manual inspection | ◆ | `#a371f7` |

**Wording rule:** "No faults reported" is only used when the module answered. A module that didn't answer is "No response — not checked", never "OK".

## Accessibility

- Status is never colour-only: every state has an icon and text.
- Progress region uses `aria-live="polite"`, announcing at most every 5 checks.
- All actions keyboard reachable; diagram zones are buttons with labels.
