import { useId, useMemo, useState } from "react";
import { formatDate, formatDiameter, formatLD } from "../lib/format.js";
import { listRows, SORTS } from "../lib/highlights.js";
import HighlightChips from "./HighlightChips.jsx";

/**
 * The same sky as the chart, as a list you can search and sort. Tapping a row
 * opens its details, with a button to find it on the chart.
 */
export default function ListView({ toolbar, title, result, highlight, onHighlight, selectedId, onSelect }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("date");
  const searchId = useId();
  const { status, asteroids, error, retry } = result;
  const rows = useMemo(
    () => listRows(asteroids, { highlight, query, sort }),
    [asteroids, highlight, query, sort],
  );

  return (
    <div className="list-view">
      <div className="list-head">
        {toolbar}
        <div className="list-tools">
          <label htmlFor={searchId} className="sr-only">
            Search by name
          </label>
          <input
            id={searchId}
            type="search"
            className="text-input search-input"
            placeholder="Search by name, e.g. Apophis"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <label className="select-wrap">
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {status === "ready" && (
          <HighlightChips asteroids={asteroids} value={highlight} onChange={onHighlight} />
        )}
      </div>

      {status === "error" && (
        <div className="list-note" role="alert">
          <p>{error}</p>
          {retry && (
            <button type="button" className="btn btn-small" onClick={retry}>
              Try again
            </button>
          )}
        </div>
      )}
      {status === "loading" && asteroids.length === 0 && (
        <p className="list-note" role="status">
          <span className="pulse" aria-hidden="true" />
          Loading {title}…
        </p>
      )}

      {asteroids.length > 0 && (
        <>
          <p className="list-count" role="status">
            {rows.length === asteroids.length
              ? `${rows.length} asteroids · ${title}`
              : `${rows.length} of ${asteroids.length} asteroids · ${title}`}
          </p>
          {rows.length === 0 ? (
            <div className="list-note">
              <p>No asteroids match.</p>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setQuery("");
                  onHighlight(null);
                }}
              >
                Clear search and highlight
              </button>
            </div>
          ) : (
            <ol className="rows">
              {rows.map((a) => (
                <li key={a.neo_reference_id}>
                  <button
                    type="button"
                    className="row"
                    aria-current={a.neo_reference_id === selectedId ? "true" : undefined}
                    onClick={() => onSelect(a.neo_reference_id)}
                  >
                    <span
                      className={a.is_potentially_hazardous ? "row-mark hazard" : "row-mark"}
                      aria-hidden="true"
                    />
                    <span className="row-main">
                      <span className="row-name">{a.name}</span>
                      <span className="row-date">
                        {formatDate(a.close_approach_date)}
                        {a.is_potentially_hazardous && (
                          <span className="sr-only">, potentially hazardous</span>
                        )}
                      </span>
                    </span>
                    <span className="row-stats">
                      <span className="num">{formatLD(a.miss_distance_km)}</span>
                      <span className="num row-size">{formatDiameter(a.estimated_diameter_km)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
