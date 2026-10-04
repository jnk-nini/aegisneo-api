import { useCallback, useEffect, useState } from "react";

const SHOW_MS = 5000;

/** One short message at a time, with an optional action such as "Undo". */
export function useToast() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const show = useCallback((message, action = null) => setToast({ message, action, at: Date.now() }), []);
  const dismiss = useCallback(() => setToast(null), []);
  return { toast, show, dismiss };
}
