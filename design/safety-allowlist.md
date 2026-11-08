# Safety: the read-only allowlist

The app must never change anything in the car. That is enforced by `ReadOnlyGuard` in `src/guard/`, which every request passes through before reaching the transport. If a request isn't explicitly allowed, it is refused — there is no override, setting or "expert mode".

## Allowed

### Adapter (ELM327 / STN) commands

| Command | Purpose |
|---|---|
| `ATZ`, `ATWS` | Reset adapter |
| `ATI`, `AT@1`, `STI`, `STDI` | Identify adapter |
| `ATE0`, `ATL0`, `ATS0`, `ATH0`/`ATH1` | Echo, linefeeds, spaces, headers |
| `ATSP0`, `ATSPx`, `ATDP`, `ATDPN` | Select / describe protocol |
| `ATAT0-2`, `ATST xx` | Adaptive timing, timeout |
| `ATSH xxx`, `ATCRA xxx`, `ATCAF0/1`, `ATFCSH`, `ATFCSD`, `ATFCSM` | Addressing a specific module, flow control (needed for UDS reads) |
| `ATRV` | Read battery voltage at the socket |

### OBD-II services

| Service | Name | Notes |
|---|---|---|
| `01` | Current data | PIDs, monitor status |
| `02` | Freeze frame | |
| `03` | Stored DTCs | |
| `06` | On-board monitor test results | Read-only results |
| `07` | Pending DTCs | |
| `09` | Vehicle information | VIN, calibration IDs, ECU name |
| `0A` | Permanent DTCs | |

### UDS (ISO 14229) services — profile modules only

| SID | Name | Restriction |
|---|---|---|
| `19` | ReadDTCInformation | Sub-functions `01`, `02`, `04`, `06`, `0A` only |
| `22` | ReadDataByIdentifier | Only DIDs listed in the active vehicle profile |
| `3E` | TesterPresent | `3E 00` / `3E 80` only |
| `10` | DiagnosticSessionControl | `10 01` (default session) only |

KWP2000 equivalents (`18` read DTCs by status, `21` / `1A` read data by local ID / ECU ID) are allowed for profiles that need them, with the same "listed in profile" rule.

## Blocked — always

| Request | Why it's dangerous |
|---|---|
| OBD `04` Clear DTCs | Erases codes, freeze frame and readiness monitors (car may then fail an emissions test until monitors re-run) |
| OBD `08` Control on-board system | Runs tests / actuators |
| UDS `11` ECUReset | Reboots a module |
| UDS `14` ClearDiagnosticInformation | Clears codes |
| UDS `27` SecurityAccess | Gateway to writes and programming |
| UDS `28` CommunicationControl | Can silence modules on the bus |
| UDS `2E` WriteDataByIdentifier | Changes settings / coding |
| UDS `2F` InputOutputControl | Drives actuators (pumps, valves, lights) |
| UDS `31` RoutineControl | Runs routines (bleeding, calibrations, resets) |
| UDS `34`–`37`, `3D` | Download / upload / write memory (flashing) |
| UDS `85` ControlDTCSetting | Stops modules recording faults |
| UDS `10 02` / `10 03` / other non-default sessions | Programming / extended sessions |
| KWP `14`, `30`, `31`, `3B` | Clear, I/O control, routines, write |
| `ATMA`, `STM*` monitor-all | Floods the adapter; not needed |
| `ATPP*`, `STP*` programmable parameters | Persistently reconfigures the adapter |
| Anything not on the allowed list | Default deny |

## Tests that must exist

- For every blocked SID: a request built through the public API throws `ForbiddenRequestError`, and the simulator transport records **zero** bytes sent.
- Hex-string fuzzing: random request strings are either allowed (and parse to an allowed SID) or rejected.
- UDS `22` with a DID not in the active profile is rejected.

## Operational safety (shown in the UI)

- Car parked, handbrake on, ignition on. Engine off or idling. Never scan while driving.
- If `ATRV` < 11.8 V: warn that the battery is low and a long session could flatten it.
- After the scan: remind the user to unplug the adapter.
- The report says plainly which systems were **not** checked, and the app never presents a scan as proof the car is safe.
