import { useEffect, useState } from "react";

const KEY = "neo-atlas:tip-seen";
const HIDE_AFTER_MS = 8000;

function seen() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** A one-time hint for first visits; dismissed for good once closed or timed out. */
export default function ChartTip() {
  const [open, setOpen] = useState(() => !seen());

  // It goes by itself after a few seconds, so it never sits on screen as one more thing to deal with.
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(close, HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  function close() {
    setOpen(false);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // Storage refused: the tip just comes back next visit.
    }
  }

  return (
    <div className="chart-tip">
      <p>
        Each star is a real near-Earth asteroid. <strong>Tap one</strong> for its story,{" "}
        <strong>pinch</strong> to zoom.
      </p>
      <button type="button" className="tip-close" onClick={close} aria-label="Dismiss tip">
        ×
      </button>
    </div>
  );
}
