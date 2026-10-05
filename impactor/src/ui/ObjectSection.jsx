import { useEffect, useRef, useState } from "react";
import { useSim } from "../store.js";
import { api } from "../lib/api.js";
import { FAMOUS_ASTEROIDS } from "../data/presets.js";
import { formatDiameter } from "../lib/format.js";
import { KM_PER_LD } from "../lib/geo.js";

const QUICK = [
  { key: "random", label: "Random", pick: true, load: (opts) => api.random({}, opts) },
  {
    key: "hazardous",
    label: "Random hazardous",
    pick: true,
    load: (opts) => api.random({ hazardous: true }, opts),
  },
  {
    key: "largest",
    label: "Largest",
    load: (opts) => api.list({ sort: "diameter", order: "desc", limit: 20 }, opts),
  },
  {
    key: "closest",
    label: "Closest flybys",
    load: (opts) => api.list({ sort: "miss_distance", order: "asc", limit: 20 }, opts),
  },
];

function AsteroidCard({ asteroid }) {
  const missLD = asteroid.miss_distance_km / KM_PER_LD;
  return (
    <article className="asteroid-card" aria-label={`Selected asteroid ${asteroid.name}`}>
      <header>
        <h3>{asteroid.name}</h3>
        <span className={`badge ${asteroid.is_potentially_hazardous ? "badge--warn" : ""}`}>
          {asteroid.is_potentially_hazardous ? "Potentially hazardous" : "Not hazardous"}
        </span>
      </header>
      <dl className="stat-grid">
        <div>
          <dt>Diameter (est.)</dt>
          <dd>{formatDiameter(asteroid.estimated_diameter_km * 1000)}</dd>
        </div>
        <div>
          <dt>Flyby speed</dt>
          <dd>{(asteroid.relative_velocity_km_h / 3600).toFixed(2)} km/s</dd>
        </div>
        <div>
          <dt>Closest approach</dt>
          <dd>{asteroid.close_approach_date}</dd>
        </div>
        <div>
          <dt>Miss distance</dt>
          <dd>{missLD.toFixed(missLD < 10 ? 2 : 1)} LD</dd>
        </div>
        <div>
          <dt>Abs. magnitude</dt>
          <dd>{asteroid.absolute_magnitude}</dd>
        </div>
        <div>
          <dt>AegisNEO ID</dt>
          <dd>{asteroid.neo_reference_id}</dd>
        </div>
      </dl>
    </article>
  );
}

export default function ObjectSection() {
  const asteroid = useSim((s) => s.asteroid);
  const selectAsteroid = useSim((s) => s.selectAsteroid);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null = nothing searched yet
  const [status, setStatus] = useState({ loading: false, error: null, label: "" });
  const controller = useRef(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function run(label, load, { pickFirst = false } = {}) {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setStatus({ loading: true, error: null, label });
    try {
      const data = await load(c.signal);
      if (c.signal.aborted) return;
      const list = data.asteroids ?? (data.neo_reference_id ? [data] : []);
      if (pickFirst) {
        // Quick picks have no search terms, so "no matches" advice would make no sense.
        setResults(null);
        if (!list[0]) {
          setStatus({
            loading: false,
            error: "The catalog didn't send an asteroid back. Try again.",
            label: "",
          });
          return;
        }
        selectAsteroid(list[0]);
      } else {
        setResults({ label, list, matched: data.matched });
      }
      setStatus({ loading: false, error: null, label: "" });
    } catch (err) {
      if (c.signal.aborted) return;
      setStatus({ loading: false, error: err.message, label: "" });
    }
  }

  const onSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q) run(`Results for “${q}”`, (signal) => api.search(q, { signal }));
  };

  return (
    <section className="panel-section" aria-labelledby="object-heading">
      <h2 id="object-heading">
        <span className="step">1</span>Choose an asteroid
      </h2>
      <form className="search-row" onSubmit={onSearch} role="search">
        <label htmlFor="asteroid-search" className="sr-only">
          Search asteroids by name, ID or year
        </label>
        <input
          id="asteroid-search"
          type="search"
          placeholder="Name, ID or year (e.g. Apophis)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit" className="btn btn--primary" disabled={status.loading}>
          Search
        </button>
      </form>

      <div className="chip-row" aria-label="Quick picks">
        {QUICK.map((q) => (
          <button
            key={q.key}
            type="button"
            className="chip"
            disabled={status.loading}
            onClick={() => run(q.label, (signal) => q.load({ signal }), { pickFirst: q.pick })}
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="chip-row chip-row--subtle" aria-label="Famous asteroids">
        {FAMOUS_ASTEROIDS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip chip--ghost"
            disabled={status.loading}
            onClick={() => run(f.label, (signal) => api.get(f.id, { signal }), { pickFirst: true })}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="status-line">
        {status.loading && <span className="loading-dots">Asking the AegisNEO API</span>}
        {status.error && (
          <span className="error-text" role="alert">
            {status.error}
          </span>
        )}
      </div>

      {results && (
        <div className="results-block">
          <div className="results-head">
            <span>{results.label}</span>
            {typeof results.matched === "number" && (
              <span className="muted">{results.matched.toLocaleString()} found</span>
            )}
          </div>
          {results.list.length === 0 ? (
            <p className="muted">
              No asteroids matched. Try a name like “Bennu”, an ID, or a year like “1998”.
            </p>
          ) : (
            <ul className="result-list">
              {results.list.map((a) => (
                <li key={a.neo_reference_id}>
                  <button
                    type="button"
                    className={`result-item ${asteroid?.neo_reference_id === a.neo_reference_id ? "is-selected" : ""}`}
                    onClick={() => selectAsteroid(a)}
                  >
                    <span className="result-name">{a.name}</span>
                    <span className="result-meta">
                      {formatDiameter(a.estimated_diameter_km * 1000)}
                      {a.is_potentially_hazardous && (
                        <span className="dot-warn" aria-label="potentially hazardous" />
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {asteroid ? (
        <AsteroidCard asteroid={asteroid} />
      ) : (
        <p className="hint">Search the catalog of 33,000+ real near-Earth objects, or try a quick pick.</p>
      )}
    </section>
  );
}
