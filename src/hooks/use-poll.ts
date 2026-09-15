import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, type ActionRef } from "@/lib/neon-actions";

/* ====================================================================== */
/* ChopMboa — polling bridge for Neon-backed actions                      */
/* Convex actions are not reactive: this hook re-fetches on an interval   */
/* (and on demand) so the dashboard feels live like before.               */
/* ====================================================================== */

const DEFAULT_INTERVAL_MS = 15_000;

export function usePollAction<T>(
  actionRef: ActionRef,
  args: Record<string, unknown> | null,
  intervalMs = DEFAULT_INTERVAL_MS,
): { data: T | undefined; loading: boolean; refresh: () => void } {
  const runAction = useAction(actionRef);
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const argsKey = args ? JSON.stringify(args) : "null";
  const argsRef = useRef(argsKey);
  argsRef.current = argsKey;
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  const run = useCallback(async () => {
    if (argsRef.current === "null") {
      if (mounted.current) {
        setData(undefined);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const parsed = JSON.parse(argsRef.current) as Record<string, unknown>;
      const result = await runAction(parsed);
      if (mounted.current) setData(result);
    } catch (err) {
      // Surface through console; UI keeps last good data.
      console.warn("usePollAction error:", err);
      if (mounted.current) setData(undefined);
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runAction]);

  useEffect(() => {
    mounted.current = true;
    void run();
    const id = window.setInterval(() => void run(), intervalMs);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [run, argsKey, tick, intervalMs]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refresh };
}
