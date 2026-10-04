import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { FEATURED, featuredConstellation } from "../lib/constellations.js";

/**
 * The ready-made constellations, each built from one sorted API query over the
 * whole catalog. Only loads once `enabled` (the Constellations tab was opened).
 */
export function useFeatured(enabled) {
  const [state, setState] = useState({ status: "idle", items: [], error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    Promise.all(FEATURED.map((def) => api.list(def.params, { signal: controller.signal })))
      .then((pages) => {
        const items = pages.map((page, i) => ({
          def: FEATURED[i],
          constellation: featuredConstellation(FEATURED[i], page.asteroids),
        }));
        setState({ status: "ready", items, error: null });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setState({ status: "error", items: [], error: err.message });
      });
    return () => controller.abort();
  }, [enabled, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading", items: [], error: null });
    setAttempt((n) => n + 1);
  }, []);

  const status = state.status === "idle" && enabled ? "loading" : state.status;
  return { ...state, status, retry };
}
