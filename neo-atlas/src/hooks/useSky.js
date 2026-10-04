import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { skySearch } from "../lib/sky.js";

const MAX_OBJECTS = 1000; // a year holds ~300, a date across all years ~90
const LOADING = { status: "loading", asteroids: [], matched: 0, error: null };

/**
 * Loads every asteroid for the current sky, page by page. Changing the sky
 * cancels the previous load so a slow answer can never overwrite a newer one.
 */
export function useSky(sky) {
  const [attempt, setAttempt] = useState(0);
  const search = skySearch(sky);
  const key = `${search}#${attempt}`;
  // Results are tagged with the request they belong to, so a new sky shows as
  // loading straight away instead of briefly showing the previous one.
  const [state, setState] = useState({ key: null, ...LOADING });

  useEffect(() => {
    const controller = new AbortController();
    const update = (next) => {
      if (!controller.signal.aborted) setState({ key, ...next });
    };
    api
      .listAll(
        { search },
        {
          signal: controller.signal,
          max: MAX_OBJECTS,
          onPage: (asteroids, matched) => update({ status: "loading", asteroids, matched, error: null }),
        },
      )
      .then(({ asteroids, matched }) => update({ status: "ready", asteroids, matched, error: null }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Keep any pages that did arrive for this sky; never fall back to another sky's stars.
        setState((prev) => ({
          ...(prev.key === key ? prev : LOADING),
          key,
          status: "error",
          error: err.message,
        }));
      });
    return () => controller.abort();
  }, [search, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...(state.key === key ? state : LOADING), retry };
}
