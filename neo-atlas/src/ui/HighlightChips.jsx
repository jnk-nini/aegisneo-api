import { HIGHLIGHTS, highlightCounts } from "../lib/highlights.js";

/** The counts double as toggles: tap one to pick those asteroids out on the chart and in the list. */
export default function HighlightChips({ asteroids, value, onChange }) {
  const counts = highlightCounts(asteroids);

  return (
    <div className="chips" role="group" aria-label="Highlight">
      {HIGHLIGHTS.map((h) => {
        const on = value === h.key;
        return (
          <button
            key={h.key}
            type="button"
            className={`chip chip-${h.key}`}
            aria-pressed={on}
            disabled={!on && counts[h.key] === 0}
            onClick={() => onChange(on ? null : h.key)}
          >
            <span className="chip-mark" aria-hidden="true" />
            <span className="num">{counts[h.key]}</span> {h.label}
          </button>
        );
      })}
    </div>
  );
}
