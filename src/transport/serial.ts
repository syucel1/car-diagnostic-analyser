import { assertAllowed } from '../guard/allowlist';
import { initElm } from './elmInit';
import { AdapterNotFoundError, DisconnectedError, TimeoutError, type AdapterInfo, type LogEntry, type Transport } from './types';
import type { SerialPortLike } from './webSerial';

export interface SerialTransportOptions {
  /** Baud rates to probe, in order. STN adapters default high, many ELM327 clones use 38400. */
  baudRates?: number[];
  /** Receives every command and reply line. */
  onLog?: (entry: LogEntry) => void;
  now?: () => number;
  /** How long to wait for the ATZ banner at each baud rate. */
  resetTimeoutMs?: number;
}

const PROMPT = '>';
const encoder = new TextEncoder();

/**
 * Talks to an ELM327-compatible adapter over Web Serial.
 *
 * - One command in flight at a time (commands are queued).
 * - A reply is everything before the '>' prompt; echo and blank lines are dropped.
 * - On timeout, a carriage return is sent to abort the adapter and the
 *   following prompt is consumed, so the next command starts clean.
 * - Every command passes the read-only guard before a byte is written.
 */
export class ElmSerialTransport implements Transport {
  readonly kind = 'serial' as const;
  /** Baud rate that worked, once open. */
  baudRate?: number;

  private readonly baudRates: number[];
  private readonly onLog?: (entry: LogEntry) => void;
  private readonly now: () => number;
  private readonly resetTimeoutMs: number;
  private readonly listeners = new Set<() => void>();

  private state: 'closed' | 'open' | 'disconnected' = 'closed';
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private readLoopDone: Promise<void> = Promise.resolve();
  private decoder = new TextDecoder();
  private buffer = '';
  private waiting?: { resolve: (text: string) => void; reject: (err: Error) => void };
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly port: SerialPortLike,
    options: SerialTransportOptions = {},
  ) {
    this.baudRates = options.baudRates ?? [115200, 38400];
    this.onLog = options.onLog;
    this.now = options.now ?? Date.now;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 3000;
  }

  async open(): Promise<AdapterInfo> {
    this.port.addEventListener('disconnect', this.handlePortDisconnect);
    const tried: string[] = [];

    for (const baudRate of this.baudRates) {
      try {
        await this.port.open({ baudRate });
      } catch (err) {
        this.port.removeEventListener('disconnect', this.handlePortDisconnect);
        throw new AdapterNotFoundError(
          `Couldn't open the serial port (${err instanceof Error ? err.message : String(err)}). ` +
            'Is another program, such as a serial terminal, using it?',
        );
      }
      this.state = 'open';
      this.buffer = '';
      this.decoder = new TextDecoder();
      this.startReading();
      this.note(`port opened at ${baudRate} baud`);

      let banner: string | undefined;
      try {
        // No resync on timeout here: at the wrong baud rate the port is closed straight away.
        const lines = await this.sendInternal('ATZ', this.resetTimeoutMs, false);
        banner = lines.find((l) => /ELM|STN|OBD/i.test(l));
        tried.push(`${baudRate} baud: ${banner ? 'adapter found' : lines.length ? 'unrecognised reply' : 'no reply'}`);
      } catch (err) {
        if (err instanceof DisconnectedError) throw err;
        tried.push(`${baudRate} baud: no reply`);
      }

      if (banner) {
        this.baudRate = baudRate;
        try {
          return await initElm((cmd, t) => this.send(cmd, t), banner);
        } catch (err) {
          await this.close();
          throw err;
        }
      }
      await this.closePort();
    }

    this.port.removeEventListener('disconnect', this.handlePortDisconnect);
    throw new AdapterNotFoundError(`No ELM327-compatible adapter answered on this port (${tried.join('; ')}).`);
  }

  send(rawCmd: string, timeoutMs: number): Promise<string[]> {
    return this.sendInternal(rawCmd, timeoutMs, true);
  }

  async close(): Promise<void> {
    this.port.removeEventListener('disconnect', this.handlePortDisconnect);
    if (this.state === 'open') await this.closePort();
  }

  onDisconnect(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ---------------------------------------------------------------- internals

  private sendInternal(rawCmd: string, timeoutMs: number, resyncOnTimeout: boolean): Promise<string[]> {
    let cmd: string;
    try {
      cmd = assertAllowed(rawCmd); // nothing below runs for a blocked command
    } catch (err) {
      return Promise.reject(err);
    }
    const run = this.queue.then(() => this.exchange(cmd, timeoutMs, resyncOnTimeout));
    this.queue = run.catch(() => {});
    return run;
  }

  private async exchange(cmd: string, timeoutMs: number, resyncOnTimeout: boolean): Promise<string[]> {
    if (this.state !== 'open') throw new DisconnectedError();
    try {
      const text = await this.writeAndWait(`${cmd}\r`, timeoutMs, () => new TimeoutError(cmd, timeoutMs));
      const lines = this.toLines(text, cmd);
      for (const l of lines) this.log('rx', l);
      return lines;
    } catch (err) {
      if (err instanceof TimeoutError && resyncOnTimeout && this.state === 'open') {
        // Any character aborts a busy ELM327; consume the prompt that follows.
        this.note('timeout — resynchronising');
        const wait = Math.min(1000, timeoutMs);
        await this.writeAndWait('\r', wait, () => new TimeoutError('<resync>', wait)).catch(() => {});
      }
      throw err;
    }
  }

  private writeAndWait(text: string, timeoutMs: number, onTimeout: () => Error): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.buffer = '';
      const timer = setTimeout(() => {
        this.waiting = undefined;
        reject(onTimeout());
      }, timeoutMs);
      this.waiting = {
        resolve: (reply) => {
          clearTimeout(timer);
          this.waiting = undefined;
          resolve(reply);
        },
        reject: (err) => {
          clearTimeout(timer);
          this.waiting = undefined;
          reject(err);
        },
      };
      if (text !== '\r') this.log('tx', text.trim());
      this.write(text).catch(() => this.waiting?.reject(new DisconnectedError('Could not write to the adapter')));
    });
  }

  private async write(text: string): Promise<void> {
    const writable = this.port.writable;
    if (!writable) throw new DisconnectedError();
    const writer = writable.getWriter();
    try {
      await writer.write(encoder.encode(text));
    } finally {
      writer.releaseLock();
    }
  }

  private startReading(): void {
    const readable = this.port.readable;
    if (!readable) return;
    const reader = readable.getReader();
    this.reader = reader;
    this.readLoopDone = (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) this.onData(this.decoder.decode(value, { stream: true }));
        }
      } catch {
        // The device was lost; handled below.
      } finally {
        reader.releaseLock();
        if (this.reader === reader) this.reader = undefined;
        if (this.state === 'open') this.handleDisconnect();
      }
    })();
  }

  private onData(text: string): void {
    this.buffer += text.replace(/\0/g, '');
    const idx = this.buffer.indexOf(PROMPT);
    if (idx < 0) return;
    const reply = this.buffer.slice(0, idx);
    this.buffer = this.buffer.slice(idx + 1);
    // A prompt with nobody waiting (e.g. after a timeout) is simply dropped.
    this.waiting?.resolve(reply);
  }

  private toLines(text: string, cmd: string): string[] {
    const lines = text
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    // Drop the echo (present until ATE0 takes effect).
    if (lines.length && lines[0]!.replace(/\s+/g, '').toUpperCase() === cmd) lines.shift();
    return lines;
  }

  private async closePort(): Promise<void> {
    this.state = 'closed';
    this.waiting?.reject(new DisconnectedError('Connection closed'));
    try {
      await this.reader?.cancel();
    } catch {
      /* already gone */
    }
    await this.readLoopDone;
    try {
      await this.port.close();
    } catch {
      /* already closed or unplugged */
    }
    this.note('port closed');
  }

  private readonly handlePortDisconnect = () => this.handleDisconnect();

  private handleDisconnect(): void {
    if (this.state === 'disconnected') return;
    const wasOpen = this.state === 'open';
    this.state = 'disconnected';
    this.note('adapter disconnected');
    this.waiting?.reject(new DisconnectedError());
    if (wasOpen) for (const cb of this.listeners) cb();
  }

  private log(dir: LogEntry['dir'], text: string): void {
    this.onLog?.({ t: this.now(), dir, text });
  }

  private note(text: string): void {
    this.log('note', text);
  }
}
