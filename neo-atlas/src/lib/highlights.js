import { KM_PER_LD } from "./format.js";

// Ways to pick out part of a sky. Used by the chart (others fade) and the list (others are hidden).
export const HIGHLIGHTS = [
  { key: "hazardous", label: "potentially hazardous", test: (a) => a.is_potentially_hazardous },
  { key: "inside", label: "closer than the Moon", test: (a) => a.miss_distance_km < KM_PER_LD },
  { key: "large", label: "wider than 140 m", test: (a) => a.estimated_diameter_km >= 0.14 },
];

export function highlightTest(key) {
  return HIGHLIGHTS.find((h) => h.key === key)?.test ?? null;
}

export function highlightCounts(asteroids) {
  return Object.fromEntries(HIGHLIGHTS.map((h) => [h.key, asteroids.filter(h.test).length]));
}

// Sort orders for the list.
export const SORTS = [
  {
    key: "date",
    label: "Date",
    compare: (a, b) => a.close_approach_date.localeCompare(b.close_approach_date),
  },
  { key: "closest", label: "Closest", compare: (a, b) => a.miss_distance_km - b.miss_distance_km },
  { key: "largest", label: "Largest", compare: (a, b) => b.estimated_diameter_km - a.estimated_diameter_km },
  {
    key: "fastest",
    label: "Fastest",
    compare: (a, b) => b.relative_velocity_km_h - a.relative_velocity_km_h,
  },
  { key: "name", label: "Name", compare: (a, b) => a.name.localeCompare(b.name) },
];

/** The list's rows: highlight filter, then name search, then sort. */
export function listRows(asteroids, { highlight, query, sort }) {
  const test = highlightTest(highlight);
  const needle = query.trim().toLowerCase();
  const compare = (SORTS.find((s) => s.key === sort) ?? SORTS[0]).compare;
  return asteroids
    .filter((a) => (!test || test(a)) && (!needle || a.name.toLowerCase().includes(needle)))
    .sort(compare);
}
