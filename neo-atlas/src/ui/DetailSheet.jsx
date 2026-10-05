import { Children, useRef, useState } from "react";
import {
  formatDate,
  formatDiameter,
  formatKm,
  formatLD,
  formatSpeed,
  toLunarDistances,
} from "../lib/format.js";

const DRAG_CLOSE_PX = 56;
const DRAG_OPEN_PX = 32;

function closenessNote(km) {
  const ld = toLunarDistances(km);
  if (ld < 0.9) return `Passed closer than the Moon — ${(1 / ld).toFixed(ld < 0.1 ? 0 : 1)}× nearer.`;
  if (ld < 1) return "Passed just inside the Moon's distance.";
  return `Passed at ${ld.toFixed(ld < 10 ? 1 : 0)}× the Moon's distance.`;
}

/**
 * Details for the selected asteroid. On phones it is a short sheet along the
 * bottom (the chart slides the star above it) that expands for the rest; on
 * wide screens it is a card beside the chart with everything shown.
 */
export default function DetailSheet({ asteroid, onClose, sheetRef, children }) {
  // Expanded for one asteroid only, so picking another starts compact again.
  const [openFor, setOpenFor] = useState(null);
  const dragRef = useRef(null);
  if (!asteroid) return null;

  const a = asteroid;
  const expanded = openFor === a.neo_reference_id;
  const setExpanded = (on) => setOpenFor(on ? a.neo_reference_id : null);
  const sbdbUrl = `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(a.neo_reference_id)}`;

  // The grip: tap to expand or collapse, drag up to expand, drag down to close.
  const grip = {
    onPointerDown: (e) => {
      dragRef.current = e.clientY;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerUp: (e) => {
      if (dragRef.current === null) return;
      const dy = e.clientY - dragRef.current;
      dragRef.current = null;
      if (dy > DRAG_CLOSE_PX) onClose();
      else if (dy < -DRAG_OPEN_PX) setExpanded(true);
      else if (Math.abs(dy) < 8) setExpanded(!expanded);
    },
    onPointerCancel: () => (dragRef.current = null),
    // Keyboard activation (pointer taps are handled above).
    onClick: (e) => e.detail === 0 && setExpanded(!expanded),
  };

  return (
    <aside
      ref={sheetRef}
      className={expanded ? "detail-sheet expanded" : "detail-sheet"}
      aria-labelledby="detail-name"
    >
      <button
        type="button"
        className="sheet-grip"
        aria-expanded={expanded}
        aria-label={expanded ? "Show fewer details" : "Show more details"}
        {...grip}
      >
        <span aria-hidden="true" />
      </button>
      <header className="detail-head">
        <div>
          <h2 id="detail-name" className="detail-name">
            {a.name}
          </h2>
          <p className={a.is_potentially_hazardous ? "badge hazard" : "badge"}>
            <span className="badge-mark" aria-hidden="true" />
            {a.is_potentially_hazardous ? "Potentially hazardous" : "Not flagged as hazardous"}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </header>

      <p className="detail-note">{closenessNote(a.miss_distance_km)}</p>

      <dl className="detail-grid">
        <div>
          <dt>
            Close approach <span className="dt-flag">simulated</span>
          </dt>
          <dd>{formatDate(a.close_approach_date)}</dd>
        </div>
        <div>
          <dt>Miss distance</dt>
          <dd>
            <span className="num">{formatLD(a.miss_distance_km)}</span>
            <span className="sub">{formatKm(a.miss_distance_km)}</span>
          </dd>
        </div>
        <div>
          <dt>Diameter</dt>
          <dd className="num">{formatDiameter(a.estimated_diameter_km)}</dd>
        </div>
        <div className="more">
          <dt>Speed vs Earth</dt>
          <dd className="num">{formatSpeed(a.relative_velocity_km_h)}</dd>
        </div>
        <div className="more">
          <dt>Magnitude (H)</dt>
          <dd className="num">{a.absolute_magnitude}</dd>
        </div>
        <div className="more">
          <dt>Reference ID</dt>
          <dd className="num">{a.neo_reference_id}</dd>
        </div>
      </dl>

      <a className="detail-link more" href={sbdbUrl} target="_blank" rel="noreferrer">
        Look it up in NASA JPL&rsquo;s Small-Body Database
        <span aria-hidden="true"> ↗</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>

      <div className="detail-actions">
        {Children.toArray(children)}
        <button
          type="button"
          className="btn btn-small btn-quiet detail-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Fewer details" : "More details"}
        </button>
      </div>
    </aside>
  );
}
