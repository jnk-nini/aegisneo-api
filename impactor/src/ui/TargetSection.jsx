import { useMemo, useState } from "react";
import { useSim } from "../store.js";
import { CITIES } from "../data/cities.js";
import { pickTarget } from "../lib/target.js";
import { formatLatLon } from "../lib/geo.js";

function normalize(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function TargetSection() {
  const target = useSim((s) => s.target);
  const view3d = useSim((s) => s.view3d);
  const phase = useSim((s) => s.phase);
  const locked = phase === "approach" || phase === "impact";
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(0); // highlighted suggestion
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [coordError, setCoordError] = useState("");

  const matches = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    return CITIES.filter(
      ([name, country]) => normalize(name).includes(q) || normalize(country).includes(q),
    ).slice(0, 8);
  }, [query]);

  const chooseCity = ([name, country, cLat, cLon]) => {
    pickTarget(cLat, cLon, { label: `${name}, ${country}` });
    setQuery("");
    setListOpen(false);
  };

  const expanded = listOpen && matches.length > 0 && !locked;
  const optionId = (i) => `city-option-${i}`;

  // ARIA combobox keys: arrows move through suggestions, Enter picks, Escape closes.
  const onSearchKey = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!matches.length) return;
      e.preventDefault();
      if (!expanded) {
        setListOpen(true);
        setActive(e.key === "ArrowDown" ? 0 : matches.length - 1);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + matches.length) % matches.length);
    } else if (e.key === "Enter" && expanded) {
      e.preventDefault();
      chooseCity(matches[Math.min(active, matches.length - 1)]);
    } else if (e.key === "Escape" && expanded) {
      e.preventDefault();
      setListOpen(false);
    }
  };

  const onCoords = (e) => {
    e.preventDefault();
    const la = Number(lat);
    const lo = Number(lon);
    if (
      lat === "" ||
      lon === "" ||
      !Number.isFinite(la) ||
      !Number.isFinite(lo) ||
      Math.abs(la) > 90 ||
      Math.abs(lo) > 180
    ) {
      setCoordError("Latitude must be −90 to 90 and longitude −180 to 180.");
      return;
    }
    setCoordError("");
    pickTarget(la, lo);
  };

  const randomSpot = () => {
    // Uniform over the sphere's surface, not over the lat/lon rectangle.
    const la = (Math.asin(2 * Math.random() - 1) * 180) / Math.PI;
    const lo = Math.random() * 360 - 180;
    pickTarget(la, lo);
  };

  const place = target
    ? (target.label ??
      (target.country ? target.country : target.surface === "water" ? "Open ocean" : "Remote land"))
    : null;

  return (
    <section className="panel-section" aria-labelledby="target-heading">
      <h2 id="target-heading">
        <span className="step">2</span>Pick a target
      </h2>
      <p className="hint">
        {locked
          ? "The target is locked while the impact plays."
          : `${view3d ? "Tap the globe" : "Tap the map"}, search a city, or enter coordinates.`}
      </p>

      <div className="combo">
        <label htmlFor="city-search" className="sr-only">
          Search a city
        </label>
        <input
          id="city-search"
          type="search"
          role="combobox"
          placeholder="Search a city (e.g. Manila)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setListOpen(true);
            setActive(0);
          }}
          onKeyDown={onSearchKey}
          onFocus={() => setListOpen(true)}
          onBlur={() => setListOpen(false)}
          autoComplete="off"
          disabled={locked}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls="city-results"
          aria-activedescendant={expanded ? optionId(active) : undefined}
        />
        {expanded && (
          <ul
            id="city-results"
            role="listbox"
            aria-label="Matching cities"
            className="result-list result-list--floating"
          >
            {matches.map((c, i) => (
              <li
                key={`${c[0]}-${c[1]}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={`result-item ${i === active ? "is-selected" : ""}`}
                // Keep focus in the input so the list doesn't close before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => chooseCity(c)}
              >
                <span className="result-name">{c[0]}</span>
                <span className="result-meta">{c[1]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={onCoords}>
        <fieldset className="coord-row" disabled={locked}>
          <label>
            <span>Lat</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="-90"
              max="90"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="14.6"
            />
          </label>
          <label>
            <span>Lon</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="-180"
              max="180"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              placeholder="121.0"
            />
          </label>
          <button type="submit" className="btn">
            Set
          </button>
          <button type="button" className="btn btn--ghost" onClick={randomSpot}>
            Random
          </button>
        </fieldset>
      </form>
      {coordError && (
        <p className="error-text" role="alert">
          {coordError}
        </p>
      )}

      {target && (
        <div className="target-summary" aria-live="polite">
          <div className="target-place">
            <span className={`surface-dot surface-dot--${target.surface}`} aria-hidden="true" />
            <strong>{place}</strong>
          </div>
          <div className="muted">
            {formatLatLon(target)} · {target.surface === "water" ? "ocean impact" : "land impact"}
          </div>
          {target.nearest && !target.label && (
            <div className="muted">
              {Math.round(target.nearest.distanceKm)} km from {target.nearest.name}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
