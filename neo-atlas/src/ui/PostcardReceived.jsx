import { useCallback, useEffect, useId, useState } from "react";
import { MONTH_LENGTHS, MONTHS } from "../lib/calendar.js";
import { constellationSky } from "../lib/constellations.js";
import { buzz, saveFile } from "../lib/files.js";
import { formatDate } from "../lib/format.js";
import { matchInfo } from "../lib/match.js";
import { calendarFile, cardDescription, drawPostcard, isSealed, localISO, timeUntil } from "../lib/postcard.js";
import Burst from "./Burst.jsx";
import CardCanvas from "./CardCanvas.jsx";
import Modal from "./Modal.jsx";

const OPEN_AFTER_MS = 1300; // the envelope opens by itself, so nobody has to work out what to tap
const OPENING_MS = 650;
const pad = (n) => String(n).padStart(2, "0");
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Envelope({ sealed = false }) {
  return (
    <div className={sealed ? "envelope sealed" : "envelope"} aria-hidden="true">
      <span className="envelope-card" />
      <span className="envelope-front" />
      <span className="envelope-flap" />
      <span className="wax-seal">✦</span>
    </div>
  );
}

/** The day and month picker for Star Match. */
function BirthdayForm({ busy, onSubmit }) {
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);
  const days = MONTH_LENGTHS[month - 1];
  return (
    <form
      className="match-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(`${pad(month)}-${pad(Math.min(day, days))}`);
      }}
    >
      <p className="match-ask">Your birthday:</p>
      <div className="picker">
        <label className="select-wrap">
          <span className="sr-only">Day</span>
          <select value={Math.min(day, days)} onChange={(e) => setDay(Number(e.target.value))} disabled={busy}>
            {Array.from({ length: days }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="select-wrap">
          <span className="sr-only">Month</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} disabled={busy}>
            {MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" className="btn btn-solid btn-make" disabled={busy}>
        {busy ? (
          <>
            <span className="pulse" aria-hidden="true" /> Finding your stars…
          </>
        ) : (
          <>
            <span aria-hidden="true">✦</span> Join our stars
          </>
        )}
      </button>
    </form>
  );
}

/**
 * A postcard someone sent as a link. It arrives in an envelope that opens by
 * itself (or on a tap). A sealed one stays shut with a countdown until its day.
 * Its message and name were typed by the sender, so they are only ever shown as
 * plain text, and said to be theirs.
 *
 * A birthday postcard offers Star Match: add your own birthday and the two
 * constellations are joined (`onMatch(date)`, with `matching` while it loads).
 * A Star Match shows its score and offers to send one back (`onReply`).
 */
export default function PostcardReceived({
  constellation,
  backdrop,
  postcard,
  matching = false,
  onExplore,
  onMakeOwn,
  onMatch,
  onReply,
}) {
  const titleId = useId();
  const { message, from, theme, sealed } = postcard;
  const [now, setNow] = useState(() => new Date());
  const [early, setEarly] = useState(false);
  const [sure, setSure] = useState(false);
  const [phase, setPhase] = useState(() => (reducedMotion() ? "open" : "envelope"));
  const [askDate, setAskDate] = useState(false);
  const locked = isSealed(sealed, now) && !early;
  const match = matchInfo(constellation);
  const canMatch = !match && constellationSky(constellation)?.mode === "date";
  // A sealed birthday postcard opened on the day itself.
  const birthday = Boolean(sealed) && sealed === localISO(now) && !locked;

  // While sealed, the countdown ticks; at zero the envelope opens.
  useEffect(() => {
    if (!locked) return undefined;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [locked]);

  useEffect(() => {
    if (locked || phase !== "envelope") return undefined;
    const id = setTimeout(() => setPhase("opening"), OPEN_AFTER_MS);
    return () => clearTimeout(id);
  }, [locked, phase]);

  useEffect(() => {
    if (phase !== "opening") return undefined;
    const id = setTimeout(() => {
      setPhase("open");
      buzz(birthday ? [10, 40, 10, 40, 20] : 12);
    }, OPENING_MS);
    return () => clearTimeout(id);
  }, [phase, birthday]);

  const draw = useCallback(
    (ctx) => drawPostcard(ctx, { constellation, backdrop, message, from, theme, site: window.location.host }),
    [constellation, backdrop, message, from, theme],
  );

  const remind = () => {
    const text = calendarFile({ until: sealed, from, link: window.location.href });
    saveFile(new File([text], "neo-atlas-postcard.ics", { type: "text/calendar" }));
  };

  const openEarly = () => {
    if (!sure) return setSure(true);
    setEarly(true);
    setPhase("opening");
  };

  if (locked) {
    const left = timeUntil(sealed, now);
    return (
      <Modal onClose={onExplore} labelledBy={titleId} className="postcard-modal">
        <div className="received sealed-view">
          <Envelope sealed />
          <p className="eyebrow">A sealed postcard</p>
          <h2 id={titleId}>{from ? `From ${from}` : "For you"}</h2>
          <p className="sealed-when">Opens on {formatDate(sealed)}</p>
          <p className="countdown" role="timer" aria-label={`${left.days} days and ${left.hours} hours to go`}>
            {[
              [left.days, "days"],
              [left.hours, "hrs"],
              [left.minutes, "min"],
              [left.seconds, "sec"],
            ].map(([n, unit]) => (
              <span key={unit}>
                <strong className="num">{unit === "days" ? n : pad(n)}</strong>
                {unit}
              </span>
            ))}
          </p>
          <div className="received-actions">
            <button type="button" className="btn btn-solid btn-make" onClick={remind}>
              <span aria-hidden="true">🗓</span> Remind me on the day
            </button>
            <button type="button" className="btn btn-small btn-quiet" onClick={openEarly}>
              {sure ? "Sure? Tap again to peek now" : "Open it early"}
            </button>
          </div>
          {from && <p className="postcard-fine">The name was written by whoever sent you this link.</p>}
        </div>
      </Modal>
    );
  }

  if (phase !== "open") {
    return (
      <Modal onClose={onExplore} labelledBy={titleId} className="postcard-modal">
        <div className="received envelope-view">
          <h2 id={titleId} className="sr-only">
            {from ? `A postcard from ${from}` : "A postcard for you"}
          </h2>
          <button
            type="button"
            className={phase === "opening" ? "envelope-stage opening" : "envelope-stage"}
            onClick={() => setPhase("opening")}
          >
            <Envelope />
            <span className="envelope-from">{from ? `From ${from}` : "You've got a postcard"}</span>
            <span className="envelope-hint">Tap to open</span>
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onExplore} labelledBy={titleId} className="postcard-modal">
      <div className="received received-open">
        <div className="received-card">
          <CardCanvas
            draw={draw}
            label={cardDescription(constellation, { message, from })}
            className="card-rise"
          />
          {birthday && <Burst />}
        </div>

        <div className="received-panel">
          <p className="eyebrow">{birthday ? "Happy birthday!" : "You've got a postcard"}</p>
          <h2 id={titleId} className="received-title">
            {from ? `From ${from}` : "A postcard from the stars"}
          </h2>
          {match ? (
            <p className="match-badge">
              <strong>
                <span aria-hidden="true">💫</span> Cosmic match {match.score}%
              </strong>{" "}
              {match.line} <span className="sky-sim">Just for fun.</span>
            </p>
          ) : (
            <p className="received-text">
              <strong>{constellation.name}</strong> is drawn between real near-Earth asteroids.
            </p>
          )}

          <div className="received-actions">
            {match && (
              <button type="button" className="btn btn-solid btn-make" onClick={onReply}>
                <span aria-hidden="true">✦</span> Send one back
              </button>
            )}
            {canMatch &&
              (askDate ? (
                <BirthdayForm busy={matching} onSubmit={onMatch} />
              ) : (
                <button type="button" className="btn btn-solid btn-make" onClick={() => setAskDate(true)}>
                  <span aria-hidden="true">✦</span> Add your birthday
                </button>
              ))}
            {canMatch && !askDate && (
              <p className="match-hint">See what your stars and theirs make together.</p>
            )}
            <div className="received-more">
              <button
                type="button"
                className={!match && !canMatch ? "btn btn-solid" : "btn btn-small"}
                onClick={onExplore}
              >
                See it on the chart
              </button>
              <button type="button" className="btn btn-small btn-quiet" onClick={onMakeOwn}>
                Make your own
              </button>
            </div>
          </div>
          {(message || from) && (
            <p className="postcard-fine">The name and message were written by whoever sent you this link.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
