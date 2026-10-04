// Turns an asteroid into a position on the planisphere. Every coordinate is
// real data: nothing is random or hashed.
//
//   angle    — when it passed: day of the year (year view) or year (date view)
//   distance — how close it came, on a log scale of lunar distances
//   size     — estimated diameter, on a log scale
//
// Coordinates are in the dial's SVG units: the dial spans -110…110.

import { dayIndex, MONTH_STARTS, MONTHS } from "./calendar.js";
import { toLunarDistances } from "./format.js";

export const FIRST_YEAR = 1910;
export const LAST_YEAR = 2024;
const YEAR_SPAN = LAST_YEAR - FIRST_YEAR + 1;

// Miss distances in the catalog run from about 0.02 to 195 lunar distances.
const LD_MIN = 0.02;
const LD_MAX = 200;
const R_MIN = 10;
const R_MAX = 82;
const LOG_MIN = Math.log10(LD_MIN);
const LOG_SPAN = Math.log10(LD_MAX) - LOG_MIN;

export function radiusForKm(km) {
  const ld = Math.min(Math.max(toLunarDistances(km), LD_MIN), LD_MAX);
  return R_MIN + ((Math.log10(ld) - LOG_MIN) / LOG_SPAN) * (R_MAX - R_MIN);
}

/** Guide rings, labelled in lunar distances (1 LD = the Moon's distance). */
export const DISTANCE_RINGS = [
  { ld: 0.1, label: "0.1 LD" },
  { ld: 1, label: "Moon · 1 LD" },
  { ld: 10, label: "10 LD" },
  { ld: 100, label: "100 LD" },
].map((ring) => ({ ...ring, r: R_MIN + ((Math.log10(ring.ld) - LOG_MIN) / LOG_SPAN) * (R_MAX - R_MIN) }));

/** Star radius in dial units for a diameter in km (about 0.7 for 1 m up to 3.3 for 60 km). */
export function starSize(diameterKm) {
  const meters = Math.max(diameterKm * 1000, 1);
  return 0.7 + Math.log10(meters) * 0.55;
}

/** Fraction of the way around the dial (0 at the top, clockwise) for an asteroid in a given view. */
export function angleFraction(asteroid, mode) {
  if (mode === "date") {
    const year = Number(asteroid.close_approach_date.slice(0, 4));
    return (year - FIRST_YEAR + 0.5) / YEAR_SPAN;
  }
  const index = dayIndex(asteroid.close_approach_date);
  return index == null ? 0 : (index + 0.5) / 366;
}

export const fractionToAngle = (f) => f * Math.PI * 2 - Math.PI / 2;

export function placeStar(asteroid, mode) {
  const angle = fractionToAngle(angleFraction(asteroid, mode));
  const r = radiusForKm(asteroid.miss_distance_km);
  return {
    id: asteroid.neo_reference_id,
    data: asteroid,
    x: r * Math.cos(angle),
    y: r * Math.sin(angle),
    angle,
    size: starSize(asteroid.estimated_diameter_km),
    hazardous: asteroid.is_potentially_hazardous,
  };
}

/** The labelled band around the dial: months for a year, decades for a date across all years. */
export function dialSegments(mode) {
  if (mode === "date") {
    const segments = [];
    for (let start = FIRST_YEAR; start <= LAST_YEAR; start += 10) {
      const end = Math.min(start + 10, LAST_YEAR + 1);
      segments.push({
        label: `${start}s`,
        from: (start - FIRST_YEAR) / YEAR_SPAN,
        to: (end - FIRST_YEAR) / YEAR_SPAN,
      });
    }
    return { segments, ticks: YEAR_SPAN };
  }
  const segments = MONTHS.map((label, i) => ({
    label,
    from: MONTH_STARTS[i] / 366,
    to: (i === 11 ? 366 : MONTH_STARTS[i + 1]) / 366,
  }));
  return { segments, ticks: 366 };
}
