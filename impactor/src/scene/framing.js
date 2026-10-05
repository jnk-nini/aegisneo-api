// How close the camera comes for the impact itself, and how big the fireball
// is drawn. Small impacts are tiny next to the Earth, so the camera dives in
// close, and the fireball is never drawn smaller than a fraction of that view;
// where that enlarges it, the HUD says so. No three.js here, so the HUD can use
// it without loading the 3D code.
import { craterVisual } from "./craterShape.js";
import { outermostRadiusM } from "../physics/zones.js";
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { severity } from "./impactVisuals.js";

/** Share of the close-up view the fireball always fills, at least. */
const MIN_FIREBALL_SHARE = 0.16;

/**
 * Radius (m) of ground the close-up frames: the forming crater and its ejecta,
 * or for an airburst the burst itself, high above the ground.
 */
export function closeUpRadiusM(result) {
  const crater = craterVisual(result);
  const fireballM = result?.fireballRadiusM ?? 0;
  const outer = Math.max(outermostRadiusM(result), (result?.crater?.finalDiameterM ?? 0) * 3, 4000);
  if (crater) return Math.max(crater.radiusM * 2.6, fireballM * 1.5, 800);
  const burstM = result?.burstAltitudeM ?? 0;
  return Math.max(fireballM * 3, burstM * 0.9, outer * 0.12, 2500);
}

/**
 * Radius (m) the fireball and plume are drawn at, and how much that enlarges
 * the model's fireball (Eq. 32): `boost` is null when the model gives none
 * (airbursts), so the size is illustrative.
 */
export function fireballDrawn(result) {
  const trueM = result?.fireballRadiusM ?? 0;
  const outer = outermostRadiusM(result);
  const base = Math.max(trueM, Math.min(outer * 0.08, 40000), 300);
  // The largest impacts throw their vapour plume out of the atmosphere, where
  // it spreads over thousands of km within the hour; Eq. 32 only covers the
  // fireball, so the drawn plume grows with the impact's global severity.
  const k = Math.min(1, Math.max(0, (severity(result) - 0.3) / 0.7));
  const global = EARTH_RADIUS_M * 0.1 * k * k * (3 - 2 * k);
  const radiusM = Math.max(base, closeUpRadiusM(result) * MIN_FIREBALL_SHARE, global);
  return { radiusM, boost: trueM > 0 ? radiusM / trueM : null };
}
