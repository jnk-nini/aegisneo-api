import { EARTH_RADIUS_M } from "../physics/impact.js";

/** Angle at Earth's centre spanned by a surface distance, capped just short of the antipode. */
export const metersToAngle = (m) => Math.min(m / EARTH_RADIUS_M, Math.PI * 0.999);
