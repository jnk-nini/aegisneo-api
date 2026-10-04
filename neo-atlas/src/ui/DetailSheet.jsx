import { formatDate, formatDiameter, formatKm, formatLD, formatSpeed, toLunarDistances } from "../lib/format.js";

function closenessNote(km) {
  const ld = toLunarDistances(km);
  if (ld < 1) return `Passed closer than the Moon — ${(1 / ld).toFixed(ld < 0.1 ? 0 : 1)}× nearer.`;
  return `Passed at ${ld.toFixed(ld < 10 ? 1 : 0)}× the Moon's distance.`;
}

/**
 * Details for the selected asteroid. A sheet along the bottom on phones and a
 * card beside the chart on wide screens; it never covers the whole chart.
 */
export default function DetailSheet({ asteroid, onClose }) {
  if (!asteroid) return null;
  const a = asteroid;
  const sbdbUrl = `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(a.neo_reference_id)}`;

  return (
    <aside className="detail-sheet" aria-labelledby="detail-name">
      <div className="sheet-grip" aria-hidden="true" />
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
          <dt>Close approach</dt>
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
          <dt>Estimated diameter</dt>
          <dd className="num">{formatDiameter(a.estimated_diameter_km)}</dd>
        </div>
        <div>
          <dt>Speed relative to Earth</dt>
          <dd className="num">{formatSpeed(a.relative_velocity_km_h)}</dd>
        </div>
        <div>
          <dt>Absolute magnitude (H)</dt>
          <dd className="num">{a.absolute_magnitude}</dd>
        </div>
        <div>
          <dt>Reference ID</dt>
          <dd className="num">{a.neo_reference_id}</dd>
        </div>
      </dl>

      <a className="detail-link" href={sbdbUrl} target="_blank" rel="noreferrer">
        Look it up in NASA JPL&rsquo;s Small-Body Database
        <span aria-hidden="true"> ↗</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </aside>
  );
}
