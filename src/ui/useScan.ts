import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { buildDemoPlan, buildPlan } from '../scan/demoPlan';
import { initialView, reduceScan } from '../scan/progress';
import { runScan } from '../scan/runner';
import type { Scenario } from '../transport/scenario';
import { ElmSerialTransport } from '../transport/serial';
import { SimulatorTransport } from '../transport/simulator';
import type { LogEntry, Transport } from '../transport/types';
import type { SerialPortLike } from '../transport/webSerial';

export type ScanSource =
  | { kind: 'demo'; scenario: Scenario }
  | { kind: 'serial'; port: SerialPortLike; label: string };

/**
 * Scans run one after another across the whole app, so a new scan never opens
 * the serial port before the previous one has closed it (React StrictMode
 * mounts effects twice in development; "Run again" restarts quickly).
 */
let lastRun: Promise<unknown> = Promise.resolve();

/** Friendly description of what the adapter is doing while connecting. */
function connectStepFor(e: LogEntry): string | undefined {
  if (e.dir === 'note') {
    const m = /port opened at (\d+) baud/.exec(e.text);
    if (m) return `Looking for the adapter at ${m[1]} baud…`;
    return undefined;
  }
  if (e.dir !== 'tx') return undefined;
  if (e.text === 'ATZ') return 'Resetting the adapter…';
  if (e.text === '0100') return "Searching for the car's protocol (can take up to 10 seconds)…";
  if (e.text === 'ATDPN') return 'Car found — reading protocol…';
  if (e.text.startsWith('AT')) return 'Configuring the adapter…';
  return undefined;
}

export function useScan(source: ScanSource) {
  const [view, dispatch] = useReducer(reduceScan, initialView);
  const [connectStep, setConnectStep] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<LogEntry[]>([]);

  const start = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const current = () => abortRef.current === controller;
    let connecting = true;

    const prev = lastRun;
    lastRun = (async () => {
      await prev.catch(() => {});
      if (controller.signal.aborted) return;
      logRef.current = [];
      setConnectStep(undefined);

      const onLog = (e: LogEntry) => {
        logRef.current.push(e);
        if (connecting && current()) {
          const step = connectStepFor(e);
          if (step) setConnectStep(step);
        }
      };
      const transport: Transport =
        source.kind === 'demo' ? new SimulatorTransport(source.scenario, { onLog }) : new ElmSerialTransport(source.port, { onLog });
      const plan = source.kind === 'demo' ? buildDemoPlan(source.scenario.manual) : buildPlan();

      try {
        await runScan(transport, plan, {
          signal: controller.signal,
          // Real ECUs can be slower than the simulator; allow a little more.
          timeoutMs: source.kind === 'serial' ? 1500 : 1000,
          onEvent: (e) => {
            if (e.type === 'scan:planned') connecting = false;
            if (current()) dispatch(e);
          },
        });
      } catch {
        /* connect errors are already in the view via scan:error */
      } finally {
        await transport.close().catch(() => {});
      }
    })();
  }, [source]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const getLog = useCallback(() => logRef.current, []);

  useEffect(() => {
    start();
    return () => abortRef.current?.abort();
  }, [start]);

  return { view, start, stop, getLog, connectStep };
}
