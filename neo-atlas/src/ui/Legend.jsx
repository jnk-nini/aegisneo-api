import { useId, useState } from "react";

/** "How to read this chart" — explains what every visual property encodes. */
export default function Legend({ mode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="legend">
      <button
        type="button"
        className="btn btn-small legend-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide guide" : "How to read"}
      </button>
      <div id={panelId} className="legend-panel" hidden={!open}>
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
                ? "the year it passed Earth, 1910 at the top and running clockwise to 2024."
                : "the day of the year it passed Earth, January at the top."}
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
      </div>
    </div>
  );
}
