import { useId, useState } from "react";
import { MONTH_LENGTHS, MONTHS } from "../lib/calendar.js";
import Modal from "./Modal.jsx";

const pad = (n) => String(n).padStart(2, "0");

/** The first-visit welcome: pick a birthday and get its sky, with a constellation ready to send. */
export default function WelcomeDialog({ date, onShow, onClose }) {
  const titleId = useId();
  const [month, setMonth] = useState(Number(date.slice(0, 2)));
  const [day, setDay] = useState(Number(date.slice(3)));
  const days = MONTH_LENGTHS[month - 1];

  return (
    <Modal onClose={onClose} labelledBy={titleId} className="welcome">
      <form
        className="welcome-body"
        onSubmit={(e) => {
          e.preventDefault();
          onShow(`${pad(month)}-${pad(Math.min(day, days))}`);
        }}
      >
        <p className="eyebrow">NEO Atlas</p>
        <h2 id={titleId}>When&rsquo;s your birthday?</h2>
        <p>
          See the real near-Earth asteroids charted for your day, joined into a constellation you can send as
          a postcard.
        </p>
        <div className="picker welcome-picker">
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
        <div className="welcome-actions">
          <button type="submit" className="btn btn-solid btn-make">
            <span aria-hidden="true">✦</span> Show my sky
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Just look around
          </button>
        </div>
        <p className="postcard-fine">
          Only the day and month are used. Close-approach dates in the catalog are simulated.
        </p>
      </form>
    </Modal>
  );
}
