import HighlightChips from "./HighlightChips.jsx";

/**
 * What the chart is showing, with loading progress and a retry on failure.
 * Once loaded, the counts underneath highlight those asteroids when tapped.
 * When the chart is empty, the chart itself says why, so this stays short.
 *
 * `notice` is a warning about the view (e.g. stars a shared link couldn't load);
 * `onMake` adds the "Make a constellation" button.
 */
export default function SkySummary({
  title,
  result,
  catalogTotal,
  highlight,
  onHighlight,
  notice = null,
  onMake = null,
  canMake = false,
}) {
  const { status, asteroids, matched, error, retry } = result;

  const make = onMake && (
    <button type="button" className="btn btn-solid btn-make sky-make" onClick={onMake} disabled={!canMake}>
      <span aria-hidden="true">✦</span> Make a constellation
    </button>
  );

  if (status === "error" && asteroids.length > 0) {
    return (
      <div className="sky-summary error" role="alert">
        <p className="sky-line">
          {error} Showing {asteroids.length} of {matched}.
        </p>
        {retry && (
          <button type="button" className="btn btn-small" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    );
  }

  if (status !== "ready") {
    return (
      <div className="sky-summary">
        <p className="sky-line" role="status">
          {status === "loading" && <span className="pulse" aria-hidden="true" />}
          {status === "loading" ? "Charting " : ""}
          <strong className="sky-title">{title}</strong>
          {status === "loading" && "…"}
          {status === "loading" && matched > 0 && (
            <span className="num">
              {" "}
              {asteroids.length} of {matched}
            </span>
          )}
        </p>
        {make}
      </div>
    );
  }

  return (
    <div className="sky-summary">
      <p className="sky-line" role="status">
        <strong className="sky-title">{title}</strong>
        <span className="sky-sep" aria-hidden="true">
          {" "}
          ·{" "}
        </span>
        <span className="nowrap">
          <strong className="num">{asteroids.length}</strong> asteroids
          {catalogTotal ? ` of ${catalogTotal.toLocaleString("en-US")}` : ""}
        </span>
        <span className="sky-sim"> · dates simulated</span>
      </p>
      {notice && (
        <p className="sky-notice" role="alert">
          {notice.text}
          {notice.onAction && (
            <button type="button" className="btn btn-small" onClick={notice.onAction}>
              {notice.actionLabel}
            </button>
          )}
        </p>
      )}
      <HighlightChips asteroids={asteroids} value={highlight} onChange={onHighlight} />
      {make}
    </div>
  );
}
