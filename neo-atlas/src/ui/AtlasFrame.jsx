import { memo } from "react";
import { DISTANCE_RINGS, fractionToAngle } from "../lib/chart.js";

const R_OUTER = 104;
const R_BAND_OUT = 100;
const R_BAND_IN = 86;
const R_LABEL = 93;

// Smallest on-screen sizes, in pixels, for the ring labels and "Earth".
const RING_LABEL_PX = 8.5;
const EARTH_LABEL_PX = 10;

const polar = (r, angle) => [r * Math.cos(angle), r * Math.sin(angle)];

/**
 * The fixed engraving of the planisphere: the labelled band (months or
 * decades), distance rings in lunar distances, and Earth at the center.
 * `unitPx` is screen pixels per dial unit; on a phone the small labels are
 * drawn larger so they stay readable. They grow more slowly than the zoom `k`,
 * so zooming in doesn't blow them up across the stars.
 */
function AtlasFrame({ segments, ticks, unitPx = 2, k = 1 }) {
  const boundaries = new Set(segments.map((s) => Math.round(s.from * ticks)));
  const ringLabelSize = Math.max(3, RING_LABEL_PX / unitPx) / Math.sqrt(k);
  const earthLabelSize = Math.max(4.6, EARTH_LABEL_PX / unitPx) / Math.sqrt(k);

  return (
    <g className="atlas-frame" aria-hidden="true">
      <circle r={R_OUTER} className="frame-line strong" />
      <circle r={R_BAND_OUT} className="frame-line" />
      <circle r={R_BAND_IN} className="frame-line" />

      {Array.from({ length: ticks }, (_, i) => {
        const isBoundary = boundaries.has(i);
        const angle = fractionToAngle(i / ticks);
        const [x1, y1] = polar(isBoundary ? R_BAND_IN : R_BAND_OUT - 1.6, angle);
        const [x2, y2] = polar(R_BAND_OUT, angle);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className={isBoundary ? "frame-line" : "frame-tick"}
          />
        );
      })}

      {segments.map((segment) => {
        const angle = fractionToAngle((segment.from + segment.to) / 2);
        const [x, y] = polar(R_LABEL, angle);
        // Set along the ring like an engraved dial; the lower half is flipped so it never reads upside down.
        const deg = (angle * 180) / Math.PI + (y > 0 ? -90 : 90);
        return (
          <text
            key={segment.label}
            x={x}
            y={y}
            transform={`rotate(${deg.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})`}
            className="frame-month"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {segment.label}
          </text>
        );
      })}

      <line x1={-R_BAND_IN} y1="0" x2={R_BAND_IN} y2="0" className="frame-guide" />
      <line x1="0" y1={-R_BAND_IN} x2="0" y2={R_BAND_IN} className="frame-guide" />
      {DISTANCE_RINGS.map((ring) => (
        <g key={ring.ld}>
          <circle r={ring.r} className={ring.ld === 1 ? "frame-guide moon" : "frame-guide"} />
          <text x="1.4" y={-ring.r - 1.2} className="frame-ring-label" style={{ fontSize: ringLabelSize }}>
            {ring.label}
          </text>
        </g>
      ))}

      <circle r="3.2" className="frame-earth" />
      <text
        y={3.2 + earthLabelSize}
        className="frame-earth-label"
        textAnchor="middle"
        style={{ fontSize: earthLabelSize }}
      >
        Earth
      </text>
    </g>
  );
}

export default memo(AtlasFrame);
