import { FIRST_YEAR, LAST_YEAR } from "../lib/chart.js";
import { constellationSky, starCount } from "../lib/constellations.js";
import { formatMonthDay } from "../lib/format.js";

/**
 * Under the chart while a constellation made by "Make a postcard" is shown:
 * what it was made from, then write the postcard, try another shape, or draw one by hand.
 */
export default function AutoCard({ constellation, onPostcard, onShuffle, onDraw }) {
  const sky = constellationSky(constellation);
  const when =
    sky?.mode === "date"
      ? `on a ${formatMonthDay(sky.date)} between ${FIRST_YEAR} and ${LAST_YEAR}`
      : `in ${sky?.year ?? "this sky"}`;

  return (
    <div className="sky-summary auto-card">
      <p className="sky-line" role="status">
        Joined from {starCount(constellation)} of the biggest asteroids that passed Earth {when}.
        <span className="sky-sim"> Dates simulated.</span>
      </p>
      <div className="auto-actions">
        <button type="button" className="btn btn-solid btn-make" onClick={onPostcard}>
          <span aria-hidden="true">✦</span> Write a postcard
        </button>
        <button type="button" className="btn btn-small" onClick={onShuffle}>
          Shuffle
        </button>
        <button type="button" className="btn btn-small btn-quiet" onClick={onDraw}>
          Draw my own
        </button>
      </div>
    </div>
  );
}
