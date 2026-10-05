// Which of the major cities in data/cities.js a run's damage zones reach.
import { CITIES } from "../data/cities.js";
import { distanceKm } from "./geo.js";

/**
 * Cities inside the outermost zone, each with the strongest zone that reaches
 * it. A small event lists the closest cities; when more than `limit` are hit
 * (a global-scale event), the closest would all sit inside the crater, so the
 * list shows the most populous ones instead. `total` counts every city hit.
 */
export function citiesInRange(target, zones, limit = 8) {
  if (!zones.length) return { list: [], total: 0 };
  const outerKm = zones[0].radiusM / 1000;
  const hits = [];
  for (const [name, country, lat, lon, pop] of CITIES) {
    const d = distanceKm(target, { lat, lon });
    if (d > outerKm) continue;
    // Strongest (smallest) zone that still reaches the city.
    const zone = [...zones].reverse().find((z) => z.radiusM / 1000 >= d);
    hits.push({ name, country, pop, distance: d, zone });
  }
  const crowded = hits.length > limit;
  const list = hits
    .sort(crowded ? (a, b) => b.pop - a.pop : (a, b) => a.distance - b.distance)
    .slice(0, limit);
  return { list, total: hits.length, byPopulation: crowded };
}
