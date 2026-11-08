# Testing and the simulator

## Layers of tests

| Layer | Tool | What |
|---|---|---|
| Decoders | Vitest, table-driven | PID formulas, DTC decoding, bitmap parsing, ISO-TP reassembly, VIN parsing — from spec examples **and** real captures |
| Guard | Vitest | Every blocked SID refused; simulator records zero bytes sent; fuzzed request strings |
| Transport | Vitest + fake `SerialPort` streams | Prompt framing, partial chunks, timeouts, abort, disconnect |
| Scan engine | Vitest + `SimulatorTransport` | Full scans per scenario → expected statuses, counts, event order, partial reports |
| UI | Playwright against the demo car | Progress counter monotonic, diagram zone states, report contents, export |
| On the car | Manual, with checklist | Only after all of the above pass |

## Simulator scenario format

Scenarios live in `sim/scenarios/*.json`. The same files drive tests and the demo car.

```jsonc
{
  "name": "Lean engine + low front-right tyre + brake check due",
  "adapter": { "ati": "ELM327 v1.4b", "voltage": "12.6V", "latencyMs": [40, 120] },
  "protocol": "6",
  "vin": "WVWZZZ1KZ8W000000",
  "ecus": {
    "7E8": {
      "responses": {
        "0100": "41 00 BE 3F A8 13",
        "0101": "41 01 81 07 65 01",           // MIL on, 1 DTC, catalyst incomplete
        "0105": "41 05 80",                    // 88 °C
        "010C": { "live": "rpm", "base": 810, "jitter": 25 },
        "03":   "43 01 01 71",                 // P0171
        "07":   "47 00",
        "0A":   "4A 00",
        "0202": "42 02 00 01 71"
      }
    },
    "7B8": { "noResponse": true }              // ABS offline
  },
  "faults": [
    { "after": 30, "type": "noData", "request": "0110", "times": 1 }
  ],
  "manual": {
    "tyre_pressure": { "FL": 2.3, "FR": 1.8, "RL": 2.2 },
    "brake_pad": { "front": 7 }
  }
}
```

Rules:

- Unknown request → `NO DATA` (like a real ECU).
- `live` values are generated functions (rpm, coolant warm-up curve, battery charging) so the live strip looks real.
- `faults` inject `noData`, `timeout`, `busError`, `disconnect` at a given request count.

## Demo-car scenarios (v1)

| File | Shows |
|---|---|
| `healthy.json` | Everything green, all monitors ready |
| `lean-engine-low-tyre.json` | Stored P0171, MIL on, high LTFT, low FR tyre entry, brake fluid due |
| `abs-offline.json` | Profile car whose ABS module doesn't answer → "No response — not checked" |
| `old-kline-car.json` | ISO 9141-2, slow replies, 3-codes-per-frame DTC format, few PIDs |
| `flaky-adapter.json` | Random `NO DATA`, one timeout, disconnect at 70 % → partial report |

## Replay

`Report → Save as test scenario` converts a real scan's raw log into a scenario (VIN masked). Each bug found on a real car gets a scenario + failing test before the fix.

## Definition of done for any phase

- Unit + scenario tests green in CI (GitHub Actions, `npm test`).
- Demo car shows the new feature.
- If the phase touches real hardware: one successful run on the real car recorded and saved as a replay scenario.
