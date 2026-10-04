import { useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { dialSegments } from "../lib/chart.js";
import AtlasFrame from "./AtlasFrame.jsx";

const VIEW = 110; // the dial spans -110…110 in SVG units
const HIT_PX = 24; // how far (in screen pixels) a tap may land from a star and still pick it
const TAP_MOVE_PX = 8;
const TAP_MS = 500;

function Star({ star, k }) {
  const r = star.size / Math.sqrt(k); // stars grow a little when zoomed, but not in proportion
  const { x, y } = star;
  return (
    <g className={star.hazardous ? "star hazardous" : "star"}>
      <circle cx={x} cy={y} r={r * 3.2} className="star-halo" />
      {star.hazardous ? (
        <path
          d={`M${x} ${y - r * 1.35}L${x + r * 1.35} ${y}L${x} ${y + r * 1.35}L${x - r * 1.35} ${y}Z`}
          className="star-core"
        />
      ) : (
        <circle cx={x} cy={y} r={r} className="star-core" />
      )}
    </g>
  );
}

function StarLabel({ star, k, variant }) {
  const r = star.size / Math.sqrt(k);
  const ring = r * 2.4 + 1.6 / k;
  return (
    <g className={`star-mark ${variant}`} pointerEvents="none">
      <circle cx={star.x} cy={star.y} r={ring} className="star-ring" style={{ strokeWidth: 0.8 / k }} />
      <text x={star.x + ring + 2 / k} y={star.y} dominantBaseline="central" style={{ fontSize: 6 / k }}>
        {star.data.name}
      </text>
    </g>
  );
}

/**
 * The interactive planisphere. Pan and zoom with drag, pinch, wheel or the
 * buttons; tap or click near a star to select it; with the chart focused, the
 * arrow keys step through the stars in date order.
 */
export default function StarChart({ stars, mode, selectedId, onSelect, description }) {
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const tapRef = useRef(null);
  const [transform, setTransform] = useState(zoomIdentity);
  const [hoverId, setHoverId] = useState(null);
  const dial = useMemo(() => dialSegments(mode), [mode]);
  const ordered = useMemo(() => [...stars].sort((a, b) => a.angle - b.angle), [stars]);
  const byId = useMemo(() => new Map(stars.map((s) => [s.id, s])), [stars]);

  useEffect(() => {
    const svg = select(svgRef.current);
    let frame = 0;
    let latest = zoomIdentity;
    const behavior = zoom()
      .scaleExtent([1, 14])
      .translateExtent([
        [-VIEW, -VIEW],
        [VIEW, VIEW],
      ])
      .clickDistance(TAP_MOVE_PX)
      .tapDistance(TAP_MOVE_PX)
      .on("zoom", (event) => {
        latest = event.transform;
        // One React update per animation frame, however fast the gesture events arrive.
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            setTransform(latest);
          });
        }
      });
    zoomRef.current = behavior;
    svg.call(behavior);
    return () => {
      cancelAnimationFrame(frame);
      svg.on(".zoom", null);
    };
  }, []);

  // A different kind of sky has a different dial, so start it fully zoomed out.
  useEffect(() => {
    if (zoomRef.current) select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  }, [mode]);

  const zoomBy = (factor) => select(svgRef.current).call(zoomRef.current.scaleBy, factor);
  const resetZoom = () => select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);

  function nearestStar(clientX, clientY) {
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const [x, y] = transform.invert([point.x, point.y]);
    let best = null;
    let bestDist = HIT_PX / (ctm.a * transform.k);
    for (const star of stars) {
      const dist = Math.hypot(star.x - x, star.y - y);
      if (dist < bestDist) {
        best = star;
        bestDist = dist;
      }
    }
    return best;
  }

  // Taps are detected with pointer events so they work the same for mouse, touch and pen,
  // and a drag or pinch never counts as a tap.
  const onPointerDown = (e) => {
    tapRef.current = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  };
  const onPointerUp = (e) => {
    const tap = tapRef.current;
    tapRef.current = null;
    if (!tap || !e.isPrimary) return;
    const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y);
    if (moved > TAP_MOVE_PX || performance.now() - tap.t > TAP_MS) return;
    onSelect(nearestStar(e.clientX, e.clientY)?.id ?? null);
  };
  const onPointerMove = (e) => {
    if (e.pointerType !== "mouse" || e.buttons) return;
    const id = nearestStar(e.clientX, e.clientY)?.id ?? null;
    if (id !== hoverId) setHoverId(id);
  };

  const onKeyDown = (e) => {
    if (e.key === "+" || e.key === "=") return zoomBy(1.5);
    if (e.key === "-" || e.key === "_") return zoomBy(1 / 1.5);
    if (e.key === "0") return resetZoom();
    if (e.key === "Escape") return onSelect(null);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step || ordered.length === 0) return;
    e.preventDefault();
    const index = ordered.findIndex((s) => s.id === selectedId);
    const next = index === -1 ? (step > 0 ? 0 : ordered.length - 1) : (index + step + ordered.length) % ordered.length;
    onSelect(ordered[next].id);
  };

  const selected = byId.get(selectedId);
  const hovered = hoverId !== selectedId ? byId.get(hoverId) : null;
  const { x, y, k } = transform;

  return (
    <div className="star-chart">
      <svg
        ref={svgRef}
        viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
        className="star-chart-svg"
        tabIndex={0}
        role="group"
        aria-roledescription="star chart"
        aria-label={description}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverId(null)}
        onKeyDown={onKeyDown}
        style={{ cursor: hovered ? "pointer" : "grab" }}
      >
        <defs>
          {/* Soft glows as shared gradients: far cheaper on phones than blur filters. */}
          <radialGradient id="halo-nominal" className="halo-nominal">
            <stop offset="0%" stopOpacity="0.45" />
            <stop offset="100%" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="halo-hazard" className="halo-hazard">
            <stop offset="0%" stopOpacity="0.55" />
            <stop offset="100%" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(${x},${y}) scale(${k})`}>
          <AtlasFrame segments={dial.segments} ticks={dial.ticks} />
          <g className="stars">
            {stars.map((star) => (
              <Star key={star.id} star={star} k={k} />
            ))}
          </g>
          {hovered && <StarLabel star={hovered} k={k} variant="hover" />}
          {selected && <StarLabel star={selected} k={k} variant="selected" />}
        </g>
      </svg>

      <div className="zoom-controls">
        <button type="button" className="icon-btn" onClick={() => zoomBy(1.6)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out">
          −
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={resetZoom}
          aria-label="Reset zoom"
          disabled={k === 1 && x === 0 && y === 0}
        >
          ⟲
        </button>
      </div>
    </div>
  );
}
