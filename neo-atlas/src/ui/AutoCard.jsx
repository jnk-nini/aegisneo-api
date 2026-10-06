import { constellationSky, starCount } from "../lib/constellations.js";
import { sizeComparison } from "../lib/facts.js";
import { formatMonthDay } from "../lib/format.js";
import { matchInfo } from "../lib/match.js";
import StepTrail from "./StepTrail.jsx";

/**
 * Under the chart while a constellation is shown: one line about it and one big
 * button to make it a postcard. A constellation made for the visitor (their
 * birthday's, or a Star Match) also gets the step trail, rises in once it has
 * drawn itself (`reveal`), and may have two quiet extras: the asteroid sign and Shuffle.
 *
 * `sign` is the birthday's asteroid sign, when there is one to show.
 */
export default function AutoCard({
  constellation,
  reveal = false,
  sign = null,
  onPostcard,
  onShuffle = null,
  onSign,
}) {
  const match = matchInfo(constellation);
  const sky = constellationSky(constellation);
  const biggest = constellation.asteroids.reduce((best, a) =>
    a.estimated_diameter_km > best.estimated_diameter_km ? a : best,
  );
  const when = sky?.mode === "date" ? ` on ${formatMonthDay(sky.date)}` : sky ? ` in ${sky.year}` : "";
  const extras = sign || onShuffle;

  return (
    <div className={reveal ? "sky-summary auto-card reveal" : "sky-summary auto-card"}>
      {reveal && <StepTrail step={1} />}
      {match ? (
        <p className="auto-line" role="status">
          <strong className="match-score">Cosmic match {match.score}%</strong> {match.line}
          <span className="sky-sim"> Just for fun.</span>
        </p>
      ) : (
        <p className="auto-line" role="status">
          Made from {starCount(constellation)} real asteroids that passed Earth{when}. The biggest is{" "}
          {sizeComparison(biggest.estimated_diameter_km)}.
        </p>
      )}
      <button type="button" className="btn btn-solid btn-make main-go" onClick={onPostcard}>
        <span aria-hidden="true">✦</span> {match ? "Send it back as a postcard" : "Make it a postcard"}
      </button>
      {extras && (
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
        </div>
      )}
    </div>
  );
}
