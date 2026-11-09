import type { Scenario, FaultSpec } from './scenario';
import { DisconnectedError, TimeoutError, type AdapterInfo, type Transport } from './types';

export interface SimulatorOptions {
  /** Injected for tests; defaults to real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests; defaults to Math.random. */
  random?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Default functional (broadcast) request header for CAN OBD-II. */
const FUNCTIONAL_HEADER = '7DF';

/**
 * Behaves like an ELM327 adapter (echo off, headers on, spaces on) attached
 * to the ECUs described by a scenario.
 */
export class SimulatorTransport implements Transport {
  readonly kind = 'simulator' as const;

  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly listeners = new Set<() => void>();
  private readonly faultsLeft: Map<FaultSpec, number>;
  private header = FUNCTIONAL_HEADER;
  private obdRequests = 0;
  private isOpen = false;
  private disconnected = false;
  /** Every command received, for tests (e.g. proving nothing forbidden was sent). */
  readonly sent: string[] = [];

  constructor(
    private readonly scenario: Scenario,
    options: SimulatorOptions = {},
  ) {
    this.sleep = options.sleep ?? realSleep;
    this.random = options.random ?? Math.random;
    this.faultsLeft = new Map((scenario.faults ?? []).map((f) => [f, f.times ?? 1]));
  }

  async open(): Promise<AdapterInfo> {
    if (this.disconnected) throw new DisconnectedError();
    this.isOpen = true;
    const [id = 'ELM327'] = await this.send('ATZ', 2000);
    for (const cmd of ['ATE0', 'ATL0', 'ATS1', 'ATH1', 'ATAT1', 'ATSP0']) await this.send(cmd, 1000);
    const [rv = ''] = await this.send('ATRV', 1000);
    const voltage = Number.parseFloat(rv);
    return Number.isFinite(voltage) ? { id, voltage } : { id };
  }

  async send(rawCmd: string, timeoutMs: number): Promise<string[]> {
    if (!this.isOpen || this.disconnected) throw new DisconnectedError();
    const cmd = rawCmd.replace(/\s+/g, '').toUpperCase();
    this.sent.push(cmd);

    if (cmd.startsWith('AT')) {
      await this.sleep(5);
      return this.at(cmd);
    }

    this.obdRequests += 1;
    const fault = this.takeFault(cmd);
    const [lo, hi] = this.scenario.adapter.latencyMs;
    const latency = Math.round(lo + this.random() * (hi - lo));

    if (fault) {
      switch (fault.type) {
        case 'disconnect':
          this.disconnect();
          throw new DisconnectedError();
        case 'timeout':
          await this.sleep(timeoutMs);
          throw new TimeoutError(cmd, timeoutMs);
        case 'noData':
          await this.sleep(latency);
          return ['NO DATA'];
        case 'busError':
          await this.sleep(latency);
          return ['CAN ERROR'];
      }
    }

    const targets = this.targetEcus();
    // A physically addressed module that never answers: the request times out.
    if (targets.length === 1 && this.scenario.ecus[targets[0]!]?.noResponse) {
      await this.sleep(timeoutMs);
      throw new TimeoutError(cmd, timeoutMs);
    }

    await this.sleep(latency);
    const lines: string[] = [];
    for (const ecu of targets) {
      const spec = this.scenario.ecus[ecu];
      const data = spec && !spec.noResponse ? spec.responses[cmd] : undefined;
      if (data === undefined) continue;
      const bytes = data.trim().split(/\s+/);
      lines.push(`${ecu} ${bytes.length.toString(16).toUpperCase().padStart(2, '0')} ${bytes.join(' ')}`);
    }
    return lines.length ? lines : ['NO DATA'];
  }

  async close(): Promise<void> {
    this.isOpen = false;
  }

  onDisconnect(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Simulates pulling the USB cable. */
  disconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    this.isOpen = false;
    for (const cb of this.listeners) cb();
  }

  private at(cmd: string): string[] {
    const { adapter, protocol } = this.scenario;
    if (cmd === 'ATZ' || cmd === 'ATWS') {
      this.header = FUNCTIONAL_HEADER;
      return [adapter.ati];
    }
    if (cmd === 'ATI') return [adapter.ati];
    if (cmd === 'ATRV') return [adapter.voltage];
    if (cmd === 'ATDPN') return [`A${protocol}`];
    if (cmd.startsWith('ATSH')) {
      this.header = cmd.slice(4);
      return ['OK'];
    }
    return ['OK'];
  }

  /** Response ids that can answer the current header. */
  private targetEcus(): string[] {
    const ids = Object.keys(this.scenario.ecus);
    if (this.header === FUNCTIONAL_HEADER) {
      // Functional requests reach the OBD ECUs (7E8–7EF) only.
      return ids.filter((id) => /^7E[89A-F]$/.test(id));
    }
    // Physical addressing: response id = request id + 8 (11-bit CAN convention).
    const responseId = (Number.parseInt(this.header, 16) + 8).toString(16).toUpperCase();
    return [responseId];
  }

  private takeFault(cmd: string): FaultSpec | undefined {
    for (const [fault, left] of this.faultsLeft) {
      if (left <= 0) continue;
      if (this.obdRequests < fault.after) continue;
      if (fault.request && fault.request !== cmd) continue;
      this.faultsLeft.set(fault, left - 1);
      return fault;
    }
    return undefined;
  }
}
