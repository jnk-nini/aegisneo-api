// Geographic helpers in plain math, so the 2D map and the panels can use them
// without loading three.js. The 3D conversions live in scene/sphereMath.js.

export const EARTH_RADIUS_KM = 6371;
export const KM_PER_LD = 384400; // one lunar distance
const DEG = Math.PI / 180;

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
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
