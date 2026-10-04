// Geographic helpers. The globe is a unit sphere whose texture is an
// equirectangular map; these conversions match three.js SphereGeometry's UVs
// (u = 0 at longitude −180°, v = 1 at the north pole).

import { Vector3 } from "three";

export const EARTH_RADIUS_KM = 6371;
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

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Local east/north/up unit vectors at a point on the unit sphere. */
export function localFrame(up) {
  const n = up.clone().normalize();
  const worldUp = Math.abs(n.y) > 0.999 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const east = new Vector3().crossVectors(worldUp, n).normalize();
  const north = new Vector3().crossVectors(n, east).normalize();
  return { up: n, east, north };
}

/** Approximate sub-solar point for a date (ignores the equation of time; good to ~1°). */
export function subsolarPoint(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86400000;
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60;
  let lon = -15 * (utcHours - 12);
  if (lon < -180) lon += 360;
  return { lat, lon };
}

export function formatLatLon({ lat, lon }) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}
