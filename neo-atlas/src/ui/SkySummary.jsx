import { formatMonthDay, toLunarDistances } from "../lib/format.js";

export function skyTitle(sky) {
  return sky.mode === "date" ? `${formatMonthDay(sky.date)}, 1910–2024` : String(sky.year);
}

/** One-line summary of the charted sky, with loading progress and a retry on failure. */
export default function SkySummary({ sky, result, catalogTotal }) {
  const { status, asteroids, matched, error, retry } = result;
  const title = skyTitle(sky);

  if (status === "error") {
    return (
      <div className="sky-summary error" role="alert">
        <span>
          {error}
          {asteroids.length > 0 && ` Showing ${asteroids.length} of ${matched}.`}
        </span>
        <button type="button" className="btn btn-small" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <p className="sky-summary" role="status">
        <span className="pulse" aria-hidden="true" />
        Charting {title}…
        {matched > 0 && (
          <span className="num">
            {" "}
            {asteroids.length} of {matched}
          </span>
        )}
      </p>
    );
  }

  const hazardous = asteroids.filter((a) => a.is_potentially_hazardous).length;
  const inside = asteroids.filter((a) => toLunarDistances(a.miss_distance_km) < 1).length;
  return (
    <p className="sky-summary" role="status">
      <strong className="sky-title">{title}</strong> ·{" "}
      <span className="nowrap">
        <strong className="num">{asteroids.length}</strong> asteroids
        {catalogTotal ? ` of ${catalogTotal.toLocaleString("en-US")}` : ""}
      </span>{" "}
      ·{" "}
      <span className="nowrap">
        <strong className="num hazard-text">{hazardous}</strong> potentially hazardous
      </span>{" "}
      ·{" "}
      <span className="nowrap">
        <strong className="num">{inside}</strong> closer than the Moon
      </span>
    </p>
  );
}
