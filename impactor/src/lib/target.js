// Choosing a target: works the same whether the point came from a globe tap,
// the 2D map, a city search or a shared link.
import { useSim } from "../store.js";
import { CITIES } from "../data/cities.js";
import { countryAt, loadLandMask, surfaceAt } from "./world.js";
import { distanceKm } from "./geo.js";

export function nearestCity(lat, lon, maxKm = 400) {
  let best = null;
  for (const [name, country, cLat, cLon] of CITIES) {
    const d = distanceKm({ lat, lon }, { lat: cLat, lon: cLon });
    if (d <= maxKm && (!best || d < best.distanceKm)) best = { name, country, distanceKm: d };
  }
  return best;
}

let requestId = 0;

export async function pickTarget(lat, lon, { label = null } = {}) {
  // The running impact is tied to the old target; changing it now would leave
  // the results describing one place and the marker sitting on another.
  const locked = () => ["approach", "impact"].includes(useSim.getState().phase);
  if (locked()) return;
  const id = ++requestId;
  // The mask is painted in the background at startup; usually it's already here.
  await loadLandMask();
  if (id !== requestId || locked()) return;
  const surface = surfaceAt(lat, lon);
  const nearest = nearestCity(lat, lon);
  // A point within a city counts as that city (e.g. when restoring a shared link).
  if (!label && nearest && nearest.distanceKm < 20) label = `${nearest.name}, ${nearest.country}`;
  useSim.getState().setTarget({ lat, lon, surface, label, country: null, nearest });
  const country = await countryAt(lat, lon).catch(() => null);
  if (id !== requestId) return; // a newer pick replaced this one
  const current = useSim.getState().target;
  if (current && current.lat === lat && current.lon === lon) {
    // Country outlines are more precise than the texture mask along coastlines.
    useSim.getState().setTarget({ ...current, country, surface: country ? "land" : current.surface });
  }
}
