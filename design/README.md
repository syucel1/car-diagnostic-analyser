# Design

Detail documents behind the top-level [`design.html`](../design.html) / [`design.pdf`](../design.pdf).

| File | What's in it |
|---|---|
| [architecture.md](architecture.md) | Layers, TypeScript interfaces, scan engine lifecycle, events, timing |
| [safety-allowlist.md](safety-allowlist.md) | The read-only guard: every allowed and blocked request, and why |
| [obd-reference.md](obd-reference.md) | ELM327 init sequence, OBD-II services, PID formulas, DTC decoding, UDS basics |
| [data-model.md](data-model.md) | Entities, IndexedDB stores, raw-log format |
| [ui-screens.md](ui-screens.md) | Screens, car-diagram zones, status wording, colours |
| [hardware-setup.md](hardware-setup.md) | Adapter choice, drivers, first connection on Windows, on-car safety |
| [testing-and-simulator.md](testing-and-simulator.md) | Test strategy, simulator scenario format, demo-car scenarios |
| [roadmap.md](roadmap.md) | 16 phases with deliverables and acceptance criteria |
| [decisions.md](decisions.md) | Decision log (ADR-style) |
| [wireframes/](wireframes/) | SVG diagrams and screen mockups used in the design doc |

## Rebuilding design.html and design.pdf

`design.src.html` is the source; the SVGs in `wireframes/` are inlined at build time.

```bash
python design/build.py
```

Needs Python 3.8+ and Chrome or Edge installed (used headless to print the PDF).
