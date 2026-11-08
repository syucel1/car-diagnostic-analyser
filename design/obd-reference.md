# OBD-II / ELM327 reference

Working notes for the protocol layer. `A`, `B`, `C`, `D` are the data bytes after the service echo and PID.

## Adapter init sequence

```
ATZ          reset (wait ~1 s, reply contains "ELM327 v1.x" or "STN...")
ATE0         echo off
ATL0         linefeeds off
ATS0         spaces off           (parser also tolerates spaces)
ATH1         headers on           (so we know which ECU answered)
ATAT1        adaptive timing
ATSP0        automatic protocol
ATRV         battery voltage, e.g. "12.6V"
0100         first request – adapter searches; may print "SEARCHING..."
ATDPN        protocol number actually found, e.g. "A6" (auto, ISO 15765-4 CAN 11/500)
```

Protocol numbers: `1` J1850 PWM, `2` J1850 VPW, `3` ISO 9141-2, `4` KWP2000 5-baud, `5` KWP2000 fast, `6` CAN 11-bit 500k, `7` CAN 29-bit 500k, `8` CAN 11-bit 250k, `9` CAN 29-bit 250k. EU cars are usually `3`–`6`.

### Adapter replies that are not data

| Reply | Meaning → app status |
|---|---|
| `NO DATA` | ECU didn't answer this request → `unsupported` (if PID known supported: retry once, then `no_response`) |
| `UNABLE TO CONNECT` | No protocol found — ignition off? → connect error |
| `BUS INIT: ...ERROR` | K-line init failed → connect error, suggest ignition on |
| `CAN ERROR`, `BUS ERROR`, `FB ERROR` | Bus problem → retry, then `no_response` |
| `?` | Adapter didn't understand the command → bug / unsupported adapter feature |
| `STOPPED` | Our abort, or a new char arrived mid-request |
| `SEARCHING...` | Informational, ignore |

## CAN addressing

- Functional (broadcast) request ID `7DF`; ECUs answer on `7E8`–`7EF` (engine usually `7E8`, gearbox often `7E9`).
- Physical request to one ECU: `ATSH 7E0` + `ATCRA 7E8`.
- Other modules (ABS, airbag, TPMS…) use manufacturer-specific IDs → defined in the vehicle profile.
- Some older cars (e.g. many pre-2010 VAG models) talk to non-engine modules over proprietary transport protocols such as VW TP 2.0 that a plain ELM327 can't do well. Check this before choosing the first profile car.

## Service 01 — PIDs for v1

| PID | Name | Formula | Unit |
|---|---|---|---|
| `00` `20` `40` `60` … | Supported PIDs bitmap | 32 bits, MSB = next PID | — |
| `01` | Monitor status since DTCs cleared | see below | — |
| `03` | Fuel system status | bit field | — |
| `04` | Calculated engine load | A × 100 / 255 | % |
| `05` | Coolant temperature | A − 40 | °C |
| `06` / `07` | Short / long-term fuel trim bank 1 | (A − 128) × 100 / 128 | % |
| `08` / `09` | Short / long-term fuel trim bank 2 | (A − 128) × 100 / 128 | % |
| `0B` | Intake manifold pressure | A | kPa |
| `0C` | Engine speed | (256A + B) / 4 | rpm |
| `0D` | Vehicle speed | A | km/h |
| `0E` | Timing advance | A / 2 − 64 | ° |
| `0F` | Intake air temperature | A − 40 | °C |
| `10` | MAF air flow | (256A + B) / 100 | g/s |
| `11` | Throttle position | A × 100 / 255 | % |
| `1C` | OBD standard | enum (6 = EOBD, …) | — |
| `1F` | Run time since start | 256A + B | s |
| `21` | Distance with MIL on | 256A + B | km |
| `2F` | Fuel tank level | A × 100 / 255 | % |
| `31` | Distance since codes cleared | 256A + B | km |
| `33` | Barometric pressure | A | kPa |
| `41` | Monitor status this drive cycle | as `01` B–D | — |
| `42` | Control module voltage | (256A + B) / 1000 | V |
| `46` | Ambient air temperature | A − 40 | °C |
| `5C` | Engine oil temperature | A − 40 | °C |

### PID 01 — monitor status

- **A**: bit 7 = MIL (check-engine light) on; bits 0–6 = number of stored emission DTCs.
- **B**: bit 3 = 0 spark ignition (petrol), 1 compression (diesel). Bits 0–2 = misfire / fuel system / components monitors **supported**; bits 4–6 = same three **incomplete** (1 = not ready).
- **C**: non-continuous monitors **supported**; **D**: same monitors **incomplete**. Petrol bit order: catalyst, heated catalyst, EVAP, secondary air, (A/C – reserved), O₂ sensor, O₂ heater, EGR/VVT. Diesel: NMHC cat, NOx/SCR, (reserved), boost pressure, (reserved), exhaust gas sensor, PM filter, EGR/VVT.
- Readiness = supported monitors whose incomplete bit is 0.

## DTCs (services 03, 07, 0A)

Each DTC is 2 bytes:

```
byte 1: [7:6] system  00=P  01=C  10=B  11=U
        [5:4] first digit 0–3
        [3:0] second digit (hex)
byte 2: last two digits (hex)

0x01 0x71 → P0171      0x41 0x23 → C0123      0xC1 0x00 → U0100
```

- CAN: reply `43 NN d1 d2 d1 d2 …` where `NN` = count (may be multi-frame).
- Non-CAN: reply `43 d1 d2 d1 d2 d1 d2` (3 per frame), padded with `00 00` – ignore `P0000`.
- Several ECUs may answer; keep the ECU id on each code.

## Service 02 — freeze frame

Request `02 <pid> 00` (frame 0). `02 02 00` returns the DTC that stored the frame. Then read the same PIDs as service 01 (`02 0C 00`, `02 05 00`, …) and decode with the same formulas.

## Service 09

- `09 02` VIN – multi-frame, 17 ASCII chars (non-CAN replies include a leading count byte).
- `09 04` calibration IDs, `09 0A` ECU name.

## UDS basics (profile modules)

- `19 02 FF` → `59 02 <availMask> [DTC_hi DTC_mid DTC_lo status]…` (3-byte DTCs: first two bytes decode like OBD, third is the failure-type byte).
- `22 <DID hi> <DID lo>` → `62 <DID> data…`. `F190` = VIN on most UDS ECUs.
- Negative response `7F <SID> <NRC>`: `11` service not supported, `12` sub-function not supported, `13` bad length, `22` conditions not correct, `31` request out of range, `33` security access denied, `78` response pending (keep waiting).

## Sources to verify against

- SAE J1979 / ISO 15031-5 (service and PID definitions)
- ELM327 datasheet (AT commands, error messages)
- ISO 14229-1 (UDS services and NRCs)
- Wikipedia "OBD-II PIDs" (convenient summary – cross-check formulas against the standard or a real capture)
