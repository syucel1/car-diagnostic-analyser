# Decision log

Short ADR-style records. Add new entries at the bottom; don't edit accepted ones — supersede them.

## ADR-001 Browser app using Web Serial
**Status:** Accepted
**Context:** Want a zero-install app with a rich UI that can talk to a USB adapter.
**Decision:** Static web app in Chrome/Edge using the Web Serial API.
**Consequences:** Desktop Chromium only; must be served over HTTPS or localhost; port selection requires a user click. Demo car works in any browser.

## ADR-002 Read-only enforced by an allowlist in code
**Status:** Accepted
**Context:** Adapters can clear codes, run actuators and write settings. A mistake could leave a car in a bad state.
**Decision:** A single `ReadOnlyGuard` with default-deny allowlist sits between protocol and transport. No override.
**Consequences:** Features like "clear codes" are impossible by design. Every new request type needs an allowlist change and tests.

## ADR-003 ELM327 command set as the only adapter protocol
**Status:** Accepted
**Context:** Most consumer USB adapters speak ELM327 AT commands; STN chips are a superset.
**Decision:** Target ELM327 v1.4 commands; use STN extras only when detected and only for speed.
**Consequences:** Works with cheap and good adapters alike; J2534 pass-through devices are out of scope.

## ADR-004 Progress counts checks, not "health"
**Status:** Accepted
**Context:** A single health percentage would hide unknowns and invite false confidence.
**Decision:** Progress is `k of N checks`; each check has one of five outcome statuses; "no response" is never shown as OK.
**Consequences:** Planner must know N before running; UI wording rules in `ui-screens.md`.

## ADR-005 Simulator first, same scenarios for tests and demo
**Status:** Accepted
**Context:** The car isn't always available, and real-car bugs are hard to reproduce.
**Decision:** Build `SimulatorTransport` in phase 1; scenarios are JSON shared by tests and the demo car; real scans can be exported as scenarios.
**Consequences:** Every feature is demoable without hardware; raw logs must be stored.

## ADR-006 Vehicle-specific knowledge lives in data profiles
**Status:** Accepted
**Context:** ABS, TPMS, oil life etc. are manufacturer-specific.
**Decision:** JSON profiles (module addresses, DIDs, decoder names, DTC tables), selected by VIN.
**Consequences:** Adding a car is mostly data; decoders referenced by name must exist in code.

## ADR-007 Local-only storage
**Status:** Accepted
**Context:** Personal project; VINs and location-free but personal vehicle data.
**Decision:** IndexedDB only, JSON export/import for backup. No backend.
**Consequences:** No sync between devices; nothing to secure server-side.

## Open
- **First enhanced-profile car** — must be chosen with care: some older cars use proprietary transport protocols (e.g. VW TP 2.0) for non-engine modules that a plain ELM327 handles poorly.
- **First adapter** — OBDLink EX vs an existing ELM327 clone.
