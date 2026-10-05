import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { loadShared } from "../lib/constellations.js";

/**
 * The constellation on the chart, or null for the plain sky:
 *   { status: "loading" | "failed", pending, source }            a shared link that hasn't loaded
 *   { status: "partial", constellation, pending, missing, ... }   a shared link with stars missing
 *   { status: "ready", constellation, source }
 *
 * A shared link holds only asteroid IDs, so while it is "loading" each one is
 * fetched from the API.
 */
export function useViewing(initial) {
  const [viewing, setViewing] = useState(initial);

  const loading = viewing?.status === "loading" ? viewing : null;
  useEffect(() => {
    if (!loading) return undefined;
    const controller = new AbortController();
    const { pending, source } = loading;
    loadShared(pending, (id) => api.get(id, { signal: controller.signal })).then((r) => {
      if (controller.signal.aborted) return;
      const { constellation: c, missing, total, retryable } = r;
      if (!c) setViewing({ status: "failed", pending, source, missing, total, retryable });
      else if (missing > 0) setViewing({ status: "partial", constellation: c, pending, source, missing, total, retryable });
      else setViewing({ status: "ready", constellation: c, source });
    });
    return () => controller.abort();
  }, [loading]);

  const retry = useCallback(
    () => setViewing((v) => ({ status: "loading", pending: v.pending, source: v.source })),
    [],
  );

  return { viewing, setViewing, retry };
}
