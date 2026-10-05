// Fun facts: real sizes, speeds and miss distances, said in everyday terms.
// Only the comparison is playful; every number comes from the catalog.

import { KM_PER_LD, toLunarDistances } from "./format.js";

// Familiar things to measure an asteroid against, smallest first.
const SIZES = [
  { m: 1.7, one: "a person", many: "people", how: "tall" },
  { m: 4.5, one: "a car", many: "cars", how: "long" },
  { m: 12, one: "a bus", many: "buses", how: "long" },
  { m: 25, one: "a blue whale", many: "blue whales", how: "long" },
  { m: 105, one: "a football pitch", many: "football pitches", how: "long" },
  { m: 330, one: "the Eiffel Tower", many: "Eiffel Towers", how: "tall" },
  { m: 828, one: "the Burj Khalifa", many: "Burj Khalifas", how: "tall" },
  { m: 8849, one: "Mount Everest", many: "Mount Everests", how: "tall" },
];

const LONDON_NEW_YORK_KM = 5570;

/** "as tall as 3 Eiffel Towers", "about as long as a bus". */
export function sizeComparison(diameterKm) {
  const m = diameterKm * 1000;
  const ref = [...SIZES].reverse().find((s) => s.m <= m) ?? SIZES[0];
  const times = m / ref.m;
  if (times < 1.5) return `about as ${ref.how} as ${ref.one}`;
  return `as ${ref.how} as ${Math.round(times)} ${ref.many}`;
}

/** "London to New York in 6 minutes", the way a plane would fly it. */
export function speedComparison(kmh) {
  const minutes = (LONDON_NEW_YORK_KM / kmh) * 60;
  if (minutes < 1) return `London to New York in ${Math.max(1, Math.round(minutes * 60))} seconds`;
  const rounded = Math.round(minutes);
  return `London to New York in ${rounded} minute${rounded === 1 ? "" : "s"}`;
}

/** "closer than the Moon", "34× farther than the Moon". */
export function distanceComparison(km) {
  const ld = toLunarDistances(km);
  if (ld < 0.95) return "closer than the Moon";
  if (ld < 1.5) return "about as far as the Moon";
  return `${Math.round(ld)}× farther than the Moon`;
}

const biggest = (list) =>
  list.reduce((best, a) => (a.estimated_diameter_km > best.estimated_diameter_km ? a : best));
const fastest = (list) =>
  list.reduce((best, a) => (a.relative_velocity_km_h > best.relative_velocity_km_h ? a : best));
const closest = (list) => list.reduce((best, a) => (a.miss_distance_km < best.miss_distance_km ? a : best));

/**
 * The headline facts of a set of asteroids (a constellation or a sky), or null when empty:
 * the biggest, the fastest and the closest, each with an everyday comparison.
 */
export function skyFacts(asteroids) {
  if (!asteroids?.length) return null;
  const big = biggest(asteroids);
  const fast = fastest(asteroids);
  const near = closest(asteroids);
  return {
    biggest: { asteroid: big, text: sizeComparison(big.estimated_diameter_km) },
    fastest: { asteroid: fast, text: speedComparison(fast.relative_velocity_km_h) },
    closest: { asteroid: near, text: distanceComparison(near.miss_distance_km), inside: near.miss_distance_km < KM_PER_LD },
  };
}

/** One short line for the bottom of a postcard. */
export function cardFactLine(asteroids) {
  const facts = skyFacts(asteroids);
  if (!facts) return "";
  const near = facts.closest.inside ? "one came closer than the Moon!" : `closest passed ${facts.closest.text}`;
  return `Biggest: ${facts.biggest.text} · ${near}`;
}
