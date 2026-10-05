import { useEffect, useEffectEvent, useRef } from "react";

const sameList = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Keeps the address bar and the browser's Back button in step with the app.
 *
 * `layers` lists what is open on top of the sky, e.g. ["viewing", "sheet"].
 * Opening one adds a history entry, so Back (or Android's back gesture) closes
 * it instead of leaving the site; any other change only updates the current
 * entry, so stepping through years doesn't fill the history.
 *
 * `snapshot` is stored with each entry and passed to `onBack` when the visitor
 * returns to it. `onBack` can return false to stay where they are (to ask
 * before throwing away a drawing, say). `url` is the query to show, or null to
 * leave the address bar as it is.
 */
export function useHistorySync({ url, layers, snapshot, onBack }) {
  // The entry this page last wrote, to put back if `onBack` refuses.
  const last = useRef(null);
  const key = layers.join(",");

  useEffect(() => {
    const current = window.history.state;
    const href = `${window.location.pathname}${url ?? window.location.search}`;
    const entry = { ...snapshot, layers: key ? key.split(",") : [] };
    // `below` is the layers of the entry underneath, recorded only on entries this page added.
    if (last.current && entry.layers.length > (current?.layers?.length ?? 0)) {
      window.history.pushState({ ...entry, below: current?.layers ?? [] }, "", href);
    } else {
      window.history.replaceState({ ...entry, below: current?.below ?? null }, "", href);
    }
    last.current = { state: window.history.state, href };
  }, [url, key, snapshot]);

  const handleBack = useEffectEvent((event) => {
    const next = event.state ?? { layers: [] };
    if (onBack({ ...next, layers: next.layers ?? [] }) === false && last.current) {
      window.history.pushState(last.current.state, "", last.current.href);
    }
  });

  useEffect(() => {
    const onPop = (event) => handleBack(event);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}

/**
 * Closes layers from the UI (a close button, say). When this page added the
 * current history entry for exactly what is closing, it goes back instead, so a
 * later Back doesn't land on a copy of the same view; `onBack` then restores
 * the entry underneath. Otherwise `close` runs. `remaining` is what stays open.
 */
export function closeLayer(layers, remaining, close) {
  const state = window.history.state;
  const ownEntry = state?.below && sameList(state.layers, layers) && sameList(state.below, remaining);
  if (remaining.length < layers.length && ownEntry) window.history.back();
  else close();
}
