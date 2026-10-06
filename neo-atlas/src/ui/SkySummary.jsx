import { HIGHLIGHTS, highlightCounts } from "../lib/highlights.js";

/**
 * Under the chart: what it shows in one line, a hint on what to do, and one big
 * button, "Make a postcard". Everything else waits in the ⋯ menu. A highlight
 * picked there shows here as a chip, so it is easy to see and to turn off.
 * When the chart is empty, the chart itself says why, so this stays short.
 *
 * `when` finishes "… passed Earth" (e.g. "in 2024"); with `heading` (a shared
 * constellation still loading) that name is shown instead. `notice` is a
 * warning about the view, such as stars a shared link couldn't load.
 */
export default function SkySummary({
  when,
  heading = null,
  result,
  highlight,
  onHighlight,
  notice = null,
  onPostcard = null,
  canMake = false,
}) {
  const { status, asteroids, matched, error, retry } = result;

  const make = onPostcard && (
    <button type="button" className="btn btn-solid btn-make main-go" onClick={onPostcard} disabled={!canMake}>
      <span aria-hidden="true">✦</span> Make a postcard
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

  // While nothing has arrived yet, the chart itself says it is loading; this only shows progress.
  if (status !== "ready") {
    return (
      <div className="sky-summary">
        <p className="sky-line" role="status" hidden={matched === 0}>
          <span className="pulse" aria-hidden="true" />
          {heading ? `Loading ${heading}…` : `Finding the asteroids that passed Earth ${when}…`}
          {matched > 0 && (
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

  const on = HIGHLIGHTS.find((h) => h.key === highlight);

  return (
    <div className="sky-summary">
      <p className="sky-line" role="status">
        {heading ? (
          <>
            <strong className="sky-title">{heading}</strong> ·{" "}
            <strong className="num">{asteroids.length}</strong> asteroids
          </>
        ) : (
          <>
            <strong className="num">{asteroids.length}</strong> real asteroids passed Earth {when}.
          </>
        )}
      </p>
      <p className="sky-hint">
        Tap a star to meet it<span className="sky-sim"> · dates simulated</span>
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
      {on && (
        <button
          type="button"
          className={`chip chip-${on.key} chip-on`}
          aria-pressed="true"
          onClick={() => onHighlight(null)}
          aria-label={`Showing ${on.label}. Show all asteroids`}
        >
          <span className="chip-mark" aria-hidden="true" />
          <span className="num">{highlightCounts(asteroids)[on.key]}</span> {on.label}
          <span className="chip-x" aria-hidden="true">
            ×
          </span>
        </button>
      )}
      {make}
    </div>
  );
}
