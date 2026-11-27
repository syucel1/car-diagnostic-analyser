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
  /** False when the adapter answered but the car did not (ignition off, wrong socket). */
  vehicleResponding?: boolean;
  /** ELM protocol number found by the automatic search, e.g. "6". */
  protocol?: string;
  /** Human-readable protocol, e.g. "ISO 15765-4 CAN (11-bit, 500 kbaud)". */
  protocolName?: string;
}

/** One line of the session log (every command sent and every reply received). */
export interface LogEntry {
  t: number;
  dir: 'tx' | 'rx' | 'note';
  text: string;
}

export interface Transport {
  readonly kind: 'serial' | 'simulator' | 'replay';
  /** Opens the connection and runs the adapter init sequence. */
  open(): Promise<AdapterInfo>;
  /**
   * Sends one command and resolves with the reply lines (no echo, no prompt,
   * no blank lines). Every implementation must pass the command through
   * `assertAllowed` (src/guard) before sending anything.
   * Rejects with ForbiddenRequestError, TimeoutError or DisconnectedError.
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

export class AdapterNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterNotFoundError';
  }
}
