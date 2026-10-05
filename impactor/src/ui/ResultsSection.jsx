import { useEffect, useMemo, useState } from "react";
import { useSim } from "../store.js";
import { zonesFor } from "../physics/zones.js";
import { compareToEvents, globalConsequence } from "../physics/events.js";
import { COMPOSITIONS, blastArrivalSeconds } from "../physics/impact.js";
import { formatLatLon } from "../lib/geo.js";
import { citiesInRange } from "../lib/cityRange.js";
import { CITIES } from "../data/cities.js";
import {
  formatBig,
  formatClock,
  formatDistance,
  formatEnergy,
  formatSpeed,
  formatYears,
} from "../lib/format.js";
import { savedScenarios } from "../lib/storage.js";
import { applyScenarioQuery } from "../lib/scenario.js";

const CITY_COUNT = CITIES.length;

function regimeText(result, surface) {
  const { entry } = result;
  const ground = surface === "water" ? "the sea" : "the ground";
  if (entry.regime === "airburst") {
    return `Broke up ${formatDistance(entry.breakupAltitudeM)} up and exploded in an airburst ${formatDistance(entry.airburstAltitudeM)} above the ground. No crater forms.`;
  }
  if (entry.regime === "fragmented") {
    return `Broke apart ${formatDistance(entry.breakupAltitudeM)} up, but the fragments hit ${ground} together at ${formatSpeed(entry.impactVelocityMs / 1000)}.`;
  }
  return `Reached ${ground} intact at ${formatSpeed(entry.impactVelocityMs / 1000)}.`;
}

function ShareActions({ run }) {
  const capture = useSim((s) => s.capture);
  const [note, setNote] = useState("");
  const flash = (text) => {
    setNote(text);
    setTimeout(() => setNote(""), 2500);
  };

  const copyLink = async () => {
    const url = `${location.origin}${location.pathname}?${run.query}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied");
    } catch {
      window.prompt("Copy this link:", url);
    }
  };
  const save = () => {
    const list = savedScenarios.add({
      query: run.query,
      name: `${run.asteroidName} → ${run.target.label ?? run.target.country ?? formatLatLon(run.target)}`,
      megatons: run.result.energy.megatons,
    });
    flash(list ? "Saved in this browser" : "Couldn't save (storage is blocked)");
    window.dispatchEvent(new Event("impactor:saved"));
  };
  const download = async () => {
    if (!capture) return;
    const blob = await capture();
    if (!blob) return flash("Couldn't capture the view");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `impactor-${run.asteroidName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="share-row">
      <button type="button" className="btn" onClick={copyLink}>
        Copy link
      </button>
      <button type="button" className="btn" onClick={save}>
        Save
      </button>
      {capture && (
        <button type="button" className="btn" onClick={download}>
          Image
        </button>
      )}
      <span className="share-note" aria-live="polite">
        {note}
      </span>
    </div>
  );
}

export function SavedList() {
  const [list, setList] = useState(() => savedScenarios.list());
  useEffect(() => {
    const refresh = () => setList(savedScenarios.list());
    window.addEventListener("impactor:saved", refresh);
    return () => window.removeEventListener("impactor:saved", refresh);
  }, []);
  if (!list.length) return null;
  return (
    <section className="panel-section" aria-labelledby="saved-heading">
      <h2 id="saved-heading">Saved scenarios</h2>
      <ul className="saved-list">
        {list.map((s) => (
          <li key={s.id}>
            <button type="button" className="result-item" onClick={() => applyScenarioQuery(s.query)}>
              <span className="result-name">{s.name}</span>
              <span className="result-meta">{formatEnergy(s.megatons)}</span>
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Delete ${s.name}`}
              onClick={() => setList(savedScenarios.remove(s.id))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ResultsSection() {
  const run = useSim((s) => s.run);
  const phase = useSim((s) => s.phase);
  const view3d = useSim((s) => s.view3d);
  const showZoneRings = useSim((s) => s.showZoneRings);
  const zones = useMemo(() => zonesFor(run?.result), [run]);
  const cities = useMemo(() => (run ? citiesInRange(run.target, zones) : { list: [] }), [run, zones]);

  if (!run) {
    return (
      <section className="panel-section" aria-labelledby="results-heading">
        <h2 id="results-heading">Results</h2>
        <p className="hint">
          Launch an impact to see the energy, crater, blast, heat and earthquake effects here.
        </p>
        <ol className="how-list">
          <li>Pick a real asteroid from the AegisNEO catalog.</li>
          <li>Tap the globe to choose where it hits.</li>
          <li>Optionally change its size, speed or angle — then launch.</li>
        </ol>
      </section>
    );
  }

  if (phase !== "done") {
    return (
      <section className="panel-section" aria-labelledby="results-heading">
        <h2 id="results-heading">Results</h2>
        <p className="hint loading-dots">Simulating impact</p>
      </section>
    );
  }

  const { result } = run;
  const comparison = compareToEvents(result.energy.megatons);
  const ratio = comparison.ratio;
  const ratioText =
    ratio >= 1.5
      ? `≈ ${formatBig(ratio)}× the`
      : ratio <= 0.67
        ? `≈ 1/${formatBig(1 / ratio)} of the`
        : "Similar to the";
  const { nearest } = run.target;
  const place =
    run.target.label ??
    run.target.country ??
    (run.target.surface === "water"
      ? nearest
        ? `the sea ${Math.round(nearest.distanceKm)} km from ${nearest.name}`
        : "the open ocean"
      : formatLatLon(run.target));

  return (
    <section className="panel-section results" aria-labelledby="results-heading">
      <h2 id="results-heading">
        Results
        {run.hypothetical && <span className="badge badge--accent">Hypothetical</span>}
      </h2>
      <div aria-live="polite">
        <p className="results-lead">
          <strong>{run.asteroidName}</strong> striking <strong>{place}</strong>.{" "}
          {regimeText(result, run.target.surface)}
        </p>
      </div>

      <dl className="figure-grid">
        <div className="figure figure--wide">
          <dt>Impact energy</dt>
          <dd>{formatEnergy(result.energy.megatons)}</dd>
          <small>
            {ratioText} {comparison.event.name}
          </small>
        </div>
        <div className="figure">
          <dt>{run.target.surface === "water" && result.crater ? "Seafloor crater" : "Crater"}</dt>
          <dd>{result.crater?.finalDiameterM ? formatDistance(result.crater.finalDiameterM) : "None"}</dd>
          <small>
            {result.crater?.finalDiameterM
              ? `${formatDistance(result.crater.depthM)} deep · ${result.crater.type}`
              : result.crater
                ? "too large to keep a crater shape"
                : "exploded in the air"}
          </small>
        </div>
        <div className="figure">
          <dt>Earthquake</dt>
          <dd>{result.seismic ? `M ${result.seismic.magnitude.toFixed(1)}` : "—"}</dd>
          <small>
            {result.seismic ? `Mercalli ${result.seismic.mercalli} near the site` : "no ground impact"}
          </small>
        </div>
        <div className="figure">
          <dt>Entry speed</dt>
          <dd>{formatSpeed(run.params.velocityKms)}</dd>
          <small>
            {COMPOSITIONS[run.params.composition]?.label}, {Math.round(run.params.angleDeg)}° entry
          </small>
        </div>
        <div className="figure">
          <dt>How often</dt>
          <dd className="figure-small">{formatYears(result.recurrenceYears)}</dd>
          <small>somewhere on Earth</small>
        </div>
      </dl>

      {zones.length > 0 ? (
        <>
          <div className="zone-heading">
            <h3>Damage zones · radius from impact</h3>
            {view3d && (
              <label className="zone-toggle">
                <input
                  type="checkbox"
                  checked={showZoneRings}
                  onChange={(e) => useSim.getState().setShowZoneRings(e.target.checked)}
                />
                <span>Outline on globe</span>
              </label>
            )}
          </div>
          <ul className="zone-list">
            {zones.map((z) => (
              <li key={z.key}>
                <span className="swatch" style={{ background: z.line }} aria-hidden="true" />
                <span className="zone-label">{z.label}</span>
                <span className="zone-radius">{z.global ? "Global" : formatDistance(z.radiusM)}</span>
                {z.key !== "crater" && z.key !== "fireball" && !z.global && (
                  <span className="zone-time" title="Time for the blast to arrive">
                    +{formatClock(blastArrivalSeconds(z.radiusM))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="hint">
          The energy was released high in the atmosphere. Peak pressure on the ground was about{" "}
          {(result.groundZeroPressurePa / 1000).toFixed(1)} kPa, below the 6.9 kPa that shatters typical
          windows — expect a bright flash and a loud boom.
        </p>
      )}

      {cities.list.length > 0 && (
        <>
          <h3>Major cities in range</h3>
          {cities.byPopulation && (
            <p className="muted">
              {cities.total === CITY_COUNT ? "All" : `${cities.total} of the`} {CITY_COUNT} major cities in
              this simulator are in range. The largest:
            </p>
          )}
          <ul className="city-list">
            {cities.list.map((c) => (
              <li key={`${c.name}-${c.country}`}>
                <span className="swatch" style={{ background: c.zone?.line }} aria-hidden="true" />
                <span>{c.name}</span>
                <span className="muted">
                  {Math.round(c.distance)} km · {c.zone?.label}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Wider picture</h3>
      <p>{globalConsequence(result.energy.megatons)}</p>
      {run.target.surface === "water" && (
        <p className="note">
          {result.waterCrater
            ? `The impact opens a ${formatDistance(result.waterCrater.transientDiameterM)} cavity in the water; the seafloor crater assumes the average ocean depth of 3.7 km. `
            : ""}
          Tsunamis aren&apos;t modelled — the source model leaves them out because wave height depends heavily
          on the coastline.
        </p>
      )}
      {result.craterField && (
        <p className="note">
          The fragments spread out before landing, so expect a field of smaller craters rather than one.
        </p>
      )}

      <ShareActions run={run} />

      <details className="method">
        <summary>How this is calculated</summary>
        <p>
          Atmospheric entry, crater size, fireball, heat, earthquake and air blast follow Collins, Melosh
          &amp; Marcus (2005),
          <em> Earth Impact Effects Program</em>, Meteoritics &amp; Planetary Science 40(6). Diameter and
          flyby speed come from the AegisNEO API. Density is an assumption (the catalog doesn&apos;t include
          it), and entry speed adds Earth&apos;s escape velocity to the flyby speed. Results are estimates for
          learning, not hazard predictions.
        </p>
      </details>
    </section>
  );
}
