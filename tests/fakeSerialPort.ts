import type { SerialPortLike } from '../src/transport/webSerial';

export interface FakePortOptions {
  /** Baud rate the fake adapter speaks; other rates produce garbage. */
  baudRate?: number;
  /** Reply text (without prompt) per command, or null to never answer. */
  respond?: (cmd: string) => string | null;
  /** Split output into chunks of this many characters (exercises framing). */
  chunkSize?: number;
  /** Delay before replying, ms. */
  latencyMs?: number;
  vendorId?: number;
}

/** Default behaviour: a small ELM327 with one CAN engine ECU. */
export function defaultResponder(cmd: string): string | null {
  if (cmd === 'ATZ') return '\r\rELM327 v1.5';
  if (cmd === 'ATI') return 'ELM327 v1.5';
  if (cmd === 'ATRV') return '12.4V';
  if (cmd === 'ATDPN') return 'A6';
  if (cmd.startsWith('AT')) return 'OK';
  if (cmd === '0100') return 'SEARCHING...\r7E8064100BE3FA813';
  if (cmd === '0105') return '7E803410580';
  return 'NO DATA';
}

/**
 * A fake Web Serial port wired to a scripted ELM327. Records every byte the
 * app writes so tests can prove forbidden commands never reach the wire.
 */
export class FakeElmPort implements SerialPortLike {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  /** Every command written, as text (including '\r'). */
  readonly written: string[] = [];
  openCount = 0;
  closeCount = 0;
  isOpen = false;

  private controller?: ReadableStreamDefaultController<Uint8Array>;
  private baud = 0;
  private echo = true;
  private pending = '';
  private listeners = new Set<() => void>();
  private readonly opts: Required<Omit<FakePortOptions, 'vendorId'>> & { vendorId?: number };

  constructor(options: FakePortOptions = {}) {
    this.opts = {
      baudRate: options.baudRate ?? 38400,
      respond: options.respond ?? defaultResponder,
      chunkSize: options.chunkSize ?? 1000,
      latencyMs: options.latencyMs ?? 1,
      vendorId: options.vendorId,
    };
  }

  async open({ baudRate }: { baudRate: number }): Promise<void> {
    if (this.isOpen) throw new Error('The port is already open.');
    this.isOpen = true;
    this.openCount += 1;
    this.baud = baudRate;
    this.echo = true;
    this.readable = new ReadableStream<Uint8Array>({
      start: (c) => {
        this.controller = c;
      },
    });
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => this.onWrite(new TextDecoder().decode(chunk)),
    });
  }

  async close(): Promise<void> {
    if (!this.isOpen) throw new Error('The port is already closed.');
    if (this.readable?.locked || this.writable?.locked) throw new Error('Streams are locked.');
    this.isOpen = false;
    this.closeCount += 1;
    this.readable = null;
    this.writable = null;
  }

  addEventListener(_type: 'disconnect', l: () => void) {
    this.listeners.add(l);
  }
  removeEventListener(_type: 'disconnect', l: () => void) {
    this.listeners.delete(l);
  }
  getInfo() {
    return this.opts.vendorId === undefined ? {} : { usbVendorId: this.opts.vendorId, usbProductId: 0x6015 };
  }

  /** Pull the cable: the read stream errors and 'disconnect' fires. */
  unplug(): void {
    this.controller?.error(new Error('The device has been lost.'));
    this.isOpen = false;
    for (const l of this.listeners) l();
  }

  /** Push arbitrary text to the app (e.g. a stray prompt). */
  emit(text: string): void {
    for (let i = 0; i < text.length; i += this.opts.chunkSize) {
      try {
        this.controller?.enqueue(new TextEncoder().encode(text.slice(i, i + this.opts.chunkSize)));
      } catch {
        return; // stream already closed by the app or the unplug: data is lost, as on real hardware
      }
    }
  }

  private onWrite(text: string): void {
    this.written.push(text);
    this.pending += text;
    let idx: number;
    while ((idx = this.pending.indexOf('\r')) >= 0) {
      const cmd = this.pending.slice(0, idx).replace(/\s+/g, '').toUpperCase();
      this.pending = this.pending.slice(idx + 1);
      this.handle(cmd);
    }
  }

  private handle(cmd: string): void {
    if (this.baud !== this.opts.baudRate) {
      // Wrong baud: the adapter sees noise and answers with noise, no prompt.
      setTimeout(() => this.emit('þà\u0000ø'), this.opts.latencyMs);
      return;
    }
    const reply = this.opts.respond(cmd);
    if (cmd === 'ATE0') this.echo = false;
    if (cmd === 'ATZ') this.echo = true;
    if (reply === null) return; // never answers
    const echo = this.echo && cmd !== 'ATE0' ? `${cmd}\r` : '';
    setTimeout(() => this.emit(`${echo}${reply}\r\r>`), this.opts.latencyMs);
  }
}
