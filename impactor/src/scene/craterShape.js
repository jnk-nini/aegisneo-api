// Shape of the crater drawn at the impact site. Sizes come from the model
// (Eqs. 21–28: transient and final diameter, depth); the profile between them
// follows the classic forms: simple craters are bowls with a raised rim,
// complex ones have a flat floor, terraced walls and a central peak (a peak
// ring when very large). Outside the rim the ground falls off like the ejecta
// blanket (∝ r⁻³). CraterPatch.jsx evaluates the same formulas in GLSL.
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { ejectaReachM, excavationSeconds } from "./impactVisuals.js";

// Real large craters are very flat (a 900 km crater is ~3 km deep). Depth is
// scaled up until it reaches this depth-to-diameter ratio, and the view says so.
export const TARGET_DEPTH_RATIO = 0.1;
const NICE_FACTORS = [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000];
const PEAK_RING_DIAMETER_M = 100000; // Earth's peak-ring craters start around here
const MAX_PATCH_ANGLE = (30 * Math.PI) / 180;

/** Smallest "nice" factor ≥ 1 that is closest (in log terms) to `x`. */
export function niceFactor(x) {
  if (!(x > 1)) return 1;
  let best = 1;
  for (const f of NICE_FACTORS) {
    if (Math.abs(Math.log(f / x)) < Math.abs(Math.log(best / x))) best = f;
  }
  return best;
}

/**
 * What to draw for a result, or null for no crater (airbursts). Lengths in
 * metres, true scale; `exaggeration` is applied to all heights when drawn.
 */
export function craterVisual(result) {
  if (!result || result.entry?.regime === "airburst") return null;
  const water = result.inputs?.surface === "water" && result.waterCrater;
  const source = water ? result.waterCrater : result.crater;
  if (!source?.transientDiameterM) return null;

  const transientM = source.transientDiameterM;
  const melt = source.type === "melt-province" || !source.finalDiameterM;
  const finalM = melt ? transientM : source.finalDiameterM;
  const radiusM = finalM / 2;
  let depthM;
  let rimM;
  if (melt) {
    depthM = transientM * 0.004; // a shallow sea of melt, not a crater
    rimM = depthM * 0.2;
  } else if (source.type === "simple") {
    depthM = source.depthM;
    rimM = (0.07 * transientM ** 4) / finalM ** 3; // Eq. 48
  } else {
    depthM = source.depthM;
    rimM = depthM * 0.15;
  }
  const complex = !melt && source.type === "complex";
  const kind = water ? "water" : melt ? "melt" : complex ? "complex" : "simple";

  const exaggeration = niceFactor((TARGET_DEPTH_RATIO * finalM) / Math.max(depthM, 1e-6));
  const reach = ejectaReachM(transientM, 1); // where the blanket thins to 1 m
  const maxEdge = (MAX_PATCH_ANGLE * EARTH_RADIUS_M) / radiusM;
  const edgeFrac = Math.max(1.3, Math.min(Math.max(3, reach / radiusM), 4, maxEdge));

  return {
    kind,
    radiusM,
    depthM,
    rimM,
    floorFrac: complex ? 0.5 : 0,
    peakM: complex ? depthM * 0.3 : 0,
    peakRing: complex && finalM >= PEAK_RING_DIAMETER_M,
    transientRadiusM: transientM / 2,
    transientDepthM: transientM / (2 * Math.SQRT2), // Eq. 25
    exaggeration,
    edgeFrac,
    patchRadiusM: radiusM * edgeFrac,
    excavationSeconds: excavationSeconds(transientM),
  };
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Final ground height (m, true scale) at `x` crater radii from the centre.
 * Mirrors `craterFinal()` in CraterPatch.jsx.
 */
export function finalHeight(x, v) {
  const floorH = v.rimM - v.depthM;
  if (x >= 1) {
    // Rim falls off like the ejecta blanket, reaching 0 at the patch edge.
    const e = v.edgeFrac ** -3;
    return Math.max(0, (v.rimM * (x ** -3 - e)) / (1 - e));
  }
  if (v.kind === "simple" || v.kind === "water") return floorH + v.depthM * x * x;
  // Complex / melt: flat floor, terraced wall up to the rim.
  const t = Math.min(1, Math.max(0, (x - v.floorFrac) / (1 - v.floorFrac)));
  const wall = t * t * (3 - 2 * t) + 0.04 * Math.sin(6 * Math.PI * t) * 4 * t * (1 - t);
  let h = floorH + v.depthM * wall;
  if (v.peakM > 0) {
    h += v.peakRing
      ? v.peakM * Math.exp(-(((x - 0.28) / 0.07) ** 2))
      : v.peakM * Math.exp(-((x / 0.12) ** 2));
  }
  return h;
}

/**
 * Transient cavity height (m, true scale) at `x` crater radii while it is
 * excavated (`grow` 0..1). A parabolic bowl that widens and deepens.
 * Mirrors `craterTransient()` in CraterPatch.jsx.
 */
export function transientHeight(x, v, grow) {
  if (grow <= 0) return 0;
  const r = (v.transientRadiusM / v.radiusM) * Math.cbrt(grow); // in final radii
  const d = v.transientDepthM * grow;
  const lip = v.transientDepthM * 0.12 * grow;
  if (x < r) return -d + (d + lip) * (x / r) ** 2;
  return lip * (r / x) ** 3 * (1 - smoothstep(v.edgeFrac * 0.8, v.edgeFrac, x));
}

/**
 * Real seconds after impact over which the transient cavity settles into the
 * final crater: quickly for simple craters, longer for complex ones whose
 * walls slump and centre rebounds, longest for water that fills back in.
 */
export function collapseWindow(v) {
  const E = Math.max(v.excavationSeconds, 0.05);
  return {
    simple: [0.85 * E, 1.5 * E],
    complex: [E, 2.5 * E],
    melt: [E, 2.5 * E],
    water: [E, 2.2 * E],
  }[v.kind];
}
