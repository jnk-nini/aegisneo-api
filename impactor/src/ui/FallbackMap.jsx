import { useEffect, useMemo, useState } from "react";
import { geoCircle, geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { useSim } from "../store.js";
import { loadWorld } from "../lib/world.js";
import { pickTarget } from "../lib/target.js";
import { zonesFor } from "../physics/zones.js";
import { EARTH_RADIUS_KM } from "../lib/geo.js";

const WIDTH = 960;
const HEIGHT = 480;

/**
 * 2D map used when WebGL isn't available, the 3D view crashed, or the user
 * prefers it. Zones are true geodesic circles (d3.geoCircle), so they are
 * correctly shaped even on a flat map.
 */
export default function FallbackMap({ reason }) {
  const target = useSim((s) => s.target);
  const run = useSim((s) => s.run);
  const phase = useSim((s) => s.phase);
  const [world, setWorld] = useState(null);
  const [zoomed, setZoomed] = useState(true);

  useEffect(() => {
    let alive = true;
    loadWorld()
      .then((w) => alive && setWorld(w))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const zones = useMemo(() => (run && phase === "done" ? zonesFor(run.result) : []), [run, phase]);
  const circles = useMemo(() => {
    if (!run) return [];
    return zones.map((z) => ({
      ...z,
      shape: geoCircle()
        .center([run.target.lon, run.target.lat])
        .radius((z.radiusM / 1000 / EARTH_RADIUS_KM) * (180 / Math.PI))
        .precision(1)(),
    }));
  }, [zones, run]);

  const projection = useMemo(() => {
    const p = geoEquirectangular();
    if (zoomed && circles.length) {
      p.fitExtent(
        [
          [40, 40],
          [WIDTH - 40, HEIGHT - 40],
        ],
        circles[0].shape,
      );
    } else {
      p.fitSize([WIDTH, HEIGHT], { type: "Sphere" });
    }
    return p;
  }, [zoomed, circles]);

  const path = useMemo(() => geoPath(projection), [projection]);
  const landPath = useMemo(() => (world ? path(world.land) : ""), [world, path]);
  const borderPath = useMemo(() => (world ? path(world.borders) : ""), [world, path]);
  const graticule = useMemo(() => path(geoGraticule10()), [path]);
  const targetPoint = target ? projection([target.lon, target.lat]) : null;

  const onClick = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * HEIGHT;
    const lonLat = projection.invert([x, y]);
    if (!lonLat || phase === "approach" || phase === "impact") return;
    const [lon, lat] = lonLat;
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) pickTarget(lat, lon);
  };

  return (
    <div className="fallback-map">
      {reason && (
        <p className="fallback-reason" role="status">
          {reason}
        </p>
      )}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={onClick}
        role="img"
        aria-label="World map. Click to choose a target."
      >
        <rect width={WIDTH} height={HEIGHT} fill="#061428" />
        <path d={graticule} fill="none" stroke="rgba(127,212,255,0.08)" />
        <path d={landPath} fill="#2b4a33" stroke="rgba(190,230,255,0.35)" strokeWidth="0.6" />
        <path d={borderPath} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
        {circles.map((c) => (
          <path
            key={c.key}
            d={path(c.shape)}
            fill={c.color}
            fillOpacity={c.key === "crater" ? 0.9 : 0.18}
            stroke={c.line}
            strokeWidth="1.5"
          />
        ))}
        {targetPoint && (
          <g transform={`translate(${targetPoint[0]},${targetPoint[1]})`} pointerEvents="none">
            <circle r="9" fill="none" stroke="#7fd4ff" strokeWidth="2" />
            <circle r="2.5" fill="#7fd4ff" />
          </g>
        )}
      </svg>
      {circles.length > 0 && (
        <button
          type="button"
          className="btn btn--small btn--glass fallback-zoom"
          onClick={() => setZoomed((z) => !z)}
        >
          {zoomed ? "Show whole world" : "Zoom to impact"}
        </button>
      )}
    </div>
  );
}
