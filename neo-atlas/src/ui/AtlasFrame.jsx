import { dayAngle, MONTH_STARTS, MONTHS } from "../lib/calendar.js";

const R_OUTER = 104;
const R_BAND_OUT = 100;
const R_BAND_IN = 86;
const R_LABEL = 93;

const polar = (r, angle) => [r * Math.cos(angle), r * Math.sin(angle)];

/** The fixed engraving of the planisphere: calendar band, guide rings and Earth at the center. */
export default function AtlasFrame({ children }) {
  return (
    <svg className="atlas-frame" viewBox="-110 -110 220 220" role="img" aria-labelledby="atlas-frame-title">
      <title id="atlas-frame-title">Star atlas dial with the months of the year around Earth</title>

      <circle r={R_OUTER} className="frame-line strong" />
      <circle r={R_BAND_OUT} className="frame-line" />
      <circle r={R_BAND_IN} className="frame-line" />

      {Array.from({ length: 366 }, (_, day) => {
        const isMonthStart = MONTH_STARTS.includes(day);
        const [x1, y1] = polar(isMonthStart ? R_BAND_IN : R_BAND_OUT - 1.6, dayAngle(day));
        const [x2, y2] = polar(R_BAND_OUT, dayAngle(day));
        return (
          <line key={day} x1={x1} y1={y1} x2={x2} y2={y2} className={isMonthStart ? "frame-line" : "frame-tick"} />
        );
      })}

      {MONTHS.map((month, i) => {
        const end = i === 11 ? 366 : MONTH_STARTS[i + 1];
        const angle = dayAngle((MONTH_STARTS[i] + end) / 2);
        const [x, y] = polar(R_LABEL, angle);
        // Set along the ring like an engraved dial; the lower half is flipped so it never reads upside down.
        const deg = (angle * 180) / Math.PI + (y > 0 ? -90 : 90);
        return (
          <text
            key={month}
            x={x}
            y={y}
            transform={`rotate(${deg.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})`}
            className="frame-month"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {month}
          </text>
        );
      })}

      {[28, 52, 76].map((r) => (
        <circle key={r} r={r} className="frame-guide" />
      ))}
      <line x1={-R_BAND_IN} y1="0" x2={R_BAND_IN} y2="0" className="frame-guide" />
      <line x1="0" y1={-R_BAND_IN} x2="0" y2={R_BAND_IN} className="frame-guide" />

      {children}

      <circle r="3.2" className="frame-earth" />
      <text y="9" className="frame-earth-label" textAnchor="middle">
        Earth
      </text>
    </svg>
  );
}
