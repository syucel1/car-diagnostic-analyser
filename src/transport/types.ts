/**
 * Transport: moves text commands to an ELM327-compatible adapter and returns
 * the reply lines received before the '>' prompt.
 *
 * Implementations: SimulatorTransport (phase 1), ElmSerialTransport (phase 2),
 * ReplayTransport (later). Only the protocol layer may call `send`.
 */
export interface AdapterInfo {
  /** Identification string, e.g. "ELM327 v1.4b" or "STN2100 v5.10". */
  id: string;
  /** Battery voltage at the OBD socket in volts, if the adapter reported it. */
  voltage?: number;
}

export interface Transport {
  readonly kind: 'serial' | 'simulator' | 'replay';
  /** Opens the connection and runs the adapter init sequence. */
  open(): Promise<AdapterInfo>;
  /**
   * Sends one command and resolves with the reply lines (no echo, no prompt,
   * no blank lines). Rejects with TimeoutError or DisconnectedError.
   */
  send(cmd: string, timeoutMs: number): Promise<string[]>;
  close(): Promise<void>;
  /** Registers a disconnect listener; returns an unsubscribe function. */
  onDisconnect(cb: () => void): () => void;
}

export class TimeoutError extends Error {
  constructor(cmd: string, timeoutMs: number) {
    super(`No reply to "${cmd}" within ${timeoutMs} ms`);
    this.name = 'TimeoutError';
  }
}

export class DisconnectedError extends Error {
  constructor(message = 'Adapter disconnected') {
    super(message);
    this.name = 'DisconnectedError';
  }
}
