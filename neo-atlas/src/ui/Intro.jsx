import { useId, useState } from "react";
import { MONTH_LENGTHS, MONTHS } from "../lib/calendar.js";
import Modal from "./Modal.jsx";
import StepTrail from "./StepTrail.jsx";

const pad = (n) => String(n).padStart(2, "0");

/**
 * The first screen of a first visit: one question and one button, over a
 * starry sky, with nothing else to look at. The step trail shows the whole
 * journey (stars, postcard, send) before it starts. Answering it reveals the birthday's
 * constellation; "Just explore" goes straight to the chart.
 */
export default function Intro({ date, onShow, onClose }) {
  const titleId = useId();
  const [month, setMonth] = useState(Number(date.slice(0, 2)));
  const [day, setDay] = useState(Number(date.slice(3)));
  const days = MONTH_LENGTHS[month - 1];

  return (
    <Modal onClose={onClose} labelledBy={titleId} className="intro">
      <div className="intro-sky" aria-hidden="true" />
      <form
        className="intro-body"
        onSubmit={(e) => {
          e.preventDefault();
          onShow(`${pad(month)}-${pad(Math.min(day, days))}`);
        }}
      >
        <p className="intro-mark">
          <img src="/favicon.svg" alt="" width="22" height="22" />
          NEO Atlas
        </p>
        <StepTrail step={1} className="intro-trail" />
        <h2 id={titleId}>When&rsquo;s your birthday?</h2>
        <p className="intro-lede">Real asteroids flew past Earth on your day. Let&rsquo;s find yours.</p>
        <div className="intro-picker">
          <label className="select-wrap">
            <span className="sr-only">Day</span>
            <select value={Math.min(day, days)} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: days }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="select-wrap">
            <span className="sr-only">Month</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="btn btn-solid btn-make intro-go">
          <span aria-hidden="true">✦</span> Reveal my stars
        </button>
        <button type="button" className="btn btn-quiet intro-skip" onClick={onClose}>
          Just explore the sky
        </button>
        <p className="intro-fine">Only the day and month are used. Asteroid dates are simulated.</p>
      </form>
    </Modal>
  );
}
