// Sphere geometry for the 3D scene. The globe is a unit sphere whose texture
// is an equirectangular map; these conversions match three.js SphereGeometry's
// UVs (u = 0 at longitude −180°, v = 1 at the north pole).
import { Vector3 } from "three";
import { EARTH_RADIUS_M } from "../physics/impact.js";

const DEG = Math.PI / 180;

export function latLonToVector(lat, lon, radius = 1, target = new Vector3()) {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  return target.set(
    -Math.cos(phi) * Math.sin(theta) * radius,
    Math.cos(theta) * radius,
    Math.sin(phi) * Math.sin(theta) * radius,
  );
}

export function vectorToLatLon(v) {
  const n = v.clone().normalize();
  const lat = 90 - Math.acos(Math.min(1, Math.max(-1, n.y))) / DEG;
  let lon = Math.atan2(n.z, -n.x) / DEG - 180;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

/** Local east/north/up unit vectors at a point on the unit sphere. */
export function localFrame(up) {
  const n = up.clone().normalize();
  const worldUp = Math.abs(n.y) > 0.999 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const east = new Vector3().crossVectors(worldUp, n).normalize();
  const north = new Vector3().crossVectors(n, east).normalize();
  return { up: n, east, north };
}

/** Angle at Earth's centre spanned by a surface distance, capped just short of the antipode. */
export const metersToAngle = (m) => Math.min(m / EARTH_RADIUS_M, Math.PI * 0.999);
