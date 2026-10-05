import { useState } from "react";

const KEY = "neo-atlas:tip-seen";

function seen() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** A one-time hint for first visits; dismissed for good once closed. */
export default function ChartTip() {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // Storage refused: the tip just comes back next visit.
    }
  };

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
