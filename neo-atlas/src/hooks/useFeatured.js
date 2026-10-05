import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { FEATURED, featuredConstellation } from "../lib/constellations.js";

/**
 * The ready-made constellations, each built from one sorted API query over the
 * whole catalog. Only loads once `enabled` (the Constellations tab was opened).
 * Each loads on its own, so one failed request doesn't hide the others;
 * `failed` counts the ones that didn't load.
 */
export function useFeatured(enabled) {
  const [state, setState] = useState({ status: "idle", items: [], failed: 0, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    Promise.allSettled(FEATURED.map((def) => api.list(def.params, { signal: controller.signal }))).then(
      (results) => {
        if (controller.signal.aborted) return;
        const items = [];
        let error = null;
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            items.push({ def: FEATURED[i], constellation: featuredConstellation(FEATURED[i], r.value.asteroids) });
          } else {
            error = r.reason?.message ?? "Couldn't reach the AegisNEO API.";
          }
        });
        const failed = results.length - items.length;
        setState({ status: items.length > 0 ? "ready" : "error", items, failed, error });
      },
    );
    return () => controller.abort();
  }, [enabled, attempt]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, status: s.items.length > 0 ? "ready" : "loading" }));
    setAttempt((n) => n + 1);
  }, []);

  const status = state.status === "idle" && enabled ? "loading" : state.status;
  return { ...state, status, retry };
}
