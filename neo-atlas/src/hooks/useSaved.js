import { useCallback, useEffect, useRef, useState } from "react";
import { loadSaved, mergeImported, readSaved, STORAGE_KEY, storeSaved } from "../lib/constellations.js";

/**
 * "My constellations", kept in this browser's localStorage. `persisted` is
 * false when the browser refuses storage (some private modes), so the UI can
 * say saves won't survive a reload.
 *
 * Several tabs can be open at once, so every change starts from what is in
 * storage right now (not this tab's copy), and saves made in another tab show
 * up here straight away. Otherwise the last tab to save would erase the rest.
 */
export function useSaved() {
  const [saved, setSaved] = useState(loadSaved);
  const [persisted, setPersisted] = useState(true);
  // The latest list, for when storage can't be read and for callbacks kept for later (an "Undo" in a toast).
  const latest = useRef(saved);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY && e.key !== null) return;
      const next = loadSaved();
      latest.current = next;
      setSaved(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((change) => {
    const next = change(readSaved() ?? latest.current);
    latest.current = next;
    setSaved(next);
    setPersisted(storeSaved(next));
    return next;
  }, []);

  const add = useCallback(
    (c) => update((list) => [c, ...list.filter((s) => s.id !== c.id)]),
    [update],
  );
  const remove = useCallback((id) => update((list) => list.filter((s) => s.id !== id)), [update]);
  const restore = useCallback(
    (c, index) =>
      update((list) => {
        if (list.some((s) => s.id === c.id)) return list;
        const next = [...list];
        next.splice(Math.min(index, next.length), 0, c);
        return next;
      }),
    [update],
  );
  const importMany = useCallback(
    (imported) => {
      let added = 0;
      update((list) => {
        const merged = mergeImported(list, imported);
        added = merged.added;
        return merged.list;
      });
      return added;
    },
    [update],
  );

  return { saved, persisted, add, remove, restore, importMany };
}
