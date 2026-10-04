import HighlightChips from "./HighlightChips.jsx";

/**
 * What the chart is showing, with loading progress and a retry on failure.
 * Once loaded, the counts underneath highlight those asteroids when tapped.
 */
export default function SkySummary({ title, result, catalogTotal, highlight, onHighlight }) {
  const { status, asteroids, matched, error, retry } = result;

  if (status === "error") {
    return (
      <div className="sky-summary error" role="alert">
        <span>
          {error}
          {asteroids.length > 0 && ` Showing ${asteroids.length} of ${matched}.`}
        </span>
        {retry && (
          <button type="button" className="btn btn-small" onClick={retry}>
            Try again
          </button>
        )}
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

  return (
    <div className="sky-summary">
      <p className="sky-line" role="status">
        <strong className="sky-title">{title}</strong> ·{" "}
        <span className="nowrap">
          <strong className="num">{asteroids.length}</strong> asteroids
          {catalogTotal ? ` of ${catalogTotal.toLocaleString("en-US")}` : ""}
        </span>
        <span className="sky-hint"> · tap a count to highlight</span>
      </p>
      <HighlightChips asteroids={asteroids} value={highlight} onChange={onHighlight} />
    </div>
  );
}
