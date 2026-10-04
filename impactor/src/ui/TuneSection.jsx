import { useSim } from "../store.js";
import { COMPOSITIONS, EARTH_ESCAPE_VELOCITY_KMS } from "../physics/impact.js";
import { formatDiameter } from "../lib/format.js";
import { DIAMETER_MAX_M, DIAMETER_MIN_M, VELOCITY_MAX_KMS } from "../lib/limits.js";

// Diameter uses a log slider: 0.5 m to 100 km.
const D_MIN = Math.log10(DIAMETER_MIN_M);
const D_MAX = Math.log10(DIAMETER_MAX_M);
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function Slider({ id, label, value, display, min, max, step, onChange, help }) {
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{display}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={help ? `${id}-help` : undefined}
      />
      {help && (
        <p id={`${id}-help`} className="slider-help">
          {help}
        </p>
      )}
    </div>
  );
}

export default function TuneSection() {
  const asteroid = useSim((s) => s.asteroid);
  const diameterM = useSim((s) => s.diameterM);
  const velocityKms = useSim((s) => s.velocityKms);
  const composition = useSim((s) => s.composition);
  const angleDeg = useSim((s) => s.angleDeg);
  const azimuthDeg = useSim((s) => s.azimuthDeg);
  const setParam = useSim((s) => s.setParam);
  const resetToRealValues = useSim((s) => s.resetToRealValues);
  const hypothetical = useSim((s) => s.isHypothetical());

  return (
    <section className="panel-section" aria-labelledby="tune-heading">
      <h2 id="tune-heading">
        <span className="step">3</span>Tune the scenario
        {asteroid && hypothetical && <span className="badge badge--accent">Hypothetical</span>}
      </h2>
      {asteroid && hypothetical && (
        <p className="hint">
          Size or speed no longer match the real data for {asteroid.name}.{" "}
          <button type="button" className="link-btn" onClick={resetToRealValues}>
            Reset to real values
          </button>
        </p>
      )}

      <fieldset className="segmented">
        <legend>Composition (sets density)</legend>
        {Object.entries(COMPOSITIONS).map(([key, c]) => (
          <label key={key} className={composition === key ? "is-active" : ""}>
            <input
              type="radio"
              name="composition"
              value={key}
              checked={composition === key}
              onChange={() => setParam("composition", key)}
            />
            <span>{c.label.split(" ")[0]}</span>
            <small>{c.density.toLocaleString()} kg/m³</small>
          </label>
        ))}
      </fieldset>

      <Slider
        id="diameter"
        label="Diameter"
        value={Math.log10(diameterM)}
        display={formatDiameter(diameterM)}
        min={D_MIN}
        max={D_MAX}
        step={0.01}
        onChange={(v) => setParam("diameterM", 10 ** v)}
      />
      <Slider
        id="velocity"
        label="Entry speed"
        value={velocityKms}
        display={`${velocityKms.toFixed(1)} km/s`}
        min={EARTH_ESCAPE_VELOCITY_KMS}
        max={VELOCITY_MAX_KMS}
        step={0.1}
        onChange={(v) => setParam("velocityKms", v)}
        help="Speed at the top of the atmosphere. Earth's gravity adds to the catalog's flyby speed, so nothing arrives slower than 11.2 km/s."
      />
      <Slider
        id="angle"
        label="Entry angle"
        value={angleDeg}
        display={`${Math.round(angleDeg)}° from horizontal`}
        min={5}
        max={90}
        step={1}
        onChange={(v) => setParam("angleDeg", v)}
        help="45° is the most likely angle for a real impact."
      />
      <Slider
        id="azimuth"
        label="Coming from"
        value={azimuthDeg}
        display={`${COMPASS[Math.round(azimuthDeg / 45) % 8]} (${Math.round(azimuthDeg)}°)`}
        min={0}
        max={359}
        step={1}
        onChange={(v) => setParam("azimuthDeg", v)}
      />
    </section>
  );
}
