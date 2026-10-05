import { useCallback, useEffect, useState } from "react";
import { MAX_POINTS, uniqueIds } from "../lib/constellations.js";
import { plural } from "../lib/format.js";

// Drawing this many stars or more makes Cancel ask first.
const CONFIRM_CANCEL_STARS = 3;

/**
 * The constellation being drawn: the tap order of star IDs, or null when not
 * drawing. Anything that would throw away joined stars asks first, through
 * `askConfirm` (which opens the confirm dialog).
 */
export function useDraft(askConfirm) {
  const [draft, setDraft] = useState(null);
  // Bumped for every new drawing, so the draw bar starts fresh.
  const [session, setSession] = useState(0);
  const drawing = draft !== null;
  const count = drawing ? uniqueIds(draft).length : 0;
  const hasStars = drawing && draft.length > 0;

  // Leaving the page mid-drawing would lose the stars joined so far.
  useEffect(() => {
    if (!hasStars) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasStars]);

  const start = useCallback((firstId = null) => {
    setDraft(firstId ? [firstId] : []);
    setSession((n) => n + 1);
  }, []);
  const stop = useCallback(() => setDraft(null), []);
  const undo = useCallback(() => setDraft((d) => d && d.slice(0, -1)), []);

  /** Adds a tapped star. Returns false if the constellation already has as many points as allowed. */
  const tap = (id) => {
    if (!drawing || !id || draft[draft.length - 1] === id) return true;
    if (draft.length >= MAX_POINTS) return false;
    setDraft([...draft, id]);
    return true;
  };

  const askDiscard = (onConfirm, onCancel) =>
    askConfirm({
      title: "Discard your constellation?",
      body: `You've joined ${plural(count, "star")}. ${count === 1 ? "It" : "They"} will be lost.`,
      confirmLabel: "Discard",
      cancelLabel: "Keep drawing",
      onConfirm,
      onCancel,
    });

  /** Runs `action` now, or after asking if it would throw away joined stars. `onKeep` runs if they keep drawing. */
  const guard = (action, onKeep) => (hasStars ? askDiscard(action, onKeep) : action());

  /** The Cancel button: asks first only once a few stars are joined. */
  const cancel = (discard) => (count < CONFIRM_CANCEL_STARS ? discard() : askDiscard(discard));

  return { draft, drawing, session, count, hasStars, start, stop, undo, tap, guard, cancel, askDiscard };
}
