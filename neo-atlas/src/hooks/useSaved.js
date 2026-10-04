import { useCallback, useRef, useState } from "react";
import { loadSaved, mergeImported, storeSaved } from "../lib/constellations.js";

/**
 * "My constellations", kept in this browser's localStorage. `persisted` is
 * false when the browser refuses storage (some private modes), so the UI can
 * say saves won't survive a reload.
 */
export function useSaved() {
  const [saved, setSaved] = useState(loadSaved);
  const [persisted, setPersisted] = useState(true);
  // The latest list, so callbacks kept for later (an "Undo" in a toast) never act on an old copy.
  const latest = useRef(saved);

  const commit = useCallback((next) => {
    latest.current = next;
    setSaved(next);
    setPersisted(storeSaved(next));
  }, []);

  const add = useCallback((c) => commit([c, ...latest.current.filter((s) => s.id !== c.id)]), [commit]);
  const remove = useCallback((id) => commit(latest.current.filter((s) => s.id !== id)), [commit]);
  const restore = useCallback(
    (c, index) => {
      if (latest.current.some((s) => s.id === c.id)) return;
      const next = [...latest.current];
      next.splice(Math.min(index, next.length), 0, c);
      commit(next);
    },
    [commit],
  );
  const importMany = useCallback(
    (imported) => {
      const { list, added } = mergeImported(latest.current, imported);
      commit(list);
      return added;
    },
    [commit],
  );

  return { saved, persisted, add, remove, restore, importMany };
}
