import { assertAllowed } from '../guard/allowlist';
import { initElm } from './elmInit';
import type { Scenario, FaultSpec } from './scenario';
import { DisconnectedError, TimeoutError, type AdapterInfo, type LogEntry, type Transport } from './types';

export interface SimulatorOptions {
  /** Injected for tests; defaults to real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests; defaults to Math.random. */
  random?: () => number;
  /** Receives every command and reply, like the serial transport's session log. */
  onLog?: (entry: LogEntry) => void;
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Default functional (broadcast) request header for CAN OBD-II. */
const FUNCTIONAL_HEADER = '7DF';

/**
 * Behaves like an ELM327 adapter (headers on) attached to the ECUs described
 * by a scenario. Uses the same guard and init sequence as the serial transport.
 */
export class SimulatorTransport implements Transport {
  readonly kind = 'simulator' as const;

  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly onLog?: (entry: LogEntry) => void;
  private readonly listeners = new Set<() => void>();
  private readonly faultsLeft: Map<FaultSpec, number>;
  private header = FUNCTIONAL_HEADER;
  private spaces = true;
  private obdRequests = 0;
  private isOpen = false;
  private disconnected = false;
  /** Every command that passed the guard and reached the "adapter", for tests. */
  readonly sent: string[] = [];

  constructor(
    private readonly scenario: Scenario,
    options: SimulatorOptions = {},
  ) {
    this.sleep = options.sleep ?? realSleep;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.onLog = options.onLog;
    this.faultsLeft = new Map((scenario.faults ?? []).map((f) => [f, f.times ?? 1]));
  }

  async open(): Promise<AdapterInfo> {
    if (this.disconnected) throw new DisconnectedError();
    this.isOpen = true;
    const [banner = 'ELM327'] = await this.send('ATZ', 2000);
    return initElm((cmd, t) => this.send(cmd, t), banner);
  }

  async send(rawCmd: string, timeoutMs: number): Promise<string[]> {
    const cmd = assertAllowed(rawCmd); // throws before anything is "sent"
    if (!this.isOpen || this.disconnected) throw new DisconnectedError();
    this.sent.push(cmd);
    this.log('tx', cmd);
    const lines = await this.respond(cmd, timeoutMs);
    for (const l of lines) this.log('rx', l);
    return lines;
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
    this.log('note', 'adapter disconnected');
    for (const cb of this.listeners) cb();
  }

  private log(dir: LogEntry['dir'], text: string) {
    this.onLog?.({ t: this.now(), dir, text });
  }

  private async respond(cmd: string, timeoutMs: number): Promise<string[]> {
    if (cmd.startsWith('AT') || cmd.startsWith('ST')) {
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

    if (this.scenario.ignitionOff) {
      await this.sleep(latency * 4);
      return ['SEARCHING...', 'UNABLE TO CONNECT'];
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
      const pci = bytes.length.toString(16).toUpperCase().padStart(2, '0');
      const parts = [ecu, pci, ...bytes];
      lines.push(this.spaces ? parts.join(' ') : parts.join(''));
    }
    return lines.length ? lines : ['NO DATA'];
  }

  private at(cmd: string): string[] {
    const { adapter, protocol } = this.scenario;
    if (cmd === 'ATZ' || cmd === 'ATWS') {
      this.header = FUNCTIONAL_HEADER;
      this.spaces = true;
      return [adapter.ati];
    }
    if (cmd === 'ATI') return [adapter.ati];
    if (cmd === 'ATRV') return [adapter.voltage];
    if (cmd === 'ATDPN') return [this.scenario.ignitionOff ? 'A0' : `A${protocol}`];
    if (cmd === 'ATS0' || cmd === 'ATS1') this.spaces = cmd === 'ATS1';
    if (cmd.startsWith('ATSH')) this.header = cmd.slice(4);
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
