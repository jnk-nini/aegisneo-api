// Playback timeline shared by the 3D scene and the HUD clock. It lives outside
// React state because it changes every frame.
import { EARTH_RADIUS_M, blastArrivalSeconds } from "../physics/impact.js";
import { outermostRadiusM } from "../physics/zones.js";

export const APPROACH_SECONDS = 5; // playback seconds at 1× speed
export const AFTERMATH_SECONDS = 6;
export const TOTAL_SECONDS = APPROACH_SECONDS + AFTERMATH_SECONDS;
export const PATH_LENGTH_RE = 2.4; // approach path length, in Earth radii

export const clock = { t: 0 };

export function phaseAt(t) {
  if (t < APPROACH_SECONDS) return "approach";
  if (t < TOTAL_SECONDS) return "impact";
  return "done";
}

/** Real (simulated) seconds represented by the playback clock. */
export function simulatedSeconds(t, run) {
  const { velocityKms } = run.params;
  const pathM = PATH_LENGTH_RE * EARTH_RADIUS_M;
  const approachReal = pathM / (velocityKms * 1000);
  if (t < APPROACH_SECONDS) {
    return -(1 - t / APPROACH_SECONDS) * approachReal;
  }
  const outer = Math.max(outermostRadiusM(run.result), 1000);
  const aftermathReal = blastArrivalSeconds(outer) * 1.05;
  return ((t - APPROACH_SECONDS) / AFTERMATH_SECONDS) * aftermathReal;
}

/** Radius (m) of the air-blast front at playback time t, moving at sound speed (Eq. 64). */
export function shockRadiusM(t, run) {
  const s = simulatedSeconds(t, run);
  return s <= 0 ? 0 : s * 330;
}
