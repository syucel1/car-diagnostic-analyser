import { useCallback, useEffect, useReducer, useRef } from 'react';
import { buildDemoPlan } from '../scan/demoPlan';
import { initialView, reduceScan } from '../scan/progress';
import { runScan } from '../scan/runner';
import type { Scenario } from '../transport/scenario';
import { SimulatorTransport } from '../transport/simulator';

/** Runs a demo scan against the simulator and exposes the reduced view state. */
export function useDemoScan(scenario: Scenario) {
  const [view, dispatch] = useReducer(reduceScan, initialView);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const transport = new SimulatorTransport(scenario);
    const plan = buildDemoPlan(scenario.manual);
    runScan(transport, plan, {
      signal: controller.signal,
      onEvent: (e) => {
        // Ignore late events from a scan that was replaced by a new one.
        if (abortRef.current === controller) dispatch(e);
      },
    }).catch(() => {
      /* connect errors are already in the view via scan:error */
    });
  }, [scenario]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  useEffect(() => {
    start();
    return () => abortRef.current?.abort();
  }, [start]);

  return { view, start, stop };
}
