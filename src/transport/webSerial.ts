/**
 * The small part of the Web Serial API this app uses, typed locally so tests
 * can supply a fake port. See https://wicg.github.io/serial/
 */
export interface SerialPortInfoLike {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialPortLike {
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: 'none'; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  addEventListener(type: 'disconnect', listener: () => void): void;
  removeEventListener(type: 'disconnect', listener: () => void): void;
  getInfo?(): SerialPortInfoLike;
}

export interface SerialLike {
  requestPort(options?: { filters?: SerialPortInfoLike[] }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

/** navigator.serial, if this browser has Web Serial (desktop Chrome/Edge over HTTPS or localhost). */
export function getSerial(): SerialLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { serial?: SerialLike }).serial;
}

/** USB-serial chip makers commonly used in OBD adapters. */
const USB_VENDORS: Record<number, string> = {
  0x0403: 'FTDI',
  0x1a86: 'CH340',
  0x10c4: 'Silicon Labs CP210x',
  0x067b: 'Prolific PL2303',
  0x0483: 'STMicroelectronics',
};

/** A short label for a port, e.g. "FTDI USB serial (0403:6015)". */
export function describePort(port: SerialPortLike): string {
  const info = port.getInfo?.() ?? {};
  if (info.usbVendorId === undefined) return 'Serial port';
  const vid = info.usbVendorId.toString(16).padStart(4, '0');
  const pid = (info.usbProductId ?? 0).toString(16).padStart(4, '0');
  const vendor = USB_VENDORS[info.usbVendorId] ?? 'USB';
  return `${vendor} USB serial (${vid}:${pid})`;
}
