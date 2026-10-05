import { memo, useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, zoomTransform } from "d3-zoom";
import { dialSegments } from "../lib/chart.js";
import { formatDate, formatLD } from "../lib/format.js";
import AtlasFrame from "./AtlasFrame.jsx";

const VIEW = 110; // the dial spans -110…110 in SVG units
const HIT_PX = 24; // how far (in screen pixels) a tap may land from a star and still pick it
const TAP_MOVE_PX = 8;
const TAP_MS = 500;
const NO_PATH = [];
const DIAL_EXTENT = [
  [-VIEW, -VIEW],
  [VIEW, VIEW],
];
// While the detail sheet is open the dial may slide further, so a star under the sheet can be moved into view.
const REVEAL_EXTENT = [
  [-VIEW * 2.5, -VIEW * 2.5],
  [VIEW * 2.5, VIEW * 2.5],
];
const REVEAL_MARGIN_PX = 48;
const TWEEN_MS = 280;

// Star labels stay at least this big on screen, in pixels.
const LABEL_PX = 11;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const sameTransform = (a, b) =>
  Math.abs(a.k - b.k) < 1e-3 && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
const isHome = (t) => t.k === 1 && Math.abs(t.x) < 0.5 && Math.abs(t.y) < 0.5;
const toAttr = (t) => `translate(${t.x},${t.y}) scale(${t.k})`;
// Star sizes follow the zoom in steps of about 19%, so a pan or a small zoom doesn't redraw every star.
const sizeStep = (k) => 2 ** (Math.round(Math.log2(k) * 4) / 4);

/** What a screen reader hears when the arrow keys land on a star. */
function describe(star) {
  const a = star.data;
  return `${a.name}, ${formatDate(a.close_approach_date)}, ${formatLD(a.miss_distance_km)} from Earth${
    a.is_potentially_hazardous ? ", potentially hazardous" : ""
  }.`;
}

const Star = memo(function Star({ star, k, dim, linked }) {
  const r = star.size / Math.sqrt(k); // stars grow a little when zoomed, but not in proportion
  const { x, y } = star;
  const className = ["star", star.hazardous && "hazardous", dim && "dim", linked && "linked"]
    .filter(Boolean)
    .join(" ");
  return (
    <g className={className}>
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
});

function StarLabel({ star, k, variant, unitPx }) {
  const r = star.size / Math.sqrt(k);
  const ring = r * 2.4 + 1.6 / k;
  const fontSize = Math.max(6, LABEL_PX / unitPx) / k;
  return (
    <g className={`star-mark ${variant}`} pointerEvents="none">
      <circle cx={star.x} cy={star.y} r={ring} className="star-ring" style={{ strokeWidth: 0.8 / k }} />
      <text x={star.x + ring + 2 / k} y={star.y} dominantBaseline="central" style={{ fontSize }}>
        {star.data.name}
      </text>
    </g>
  );
}

/** Constellation lines, drawn star to star in path order. */
function ConstellationLines({ path, byId, k, drawing }) {
  const segments = [];
  for (let i = 1; i < path.length; i++) {
    const a = byId.get(path[i - 1]);
    const b = byId.get(path[i]);
    if (a && b) segments.push([a, b, i]);
  }
  const last = byId.get(path[path.length - 1]);
  return (
    <g className={drawing ? "constellation drawing" : "constellation"} pointerEvents="none">
      {segments.map(([a, b, i]) => (
        <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={{ strokeWidth: 0.7 / k }} />
      ))}
      {drawing && last && (
        <circle
          cx={last.x}
          cy={last.y}
          r={(last.size * 2.6) / Math.sqrt(k) + 1.2 / k}
          className="path-end"
          style={{ strokeWidth: 0.7 / k }}
        />
      )}
    </g>
  );
}

/**
 * The interactive planisphere. Pan and zoom with drag, pinch, wheel or the
 * buttons; tap or click near a star to select it; with the chart focused, the
 * arrow keys step through the stars in date order.
 *
 * While `drawing`, a tap adds the star to the constellation instead, and the
 * arrow keys move a cursor that Enter adds.
 *
 * `coverRef` points at the detail sheet while it is open. If the selected star
 * ends up underneath it, the dial slides until the star is visible, and slides
 * back when the sheet closes.
 */
export default function StarChart({
  stars,
  mode,
  viewKey,
  selectedId,
  onSelect,
  description,
  path = NO_PATH,
  highlight = null,
  drawing = false,
  coverRef = null,
  covered = false,
  children,
}) {
  const svgRef = useRef(null);
  // The group that pans and zooms. Its transform is set directly, never through React,
  // so dragging the chart doesn't re-render ~350 stars on every frame.
  const sceneRef = useRef(null);
  const zoomRef = useRef(null);
  const dblClickRef = useRef(null);
  const tapRef = useRef(null);
  const tweenRef = useRef(0);
  // { from, to }: the view before the dial slid aside for the sheet, and where it slid to.
  const revealRef = useRef(null);
  // The zoom level star sizes and line widths are drawn for, in steps (see sizeStep).
  const [k, setK] = useState(1);
  const [home, setHome] = useState(true);
  // Screen pixels per dial unit, so text can stay readable on small screens.
  const [unitPx, setUnitPx] = useState(2);
  const [hoverId, setHoverId] = useState(null);
  const [cursorId, setCursorId] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const dial = useMemo(() => dialSegments(mode), [mode]);
  const ordered = useMemo(() => [...stars].sort((a, b) => a.angle - b.angle), [stars]);
  const byId = useMemo(() => new Map(stars.map((s) => [s.id, s])), [stars]);
  const linked = useMemo(() => new Set(path), [path]);

  useEffect(() => {
    const svgEl = svgRef.current;
    const svg = select(svgEl);
    const behavior = zoom()
      .scaleExtent([1, 14])
      .translateExtent(DIAL_EXTENT)
      .clickDistance(TAP_MOVE_PX)
      .tapDistance(TAP_MOVE_PX)
      .on("zoom", (event) => {
        const t = event.transform;
        sceneRef.current?.setAttribute("transform", toAttr(t));
        // React skips these when the value hasn't changed, which is most frames.
        setK(sizeStep(t.k));
        setHome(isHome(t));
      });
    zoomRef.current = behavior;
    svg.call(behavior);
    dblClickRef.current = svg.on("dblclick.zoom");

    const measure = () => {
      const { width, height } = svgEl.getBoundingClientRect();
      const size = Math.min(width, height);
      if (size) setUnitPx(Math.round((size / (VIEW * 2)) * 20) / 20);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(svgEl);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(tweenRef.current);
      svg.on(".zoom", null);
    };
  }, []);

  // A double tap while drawing is two stars in a row, not a zoom.
  useEffect(() => {
    select(svgRef.current).on("dblclick.zoom", drawing ? null : dblClickRef.current);
  }, [drawing]);

  /** Eases the view to `target` (instantly with reduced motion), then runs `done`. */
  function animateTo(target, done) {
    cancelAnimationFrame(tweenRef.current);
    const svg = select(svgRef.current);
    const behavior = zoomRef.current;
    const start = zoomTransform(svgRef.current);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      svg.call(behavior.transform, target);
      done?.();
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / TWEEN_MS);
      const e = 1 - (1 - p) ** 3;
      const k = start.k + (target.k - start.k) * e;
      svg.call(
        behavior.transform,
        zoomIdentity.translate(start.x + (target.x - start.x) * e, start.y + (target.y - start.y) * e).scale(k),
      );
      if (p < 1) tweenRef.current = requestAnimationFrame(step);
      else done?.();
    };
    tweenRef.current = requestAnimationFrame(step);
  }

  // A different kind of sky (or a constellation) has a different dial, so start it fully zoomed out.
  useEffect(() => {
    if (!zoomRef.current) return;
    cancelAnimationFrame(tweenRef.current);
    revealRef.current = null;
    zoomRef.current.translateExtent(DIAL_EXTENT);
    select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  }, [viewKey]);

  const selected = drawing ? null : byId.get(selectedId);

  // Keep the selected star out from under the detail sheet.
  useEffect(() => {
    const svgEl = svgRef.current;
    const behavior = zoomRef.current;
    const cover = covered ? coverRef?.current : null;

    if (!selected || !cover) {
      const r = revealRef.current;
      if (!r) return undefined;
      revealRef.current = null;
      // Slide back to where the visitor was, unless they have moved the chart since.
      const now = zoomTransform(svgEl);
      const target = sameTransform(now, r.to) ? r.from : behavior.constrain()(now, DIAL_EXTENT, DIAL_EXTENT);
      animateTo(target, () => behavior.translateExtent(DIAL_EXTENT));
      return undefined;
    }

    behavior.translateExtent(REVEAL_EXTENT);
    const run = () => {
      const box = svgEl.getBoundingClientRect();
      const ctm = svgEl.getScreenCTM();
      if (!box.width || !ctm) return; // the Chart tab is hidden
      // Where the sheet sits once laid out, ignoring the transform of its slide-in animation.
      const parent = cover.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const sheet = {
        left: parent.left + cover.offsetLeft,
        top: parent.top + cover.offsetTop,
        width: cover.offsetWidth,
        bottom: parent.top + cover.offsetTop + cover.offsetHeight,
      };
      const t = zoomTransform(svgEl);
      const [vx, vy] = t.apply([selected.x, selected.y]);
      const p = new DOMPoint(vx, vy).matrixTransform(ctm);

      // The part of the chart the sheet leaves visible: above a bottom sheet, or left of a side card.
      let { right, bottom } = box;
      if (sheet.width >= box.width * 0.8) bottom = Math.min(bottom, sheet.top);
      else if (sheet.left < right && sheet.bottom > box.top) right = Math.min(right, sheet.left);
      // A comfortable margin when there's room; with the sheet expanded on a small phone, the middle of what's left.
      const m = Math.min(REVEAL_MARGIN_PX, (bottom - box.top) / 2, (right - box.left) / 2);
      if (m < 12) return;

      const x = clamp(p.x, box.left + m, right - m);
      const y = clamp(p.y, box.top + m, bottom - m);
      if (Math.abs(x - p.x) < 1 && Math.abs(y - p.y) < 1) return;
      const target = zoomIdentity.translate(t.x + (x - p.x) / ctm.a, t.y + (y - p.y) / ctm.a).scale(t.k);
      revealRef.current = { from: revealRef.current?.from ?? t, to: target };
      animateTo(target);
    };

    const frame = requestAnimationFrame(run);
    // The sheet changes height when expanded, and the chart resizes when its tab is shown again.
    const observer = new ResizeObserver(() => run());
    observer.observe(cover);
    observer.observe(svgEl);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [selected, covered, coverRef]);

  const zoomBy = (factor) => select(svgRef.current).call(zoomRef.current.scaleBy, factor);
  const resetZoom = () => {
    revealRef.current = null;
    animateTo(zoomIdentity);
  };

  function nearestStar(clientX, clientY) {
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return null;
    const transform = zoomTransform(svgRef.current);
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
    if (drawing && (e.key === "Enter" || e.key === " ") && byId.has(cursorId)) {
      e.preventDefault();
      setAnnouncement(`Joined ${byId.get(cursorId).data.name}.`);
      return onSelect(cursorId);
    }
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step || ordered.length === 0) return;
    e.preventDefault();
    const current = drawing ? cursorId : selectedId;
    const index = ordered.findIndex((s) => s.id === current);
    const next =
      index === -1 ? (step > 0 ? 0 : ordered.length - 1) : (index + step + ordered.length) % ordered.length;
    setAnnouncement(describe(ordered[next]));
    if (drawing) setCursorId(ordered[next].id);
    else onSelect(ordered[next].id);
  };

  const pointedId = hoverId ?? (drawing ? cursorId : null);
  const hovered = pointedId !== selectedId ? byId.get(pointedId) : null;
  const isDim = (star) => highlight !== null && !highlight(star.data);

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
        style={{ cursor: hovered ? (drawing ? "crosshair" : "pointer") : "grab" }}
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
        <g ref={sceneRef}>
          <AtlasFrame segments={dial.segments} ticks={dial.ticks} unitPx={unitPx} k={k} />
          {path.length > 0 && <ConstellationLines path={path} byId={byId} k={k} drawing={drawing} />}
          <g className="stars">
            {stars.map((star) => (
              <Star key={star.id} star={star} k={k} dim={isDim(star)} linked={linked.has(star.id)} />
            ))}
          </g>
          {hovered && <StarLabel star={hovered} k={k} variant="hover" unitPx={unitPx} />}
          {selected && <StarLabel star={selected} k={k} variant="selected" unitPx={unitPx} />}
        </g>
      </svg>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {children}

      {/* The controls sit in the square's empty corners, outside the round dial, so they never hide a star. */}
      {!home && (
        <button type="button" className="icon-btn corner-btn zoom-reset" onClick={resetZoom} aria-label="Reset zoom">
          ⟲
        </button>
      )}
      <div className="zoom-controls">
        <button type="button" className="icon-btn corner-btn" onClick={() => zoomBy(1.6)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="icon-btn corner-btn" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out">
          −
        </button>
      </div>
    </div>
  );
}
