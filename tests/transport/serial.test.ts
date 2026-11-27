import { describe, expect, it } from 'vitest';
import { ForbiddenRequestError } from '../../src/guard/allowlist';
import { ElmSerialTransport } from '../../src/transport/serial';
import { AdapterNotFoundError, DisconnectedError, TimeoutError, type LogEntry } from '../../src/transport/types';
import { describePort } from '../../src/transport/webSerial';
import { defaultResponder, FakeElmPort } from '../fakeSerialPort';

const fast = { resetTimeoutMs: 100 };

describe('ElmSerialTransport — connecting', () => {
  it('finds the adapter at the second baud rate and runs init', async () => {
    const port = new FakeElmPort({ baudRate: 38400 });
    const t = new ElmSerialTransport(port, fast);
    const info = await t.open();
    expect(t.baudRate).toBe(38400);
    expect(port.openCount).toBe(2); // 115200 failed, 38400 worked
    expect(info).toEqual({
      id: 'ELM327 v1.5',
      voltage: 12.4,
      vehicleResponding: true,
      protocol: '6',
      protocolName: 'ISO 15765-4 CAN (11-bit, 500 kbaud)',
    });
    const cmds = port.written.map((w) => w.trim()).filter((w) => w);
    expect(cmds).toEqual(expect.arrayContaining(['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATAT1', 'ATSP0', 'ATI', 'ATRV', '0100', 'ATDPN']));
    await t.close();
    expect(port.isOpen).toBe(false);
  });

  it('reports a clear error when nothing answers at any baud rate', async () => {
    const port = new FakeElmPort({ baudRate: 9600 });
    const t = new ElmSerialTransport(port, fast);
    await expect(t.open()).rejects.toBeInstanceOf(AdapterNotFoundError);
    await expect(new ElmSerialTransport(new FakeElmPort({ baudRate: 9600 }), fast).open()).rejects.toThrow(
      /115200 baud: no reply; 38400 baud: no reply/,
    );
    expect(port.isOpen).toBe(false);
  });

  it('reports a port that cannot be opened', async () => {
    const port = new FakeElmPort();
    await port.open({ baudRate: 38400 }); // e.g. held by another program
    await expect(new ElmSerialTransport(port, fast).open()).rejects.toThrow(/another program/);
  });

  it('reports when the car does not answer the probe', async () => {
    const port = new FakeElmPort({
      respond: (c) => (/^0/.test(c) ? 'SEARCHING...\rUNABLE TO CONNECT' : defaultResponder(c)),
    });
    const info = await new ElmSerialTransport(port, fast).open();
    expect(info.vehicleResponding).toBe(false);
    expect(info.protocol).toBeUndefined();
  });
});

describe('ElmSerialTransport — framing', () => {
  it('reassembles replies split into tiny chunks and strips echo', async () => {
    const port = new FakeElmPort({ chunkSize: 2 });
    const t = new ElmSerialTransport(port, fast);
    await t.open();
    expect(await t.send('0105', 500)).toEqual(['7E803410580']);
    expect(await t.send('01 05', 500)).toEqual(['7E803410580']);
  });

  it('ignores NUL bytes some adapters send', async () => {
    const port = new FakeElmPort({ respond: (c) => (c === '0105' ? '7E8\u00000341\u00000580' : defaultResponder(c)) });
    const t = new ElmSerialTransport(port, fast);
    await t.open();
    expect(await t.send('0105', 500)).toEqual(['7E803410580']);
  });

  it('queues concurrent sends so replies never mix', async () => {
    const port = new FakeElmPort({ latencyMs: 5, respond: (c) => (c.startsWith('01') ? `7E8034105${c.slice(2)}` : defaultResponder(c)) });
    const t = new ElmSerialTransport(port, fast);
    await t.open();
    const [a, b, c] = await Promise.all([t.send('0105', 500), t.send('010C', 500), t.send('010D', 500)]);
    expect([a, b, c]).toEqual([['7E803410505'], ['7E80341050C'], ['7E80341050D']]);
  });

  it('times out, resynchronises, and the next command works', async () => {
    let stuck = true;
    const port = new FakeElmPort({
      respond: (c) => {
        if (c === '0110' && stuck) return null; // hangs
        if (c === '') return 'STOPPED'; // the resync CR
        return defaultResponder(c);
      },
    });
    const t = new ElmSerialTransport(port, fast);
    await t.open();
    await expect(t.send('0110', 50)).rejects.toBeInstanceOf(TimeoutError);
    stuck = false;
    expect(await t.send('0105', 500)).toEqual(['7E803410580']);
  });
});

describe('ElmSerialTransport — read-only guard', () => {
  it('never writes a single byte for a blocked command', async () => {
    const port = new FakeElmPort();
    const t = new ElmSerialTransport(port, fast);
    await t.open();
    const before = port.written.length;
    for (const cmd of ['04', '14FFFFFF', '2EF19000', '2F', '310101', '1101', '2701', '280301', '3400', '8502', '1003', 'ATMA', 'ATPP0CSV23', 'STPBR115200']) {
      await expect(t.send(cmd, 500)).rejects.toBeInstanceOf(ForbiddenRequestError);
    }
    expect(port.written.length).toBe(before);
    // and the connection is still usable
    expect(await t.send('0105', 500)).toEqual(['7E803410580']);
  });
});

describe('ElmSerialTransport — unplugging', () => {
  it('rejects the in-flight command and notifies listeners', async () => {
    const port = new FakeElmPort({ respond: (c) => (c === '0110' ? null : defaultResponder(c)) });
    const t = new ElmSerialTransport(port, fast);
    await t.open();
    let notified = 0;
    t.onDisconnect(() => notified++);
    const inflight = t.send('0110', 5000);
    setTimeout(() => port.unplug(), 10);
    await expect(inflight).rejects.toBeInstanceOf(DisconnectedError);
    expect(notified).toBe(1);
    await expect(t.send('0105', 500)).rejects.toBeInstanceOf(DisconnectedError);
    await t.close(); // safe after unplug
  });
});

describe('ElmSerialTransport — session log', () => {
  it('logs commands, replies and notes', async () => {
    const log: LogEntry[] = [];
    const t = new ElmSerialTransport(new FakeElmPort({ baudRate: 115200 }), { ...fast, onLog: (e) => log.push(e) });
    await t.open();
    await t.send('0105', 500);
    const text = log.map((e) => `${e.dir} ${e.text}`);
    expect(text).toContain('note port opened at 115200 baud');
    expect(text).toContain('tx 0105');
    expect(text).toContain('rx 7E803410580');
  });
});

describe('describePort', () => {
  it('names common USB-serial chips', () => {
    expect(describePort(new FakeElmPort({ vendorId: 0x0403 }))).toBe('FTDI USB serial (0403:6015)');
    expect(describePort(new FakeElmPort())).toBe('Serial port');
  });
});
