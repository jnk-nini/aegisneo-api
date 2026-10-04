// A whole scenario fits in the URL, so links can be shared without storing
// anything on a server.

const clampNum = (value, lo, hi) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};

export function scenarioToQuery({
  asteroidId,
  diameterM,
  velocityKms,
  angleDeg,
  azimuthDeg,
  composition,
  target,
}) {
  const q = new URLSearchParams();
  if (asteroidId) q.set("a", asteroidId);
  q.set("d", String(+diameterM.toPrecision(4)));
  q.set("v", velocityKms.toFixed(2));
  q.set("ang", String(Math.round(angleDeg)));
  q.set("az", String(Math.round(azimuthDeg)));
  q.set("c", composition);
  if (target) {
    q.set("lat", target.lat.toFixed(3));
    q.set("lon", target.lon.toFixed(3));
  }
  return q.toString();
}

export function queryToScenario(search, compositions) {
  const q = new URLSearchParams(search);
  if (!q.has("d") || !q.has("v")) return null;
  const diameterM = clampNum(q.get("d"), 0.5, 100000);
  const velocityKms = clampNum(q.get("v"), 11, 75);
  if (diameterM == null || velocityKms == null) return null;
  const lat = clampNum(q.get("lat"), -90, 90);
  const lon = clampNum(q.get("lon"), -180, 180);
  const composition = compositions[q.get("c")] ? q.get("c") : "stony";
  const asteroidId = /^[A-Za-z0-9_-]{1,32}$/.test(q.get("a") || "") ? q.get("a") : null;
  return {
    asteroidId,
    diameterM,
    velocityKms,
    angleDeg: clampNum(q.get("ang"), 5, 90) ?? 45,
    azimuthDeg: clampNum(q.get("az"), 0, 360) ?? 90,
    composition,
    target: lat != null && lon != null ? { lat, lon } : null,
  };
}
