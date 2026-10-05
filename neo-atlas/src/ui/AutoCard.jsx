import { constellationSky, starCount } from "../lib/constellations.js";
import { sizeComparison } from "../lib/facts.js";
import { formatMonthDay } from "../lib/format.js";
import { matchInfo } from "../lib/match.js";

/**
 * Under the chart while a constellation made for the visitor is shown (their
 * birthday's, or a Star Match): one line about it, one big button to make it a
 * postcard, and a few quiet extras. It rises in once the constellation has drawn itself.
 *
 * `sign` is the birthday's asteroid sign, when there is one to show.
 */
export default function AutoCard({ constellation, sign, onPostcard, onShuffle, onDraw, onSign }) {
  const match = matchInfo(constellation);
  const sky = constellationSky(constellation);
  const biggest = constellation.asteroids.reduce((best, a) =>
    a.estimated_diameter_km > best.estimated_diameter_km ? a : best,
  );
  const when = sky?.mode === "date" ? `on ${formatMonthDay(sky.date)}` : sky ? `in ${sky.year}` : "";

  return (
    <div className="sky-summary auto-card">
      {match ? (
        <p className="auto-line" role="status">
          <strong className="match-score">Cosmic match {match.score}%</strong> {match.line}
          <span className="sky-sim"> Just for fun.</span>
        </p>
      ) : (
        <p className="auto-line" role="status">
          Made from {starCount(constellation)} real asteroids that passed Earth {when}. The biggest is{" "}
          {sizeComparison(biggest.estimated_diameter_km)}.
        </p>
      )}
      <button type="button" className="btn btn-solid btn-make auto-go" onClick={onPostcard}>
        <span aria-hidden="true">✦</span> {match ? "Send it back as a postcard" : "Make it a postcard"}
      </button>
      <div className="auto-more">
        {sign && (
          <button type="button" className="chip chip-sign" onClick={onSign}>
            <span aria-hidden="true">☄</span> You&rsquo;re {sign.title}
          </button>
        )}
        {onShuffle && (
          <button type="button" className="btn btn-small btn-quiet" onClick={onShuffle}>
            <span aria-hidden="true">↻</span> Shuffle
          </button>
        )}
        {onDraw && (
          <button type="button" className="btn btn-small btn-quiet" onClick={onDraw}>
            <span aria-hidden="true">✎</span> Draw my own
          </button>
        )}
      </div>
    </div>
  );
}
