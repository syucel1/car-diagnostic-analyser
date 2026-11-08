# Hardware setup

## What you need

| Item | Notes |
|---|---|
| USB OBD-II adapter | ELM327-compatible. Recommended: **OBDLink EX** (STN chip, FTDI USB-serial). Cheap ELM327 clones work for basics but often have firmware bugs, wrong version strings or missing commands. |
| Laptop | Windows / macOS / Linux with **Chrome or Edge** (Web Serial). |
| The car | Petrol from 2001 or diesel from 2004 (EU) has EOBD. Socket within ~60 cm of the steering wheel, usually under the dash. |

Bluetooth / Wi-Fi adapters are out of scope for v1 (Web Serial doesn't reach BLE, and Wi-Fi adapters need raw TCP that browsers can't open).

## Drivers (Windows)

- FTDI-based adapters (OBDLink EX and many others): driver usually installs automatically; device shows as `USB Serial Port (COMx)` in Device Manager → Ports.
- CH340 / CP210x clones: may need the chip vendor's driver.
- Note the COM number — the browser's port picker shows it.

## First connection checklist

1. Car parked, handbrake on, ignition **on** (engine off is fine for codes; idling for live data).
2. Plug adapter into the car, then USB into the laptop.
3. Open the app (`https://…` or `http://localhost:5173` in dev) in Chrome/Edge.
4. **Choose adapter…** → pick the COM port.
5. App runs the init sequence; expect battery ~12.2–12.7 V engine off, ~13.8–14.7 V running.
6. Run scan. Unplug the adapter afterwards.

## Sanity test without the app

A serial terminal (PuTTY, or Chrome's own Web Serial test pages) at 115200 or 38400 baud, 8N1:

```
ATZ        → ELM327 v1.4b   (or STN… for OBDLink)
ATRV       → 12.6V
ATSP0
0100       → 41 00 BE 3F A8 13   (example — your bitmap will differ)
```

If `0100` returns `UNABLE TO CONNECT`, the ignition is probably off.

## Safety

- Never scan while driving, and don't route the cable where it can catch pedals.
- The app is read-only by design (see [safety-allowlist.md](safety-allowlist.md)); don't use other software with this adapter to clear codes unless you understand the consequences.
- Some adapters draw power continuously — unplug when finished.
