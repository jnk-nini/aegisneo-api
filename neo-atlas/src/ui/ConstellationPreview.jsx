import { memo, useMemo } from "react";
import { placeStar } from "../lib/chart.js";

/** A small engraved thumbnail of a constellation, drawn exactly as it appears on the chart. */
function ConstellationPreview({ constellation }) {
  const { stars, lines } = useMemo(() => {
    const byId = new Map(
      constellation.asteroids.map((a) => [a.neo_reference_id, placeStar(a, constellation.mode)]),
    );
    const segments = [];
    for (let i = 1; i < constellation.path.length; i++) {
      const a = byId.get(constellation.path[i - 1]);
      const b = byId.get(constellation.path[i]);
      if (a && b) segments.push([a, b]);
    }
    return { stars: [...byId.values()], lines: segments };
  }, [constellation]);

  return (
    <svg viewBox="-110 -110 220 220" className="preview" aria-hidden="true">
      <circle r="104" className="preview-ring" />
      <circle r="3.5" className="preview-earth" />
      {lines.map(([a, b], i) => (
        <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="preview-line" />
      ))}
      {stars.map((s) => (
        <circle
          key={s.id}
          cx={s.x}
          cy={s.y}
          r={s.size * 1.8}
          className={s.hazardous ? "preview-star hazard" : "preview-star"}
        />
      ))}
    </svg>
  );
}

export default memo(ConstellationPreview);
