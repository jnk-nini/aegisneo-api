import { EARTH_RADIUS_M } from "../physics/impact.js";
import { localFrame } from "../lib/geo.js";

export const LIFT = 1 + 2e-6; // ~13 m above the surface, enough to avoid z-fighting

export const metersToAngle = (m) => Math.min(m / EARTH_RADIUS_M, Math.PI * 0.999);

/** Points of a geodesic circle of angular radius `angle` around unit vector `center`. */
export function circlePoints(center, angle, segments = 128, radius = LIFT) {
  const { up, east, north } = localFrame(center);
  const points = [];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push(
      up
        .clone()
        .multiplyScalar(c)
        .addScaledVector(east, s * Math.cos(a))
        .addScaledVector(north, s * Math.sin(a))
        .multiplyScalar(radius),
    );
  }
  return points;
}
