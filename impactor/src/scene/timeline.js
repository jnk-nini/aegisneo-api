// Playback timeline shared by the 3D scene and the HUD clock. It lives outside
// React state because it changes every frame.
import { EARTH_RADIUS_M, blastArrivalSeconds } from "../physics/impact.js";
import { outermostRadiusM } from "../physics/zones.js";
import { craterVisual } from "./craterShape.js";

export const APPROACH_SECONDS = 5; // playback seconds at 1× speed
export const AFTERMATH_SECONDS = 10;
export const TOTAL_SECONDS = APPROACH_SECONDS + AFTERMATH_SECONDS;
export const PATH_LENGTH_RE = 2.4; // approach path length, in Earth radii

// Share of the aftermath that crater excavation gets on screen. Real timings
// span seconds (excavation) to hours (the blast reaching its outer zones), so
// when excavation would otherwise flash by, the aftermath clock runs on a log
// scale: slow at first, then faster and faster. The HUD still shows real time.
const EXCAVATION_SHARE = 0.2;

export const clock = { t: 0 };

export function phaseAt(t) {
  if (t < APPROACH_SECONDS) return "approach";
  if (t < TOTAL_SECONDS) return "impact";
  return "done";
}

/** Real seconds the whole aftermath represents: until the blast passes the outermost zone. */
export function aftermathRealSeconds(run) {
  const outer = Math.max(outermostRadiusM(run.result), 1000);
  return blastArrivalSeconds(outer) * 1.05;
}

// Fraction of playback by which `e` of `S` real seconds have passed, for a log
// map with time constant s0 (s0 → ∞ is linear).
const logShare = (e, S, s0) => Math.log1p(e / s0) / Math.log1p(S / s0);

/** Time constant of the aftermath's log clock, or Infinity for a linear clock. */
export function clockScale(excavationS, aftermathS) {
  if (!(excavationS > 0) || excavationS / aftermathS >= EXCAVATION_SHARE) return Infinity;
  // logShare falls monotonically from 1 (s0 → 0) to e/S (s0 → ∞): bisect on log s0.
  let lo = Math.log(aftermathS * 1e-12);
  let hi = Math.log(aftermathS * 1e6);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (logShare(excavationS, aftermathS, Math.exp(mid)) > EXCAVATION_SHARE) lo = mid;
    else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}

const cache = new WeakMap();
function aftermathClock(run) {
  let c = cache.get(run);
  if (!c) {
    const S = aftermathRealSeconds(run);
    const excavation = craterVisual(run.result)?.excavationSeconds ?? 0;
    c = { S, s0: clockScale(excavation, S) };
    cache.set(run, c);
  }
  return c;
}

/** True when the aftermath clock speeds up as it plays. */
export const isTimeLapse = (run) => Number.isFinite(aftermathClock(run).s0);

/** Real (simulated) seconds represented by the playback clock. */
export function simulatedSeconds(t, run) {
  const { velocityKms } = run.params;
  const pathM = PATH_LENGTH_RE * EARTH_RADIUS_M;
  const approachReal = pathM / (velocityKms * 1000);
  if (t < APPROACH_SECONDS) {
    return -(1 - t / APPROACH_SECONDS) * approachReal;
  }
  const u = (t - APPROACH_SECONDS) / AFTERMATH_SECONDS;
  const { S, s0 } = aftermathClock(run);
  if (!Number.isFinite(s0)) return u * S;
  return s0 * Math.expm1(u * Math.log1p(S / s0));
}

/** Playback time at which `seconds` of real time after impact have passed. */
export function playbackAt(seconds, run) {
  const { S, s0 } = aftermathClock(run);
  const s = Math.max(0, seconds);
  const u = Number.isFinite(s0) ? logShare(s, S, s0) : s / S;
  return APPROACH_SECONDS + u * AFTERMATH_SECONDS;
}

/** Radius (m) of the air-blast front at playback time t, moving at sound speed (Eq. 64). */
export function shockRadiusM(t, run) {
  const s = simulatedSeconds(t, run);
  return s <= 0 ? 0 : s * 330;
}
