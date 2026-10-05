// Small shared assets for the impact effects.
import { CanvasTexture, IcosahedronGeometry, SRGBColorSpace, Vector3 } from "three";
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { latLonToVector, localFrame } from "./sphereMath.js";
import { outermostRadiusM } from "../physics/zones.js";
import { PATH_LENGTH_RE } from "./timeline.js";
import { closeUpRadiusM } from "./framing.js";

let glow = null;
/** Soft radial glow used for the flash, fireball and entry glow. */
export function glowTexture() {
  if (glow) return glow;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,245,1)");
  g.addColorStop(0.18, "rgba(255,236,170,0.95)");
  g.addColorStop(0.42, "rgba(255,150,60,0.55)");
  g.addColorStop(0.7, "rgba(230,70,20,0.18)");
  g.addColorStop(1, "rgba(200,40,10,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glow = new CanvasTexture(canvas);
  glow.colorSpace = SRGBColorSpace;
  return glow;
}

/** Lumpy rock: an icosphere pushed in and out by a few random waves. */
export function rockGeometry(seed = 1) {
  const geometry = new IcosahedronGeometry(1, 4);
  const pos = geometry.attributes.position;
  const v = new Vector3();
  let s = seed * 9301 + 49297;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const waves = Array.from({ length: 7 }, () => ({
    dir: new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
    freq: 1.5 + rand() * 3.5,
    amp: 0.04 + rand() * 0.1,
    phase: rand() * Math.PI * 2,
  }));
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1;
    for (const w of waves) r += w.amp * Math.sin(v.dot(w.dir) * w.freq * Math.PI + w.phase);
    v.multiplyScalar(r * (0.85 + 0.15 * Math.abs(v.y)));
    pos.setXYZ(i, v.x, v.y * 0.82, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Geometry of a run: where it hits, which way it comes from, how far to zoom. */
export function runGeometry(run) {
  const { lat, lon } = run.target;
  const center = latLonToVector(lat, lon).normalize();
  const frame = localFrame(center);
  const theta = (run.params.angleDeg * Math.PI) / 180;
  const psi = (run.params.azimuthDeg * Math.PI) / 180;
  const horizontal = frame.north
    .clone()
    .multiplyScalar(Math.cos(psi))
    .addScaledVector(frame.east, Math.sin(psi));
  const incoming = horizontal
    .clone()
    .multiplyScalar(Math.cos(theta))
    .addScaledVector(frame.up, Math.sin(theta))
    .normalize();
  const start = center.clone().addScaledVector(incoming, PATH_LENGTH_RE);
  const burstRE = (run.result.burstAltitudeM || 0) / EARTH_RADIUS_M;
  const end = center.clone().addScaledVector(incoming, burstRE / Math.max(Math.sin(theta), 0.05));
  const outer = Math.max(outermostRadiusM(run.result), (run.result.crater?.finalDiameterM ?? 0) * 3, 4000);
  const viewRadiusRE = (outer * 1.3) / EARTH_RADIUS_M;
  // Close-up right after impact: the crater and its ejecta, or for an airburst
  // the burst itself, high above the ground, so whatever happens fills the view.
  const airburst = run.result.entry.regime === "airburst";
  const closeM = closeUpRadiusM(run.result) / EARTH_RADIUS_M;
  const closeRadiusRE = airburst ? closeM : Math.min(closeM, viewRadiusRE);
  const closeTarget = airburst ? end.clone() : center.clone();
  return {
    center,
    frame,
    incoming,
    horizontal,
    start,
    end,
    burstRE,
    viewRadiusRE,
    closeRadiusRE,
    closeTarget,
    airburst,
  };
}

export const newPose = () => ({ position: new Vector3(), target: new Vector3(), up: new Vector3() });

// Scratch vectors so the per-frame camera maths allocates nothing.
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

/**
 * Camera pose that frames `viewRadiusRE` around a surface point, tilted
 * `tiltDeg` from straight down for depth. Writes into `out` (reuse one per
 * caller to avoid per-frame garbage).
 */
export function focusPose(
  center,
  frame,
  viewRadiusRE,
  camera,
  horizontal = frame.north,
  out = newPose(),
  tiltDeg = 38,
) {
  const vfov = (camera.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const distance = Math.min(Math.max(viewRadiusRE / Math.tan(Math.min(vfov, hfov) / 2), 0.0002), 3.6);
  const tilt = (tiltDeg * Math.PI) / 180;
  const side = _a
    .crossVectors(frame.up, horizontal)
    .multiplyScalar(0.83)
    .addScaledVector(horizontal, -0.55)
    .normalize();
  const offset = _b.copy(frame.up).multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt));
  out.position.copy(center).addScaledVector(offset, distance);
  out.target.copy(center);
  out.up.copy(frame.up);
  return out;
}

/**
 * Spherical interpolation between unit vectors `a` and `b`, into `out`. When
 * they point (nearly) opposite ways there is no unique shortest arc, so it
 * turns about an arbitrary perpendicular axis instead of passing through zero.
 */
export function slerpUnit(a, b, t, out) {
  const dot = Math.min(1, Math.max(-1, a.dot(b)));
  if (dot > 0.9995) return out.lerpVectors(a, b, t).normalize();
  if (dot < -0.9995) {
    const perp = _c
      .set(Math.abs(a.x) < 0.9 ? 1 : 0, Math.abs(a.x) < 0.9 ? 0 : 1, 0)
      .cross(a)
      .normalize();
    const angle = Math.PI * t;
    return out.copy(a).multiplyScalar(Math.cos(angle)).addScaledVector(perp, Math.sin(angle));
  }
  const angle = Math.acos(dot);
  const s = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / s;
  const wb = Math.sin(t * angle) / s;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);
}

export const MIN_ALTITUDE = 0.00004; // Earth radii (~250 m)

/**
 * Interpolates between two camera poses by swinging around the look-at point
 * (slerp direction, log-lerp distance). The camera's height above the surface
 * never drops below a log-blend of the two end heights, so a flight to the far
 * side of the globe arcs over it instead of skimming (or cutting through) Earth.
 * `out` must not be `from` or `to`.
 */
export function blendPose(from, to, t, out) {
  out.target.lerpVectors(from.target, to.target, t);
  const fromOffset = _a.subVectors(from.position, from.target);
  const toOffset = _b.subVectors(to.position, to.target);
  const fromDist = fromOffset.length();
  const toDist = toOffset.length();
  const logLerp = (x, y) => Math.exp(Math.log(x) + (Math.log(y) - Math.log(x)) * t);
  slerpUnit(fromOffset.divideScalar(fromDist), toOffset.divideScalar(toDist), t, out.position);
  out.position.multiplyScalar(logLerp(fromDist, toDist)).add(out.target);
  const floor =
    1 +
    logLerp(
      Math.max(from.position.length() - 1, MIN_ALTITUDE),
      Math.max(to.position.length() - 1, MIN_ALTITUDE),
    );
  if (out.position.length() < floor) out.position.setLength(floor);
  slerpUnit(from.up, to.up, t, out.up);
  return out;
}
