import { useId } from "react";
import { MONTHS } from "../lib/calendar.js";
import { FIRST_YEAR, LAST_YEAR } from "../lib/chart.js";
import { todayMonthDay } from "../lib/sky.js";

const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => LAST_YEAR - i);
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad = (n) => String(n).padStart(2, "0");

/** Choose what to chart: a whole year, or one calendar date (such as a birthday) across every year. */
export default function SkyControls({ sky, onChange, disabled = false }) {
  const name = useId();
  const [month, day] = sky.date.split("-").map(Number);

  const setMonthDay = (m, d) =>
    onChange({ ...sky, date: `${pad(m)}-${pad(Math.min(d, DAYS_IN_MONTH[m - 1]))}` });
  const stepYear = (delta) => onChange({ ...sky, year: sky.year + delta });

  return (
    <div className="sky-controls">
      <fieldset className="segmented">
        <legend className="sr-only">Chart a</legend>
        <label>
          <input
            type="radio"
            name={name}
            value="year"
            checked={sky.mode === "year"}
            disabled={disabled}
            onChange={() => onChange({ ...sky, mode: "year" })}
          />
          <span>Year</span>
        </label>
        <label>
          <input
            type="radio"
            name={name}
            value="date"
            checked={sky.mode === "date"}
            disabled={disabled}
            onChange={() => onChange({ ...sky, mode: "date" })}
          />
          <span>Birthday</span>
        </label>
      </fieldset>

      {sky.mode === "year" ? (
        <div className="picker">
          <button
            type="button"
            className="icon-btn"
            onClick={() => stepYear(-1)}
            disabled={disabled || sky.year <= FIRST_YEAR}
            aria-label="Previous year"
          >
            ‹
          </button>
          <label className="select-wrap">
            <span className="sr-only">Year</span>
            <select
              disabled={disabled}
              value={sky.year}
              onChange={(e) => onChange({ ...sky, year: Number(e.target.value) })}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="icon-btn"
            onClick={() => stepYear(1)}
            disabled={disabled || sky.year >= LAST_YEAR}
            aria-label="Next year"
          >
            ›
          </button>
        </div>
      ) : (
        <div className="picker">
          <label className="select-wrap">
            <span className="sr-only">Day</span>
            <select
              disabled={disabled}
              value={day}
              onChange={(e) => setMonthDay(month, Number(e.target.value))}
            >
              {Array.from({ length: DAYS_IN_MONTH[month - 1] }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="select-wrap">
            <span className="sr-only">Month</span>
            <select
              disabled={disabled}
              value={month}
              onChange={(e) => setMonthDay(Number(e.target.value), day)}
            >
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-small"
            disabled={disabled}
            onClick={() => onChange({ ...sky, date: todayMonthDay() })}
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
}
