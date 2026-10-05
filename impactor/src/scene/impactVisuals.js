// Numbers that drive the impact visuals: how violent an impact is overall,
// how long its crater takes to form, how far its ejecta reaches. They are
// derived from the simulation result so the picture matches the results panel.
import { EARTH_RADIUS_M, JOULES_PER_MEGATON } from "../physics/impact.js";
import { GLOBAL_RANGE_M } from "../physics/zones.js";

export const G = 9.81; // m/s²
export const OCEAN_DEPTH_M = 3700; // the model's default water depth

/**
 * Global severity, 0..1, from the impact energy on a log scale: 0 up to 1e5 Mt
 * (a ~1.5 km rock), 1 from 1e8 Mt (a ~15 km rock). Drives the planet-wide
 * effects (dust veil, re-entering ejecta, the pull-back to the whole globe).
 */
export function severity(result) {
  const megatons = (result?.blastEnergyJ ?? result?.energy?.joules ?? 0) / JOULES_PER_MEGATON;
  if (!(megatons > 0)) return 0;
  return Math.min(1, Math.max(0, (Math.log10(megatons) - 5) / 3));
}

/** Seconds to excavate a transient crater of diameter `transientM` (≈ 0.8·√(D/g)). */
export function excavationSeconds(transientM) {
  return transientM > 0 ? 0.8 * Math.sqrt(transientM / G) : 0;
}

/**
 * Ejecta blanket thickness (m) at range `rangeM` from the centre, for a
 * transient crater of diameter `transientM`: t = D⁴ / (112 r³) (McGetchin et
 * al. 1973, as used by Collins et al. 2005). Only meaningful outside the rim.
 */
export function ejectaThicknessM(rangeM, transientM) {
  if (!(rangeM > 0) || !(transientM > 0)) return 0;
  return transientM ** 4 / (112 * rangeM ** 3);
}

/** Range (m) where the ejecta blanket thins to `thicknessM`. */
export function ejectaReachM(transientM, thicknessM = 0.01) {
  if (!(transientM > 0)) return 0;
  return Math.cbrt(transientM ** 4 / (112 * thicknessM));
}

/** Launch speed (m/s) that carries ballistic ejecta `rangeM` on a 45° flat-Earth arc. */
export const launchSpeedFor = (rangeM) => Math.sqrt(Math.max(0, rangeM) * G);

/** Flight time (s) of a 45° ballistic arc covering `rangeM`. */
export const flightSeconds = (rangeM) => Math.SQRT2 * Math.sqrt(Math.max(0, rangeM) / G);

/**
 * Seconds after impact when ejecta thrown above the atmosphere falls back at
 * angular distance `theta` (radians) from the impact: roughly 10 minutes
 * nearby to an hour on the far side (sub-orbital flight; illustrative).
 */
export const reentrySeconds = (theta) => 600 + 3000 * (theta / Math.PI);

/** Deep-water wave speed √(g·h), m/s. */
export const tsunamiSpeed = (depthM = OCEAN_DEPTH_M) => Math.sqrt(G * depthM);

/**
 * Radii (m) of the damage painted on the ground, taken from the model's
 * thermal, blast and wind ranges. Heat can't reach past the fireball's
 * horizon, so the thermal ones stop at a quarter of the way around Earth.
 */
export function damageRadii(result) {
  const pick = (list, key) => list?.find((x) => x.key === key)?.radiusM ?? 0;
  const capped = (m) => Math.min(m, GLOBAL_RANGE_M);
  const clothing = pick(result?.thermal, "clothing");
  const burns3 = pick(result?.thermal, "burns3");
  return {
    scorch: capped(clothing || burns3 * 0.6),
    fires: capped(burns3),
    flattened: pick(result?.wind, "trees90"),
    lightsOut: pick(result?.blast, "wood"),
    wrecked: pick(result?.blast, "masonry"),
  };
}

/**
 * Farthest range (m) the debris is drawn reaching: around the crater for small
 * impacts, up to most of the way round the planet for the largest.
 */
export function debrisReachM(patchRadiusM, severity) {
  return Math.max(patchRadiusM * 1.6, severity ** 1.5 * Math.PI * 0.9 * EARTH_RADIUS_M);
}

/** Flight time (s) and apex height (m) of a 45° arc covering `rangeM`, capped at half an Earth radius. */
export function arc(rangeM) {
  return {
    seconds: Math.SQRT2 * Math.sqrt(rangeM / G),
    apexM: Math.min(rangeM / 4, EARTH_RADIUS_M * 0.5),
  };
}
