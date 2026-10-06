import { useEffect, useId, useRef } from "react";
import { FIRST_YEAR, LAST_YEAR } from "../lib/chart.js";

/**
 * "How to read this chart": explains what every visual property encodes, and where the data comes from.
 * The app owns `open`, so the ⋯ menu can open it too. Without `toggle` (phones) there is no button on
 * the chart: the menu is the way in, and the panel has its own close button.
 */
export default function Legend({ mode, open, onOpenChange, toggle = true }) {
  const setOpen = onOpenChange;
  const panelId = useId();
  const rootRef = useRef(null);

  // Closes on Escape or a tap anywhere else, like any popover.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, setOpen]);

  if (!toggle && !open) return null;

  return (
    <div className="legend" ref={rootRef}>
      {toggle && (
        <button
          type="button"
          className="icon-btn corner-btn legend-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="How to read this chart"
          onClick={() => setOpen(!open)}
        >
          <span aria-hidden="true">{open ? "×" : "?"}</span>
          <span className="legend-toggle-text" aria-hidden="true">
            {open ? "Close" : "How to read"}
          </span>
        </button>
      )}
      <div id={panelId} className="legend-panel" hidden={!open}>
        {!toggle && (
          <button type="button" className="icon-btn legend-close" onClick={() => setOpen(false)} aria-label="Close">
            ×
          </button>
        )}
        <ul>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="legend-icon">
              <circle cx="12" cy="12" r="9" className="lg-ring" />
              <path d="M12 12 L12 3" className="lg-ring" />
              <path d="M12 12 L19 8" className="lg-hand" />
            </svg>
            <span>
              <strong>Around the dial:</strong>{" "}
              {mode === "date"
                ? `the year of the close approach, ${FIRST_YEAR} at the top and running clockwise to ${LAST_YEAR}.`
                : "the day of the year of the close approach, January at the top."}{" "}
              These dates are simulated (see below).
            </span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="legend-icon">
              <circle cx="12" cy="12" r="2.4" className="lg-earth" />
              <circle cx="12" cy="12" r="6" className="lg-ring dashed" />
              <circle cx="12" cy="12" r="10" className="lg-ring dashed" />
            </svg>
            <span>
              <strong>Distance from Earth:</strong> how close it came, in lunar distances (LD). Inside the
              Moon ring means closer than the Moon. Each ring is 10× farther.
            </span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="legend-icon">
              <circle cx="6" cy="12" r="1.5" className="lg-star" />
              <circle cx="12" cy="12" r="2.6" className="lg-star" />
              <circle cx="19" cy="12" r="3.8" className="lg-star" />
            </svg>
            <span>
              <strong>Star size:</strong> estimated diameter, from a few meters to tens of kilometers.
            </span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="legend-icon">
              <path d="M12 6 L18 12 L12 18 L6 12 Z" className="lg-hazard" />
            </svg>
            <span>
              <strong>Red diamond:</strong> classed as potentially hazardous — big enough, and on an orbit
              that comes near enough to Earth&rsquo;s, to watch closely. It does not mean it will hit.
            </span>
          </li>
        </ul>
        <p className="legend-note">
          <strong>About the dates.</strong> The source catalog gives each asteroid&rsquo;s size, speed, miss
          distance and hazard class, but not the date of the pass. Each asteroid is given a fixed, simulated
          date between {FIRST_YEAR} and {LAST_YEAR}, so where a star sits around the dial is illustrative.
          Its distance from Earth, its size and its hazard class are real.
        </p>
        <p className="legend-credit">
          Data:{" "}
          <a href="https://aegisneo-api.vercel.app/docs" target="_blank" rel="noreferrer">
            AegisNEO API
          </a>{" "}
          · NASA NeoWs records via Kaggle
        </p>
      </div>
    </div>
  );
}
