import { useCallback, useEffect, useRef, useState } from "react";

const SHOW_MS = 5000;
const ACTION_MS = 10000; // longer when there's something to press, such as "Undo"

/**
 * One short message at a time, with an optional action such as "Undo". The
 * countdown pauses while the pointer or keyboard focus is on the toast, so
 * nobody loses the chance to press its button.
 */
export function useToast() {
  const [toast, setToast] = useState(null);
  const [paused, setPaused] = useState(false);
  // Time left on the current toast, kept across pauses.
  const left = useRef({ at: null, ms: 0 });

  useEffect(() => {
    if (!toast || paused) return undefined;
    if (left.current.at !== toast.at) left.current = { at: toast.at, ms: toast.action ? ACTION_MS : SHOW_MS };
    const started = Date.now();
    const timer = setTimeout(() => setToast(null), left.current.ms);
    return () => {
      clearTimeout(timer);
      if (left.current.at === toast.at) left.current.ms -= Date.now() - started;
    };
  }, [toast, paused]);

  // A toast removed under the pointer never gets its pointerleave, so each new one starts unpaused.
  const show = useCallback((message, action = null) => {
    setPaused(false);
    setToast({ message, action, at: Date.now() });
  }, []);
  const dismiss = useCallback(() => {
    setPaused(false);
    setToast(null);
  }, []);
  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);
  return { toast, show, dismiss, pause, resume };
}
