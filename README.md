# car-diagnostic-analyser

Browser-based, **read-only** car diagnostics over a USB OBD-II adapter.

Plug a USB OBD-II adapter into the car and your laptop, open the app in Chrome or Edge, press **Run scan**, and watch a top-down car diagram light up system by system while a counter shows how many checks have run and what each one returned: fault codes, emissions readiness, live engine data, battery voltage, and — as vehicle profiles are added — ABS, tyre pressures and oil life. Things no computer in the car can report (brake pads, filters, tyre gauge readings) are tracked in a maintenance and inspection log and included in the report.

> **Status:** design phase. No application code yet.

## Design

- **[design.html](design.html)** / **[design.pdf](design.pdf)** — the full design document (goals, connection, coverage, safety, architecture, screens, data model, roadmap).
- **[design/](design/)** — detail docs and wireframes:
  [architecture](design/architecture.md) ·
  [safety allowlist](design/safety-allowlist.md) ·
  [OBD reference](design/obd-reference.md) ·
  [data model](design/data-model.md) ·
  [UI screens](design/ui-screens.md) ·
  [hardware setup](design/hardware-setup.md) ·
  [testing & simulator](design/testing-and-simulator.md) ·
  [roadmap](design/roadmap.md) ·
  [decisions](design/decisions.md)

Rebuild the HTML/PDF after editing `design/design.src.html` or the wireframes:

```bash
python design/build.py
```

## How it connects

```
Car (ECUs) ──► OBD-II socket ──► USB OBD adapter (ELM327/STN) ──► Laptop ──► Chrome/Edge (Web Serial) ──► app
```

## Key principles

- **Read-only by construction.** Every request passes a default-deny allowlist. The app cannot clear codes, run tests or change settings.
- **Honest progress.** "23 of 41 checks · ABS no response", never a made-up health percentage. "No response" is never shown as OK.
- **Source on everything.** Each result says whether it came from generic OBD-II, a vehicle profile, or your own inspection log.
- **Demo car included.** A simulator with scripted scenarios lets anyone try the full experience without hardware, and drives the test suite.
- **Local only.** All data stays in the browser (IndexedDB).

## Planned stack

TypeScript · Vite · React · Web Serial API · IndexedDB (`idb`) · uPlot · Vitest · Playwright

## Roadmap (summary)

| Milestone | Phases |
|---|---|
| **v0.1** Generic engine scan with live progress | Simulator → USB connection → discovery → fault codes → readiness → freeze frame → live data → animated car diagram |
| **v0.2** History & reporting | Saved scans → compare → PDF export → maintenance & inspection log |
| **v0.3+** Beyond generic OBD-II | Vehicle profiles → ABS → per-wheel tyre pressures → oil life |

Details and acceptance criteria: [design/roadmap.md](design/roadmap.md).

## Hardware

A USB ELM327-compatible adapter (e.g. OBDLink EX) and a desktop Chrome or Edge browser. See [design/hardware-setup.md](design/hardware-setup.md).

## Safety

Only scan with the car parked, handbrake on and ignition on. Never while driving. Unplug the adapter when finished. A scan is not a safety inspection — the report lists what was **not** checked.

## License

See [LICENSE](LICENSE).
