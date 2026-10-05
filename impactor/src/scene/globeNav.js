// Camera state for exploring the globe, kept as "what you look at" rather than
// "where the camera is": a point on Earth, how far away the camera is, how far
// it tilts towards the horizon and which way it faces. Dragging moves that
// point across the surface, so the ground follows the finger at any zoom and
// you can roam the whole planet instead of circling one spot.
import { Matrix4, Vector3 } from "three";
import { localFrame } from "./sphereMath.js";

export const MIN_DIST = 0.00005; // Earth radii from the look-at point (~320 m)
export const MAX_DIST = 8;
const MAX_LAT_SIN = Math.sin((89.5 * Math.PI) / 180);
const _m = new Matrix4();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();

export const newNav = () => ({ n: new Vector3(0, 0, 1), r: 1, dist: 2.3, tilt: 0, heading: 0 });

export function copyNav(from, to = newNav()) {
  to.n.copy(from.n);
  to.r = from.r;
  to.dist = from.dist;
  to.tilt = from.tilt;
  to.heading = from.heading;
  return to;
}

/** Steepest tilt allowed at a distance: free near the ground, none from far away. */
export function maxTilt(dist) {
  const k = Math.min(1, Math.max(0, Math.log(dist / 0.05) / Math.log(1.6 / 0.05)));
  return ((78 * Math.PI) / 180) * (1 - k * k * (3 - 2 * k));
}

/** North-facing horizontal direction of `heading` at a surface point, plus the frame. */
function headingFrame(n, heading) {
  const { east, north } = localFrame(n);
  const forward = _c.copy(north).multiplyScalar(Math.cos(heading)).addScaledVector(east, Math.sin(heading));
  const right = _d.copy(east).multiplyScalar(Math.cos(heading)).addScaledVector(north, -Math.sin(heading));
  return { forward, right };
}

/** Writes the camera's position and orientation for a nav state. */
export function applyNav(nav, camera) {
  const { forward, right } = headingFrame(nav.n, nav.heading);
  const back = _a
    .copy(nav.n)
    .multiplyScalar(Math.cos(nav.tilt))
    .addScaledVector(forward, -Math.sin(nav.tilt));
  camera.position.copy(nav.n).multiplyScalar(nav.r).addScaledVector(back, nav.dist);
  const up = _b.crossVectors(back, right);
  _m.makeBasis(right, up, back);
  camera.quaternion.setFromRotationMatrix(_m);
  camera.up.copy(nav.n);
  (camera.userData.lookAt ??= new Vector3()).copy(nav.n).multiplyScalar(nav.r);
}

/**
 * Nav state that reproduces a camera looking at `target` (any pose the
 * cinematic or a flight leaves behind), so taking over control never jumps.
 * A target near Earth's centre means "the whole globe": the look-at point
 * becomes the surface point straight below the camera.
 */
export function navFromCamera(camera, target, out = newNav()) {
  const pos = camera.position;
  if (target.length() < 0.5) {
    out.n.copy(pos).normalize();
    out.r = 1;
    out.dist = Math.max(pos.length() - 1, MIN_DIST);
    out.tilt = 0;
  } else {
    out.r = target.length();
    out.n.copy(target).divideScalar(out.r);
    const off = _a.subVectors(pos, target);
    out.dist = Math.max(off.length(), MIN_DIST);
    off.divideScalar(off.length());
    out.tilt = Math.acos(Math.min(1, Math.max(-1, off.dot(out.n))));
  }
  // Heading from the camera's own screen-up, which is the forward direction
  // tilted up; projecting it onto the ground recovers which way it faces.
  const screenUp = _b.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const viewDir = _c.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const facing = out.tilt > 0.02 ? viewDir : screenUp;
  const flat = facing.addScaledVector(out.n, -facing.dot(out.n));
  const { east, north } = localFrame(out.n);
  out.heading = flat.lengthSq() > 1e-12 ? Math.atan2(flat.dot(east), flat.dot(north)) : 0;
  return out;
}

/**
 * Moves the look-at point across the surface by `along` and `across` radians
 * (forward and right as seen on screen), carrying the facing direction with it
 * so the view doesn't twist. Stays just short of the poles.
 */
export function moveNav(nav, along, across) {
  const angle = Math.hypot(along, across);
  if (angle < 1e-12) return nav;
  const { forward, right } = headingFrame(nav.n, nav.heading);
  const dir = _a
    .copy(forward)
    .multiplyScalar(along / angle)
    .addScaledVector(right, across / angle);
  const axis = _b.crossVectors(nav.n, dir).normalize();
  const carried = forward.clone().applyAxisAngle(axis, angle);
  nav.n.applyAxisAngle(axis, angle).normalize();
  if (Math.abs(nav.n.y) > MAX_LAT_SIN) {
    const flat = Math.hypot(nav.n.x, nav.n.z) || 1;
    const k = Math.sqrt(1 - MAX_LAT_SIN * MAX_LAT_SIN) / flat;
    nav.n.set(nav.n.x * k, Math.sign(nav.n.y) * MAX_LAT_SIN, nav.n.z * k);
  }
  const { east, north } = localFrame(nav.n);
  carried.addScaledVector(nav.n, -carried.dot(nav.n));
  if (carried.lengthSq() > 1e-12) nav.heading = Math.atan2(carried.dot(east), carried.dot(north));
  return nav;
}

/**
 * Slides the look-at point towards surface direction `point` by `share` of the
 * way (negative slides away), used to zoom towards the pointer.
 */
export function moveTowards(nav, point, share) {
  const angle = Math.acos(Math.min(1, Math.max(-1, nav.n.dot(point))));
  if (angle < 1e-9 || !share) return nav;
  const { forward, right } = headingFrame(nav.n, nav.heading);
  const dir = _a.copy(point).addScaledVector(nav.n, -nav.n.dot(point)).normalize();
  const step = Math.max(-angle, Math.min(angle, angle * share));
  return moveNav(nav, step * dir.dot(forward), step * dir.dot(right));
}

/** Ground angle (radians) covered by one screen pixel at the look-at point. */
export function radiansPerPixel(nav, camera, heightPx) {
  const fov = (camera.fov * Math.PI) / 180;
  return (2 * nav.dist * Math.tan(fov / 2)) / Math.max(heightPx, 1) / nav.r;
}

/**
 * Camera distance from the surface at which the whole globe fits the view,
 * when only `heightShare` of the screen's height is free (a bottom sheet
 * covers the rest on phones). Never closer than the desktop default.
 */
export function fitGlobeDistance(camera, heightShare = 1) {
  const halfV = (camera.fov * Math.PI) / 360;
  const half = Math.min(halfV * heightShare, Math.atan(Math.tan(halfV) * camera.aspect)) * 0.86;
  return Math.min(MAX_DIST, Math.max(2.3, 1 / Math.sin(half) - 1));
}

const wrap = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/**
 * Interpolates two nav states for a flight. Distance follows a log blend that
 * rises over long hops, so flying across the planet lifts off, travels high
 * and comes back down instead of skimming the ground.
 */
export function blendNav(from, to, t, out) {
  const dot = Math.min(1, Math.max(-1, from.n.dot(to.n)));
  const sep = Math.acos(dot);
  if (sep < 1e-6) out.n.copy(to.n);
  else {
    const s = Math.sin(sep);
    out.n
      .copy(from.n)
      .multiplyScalar(Math.sin((1 - t) * sep) / s)
      .addScaledVector(to.n, Math.sin(t * sep) / s)
      .normalize();
  }
  out.r = from.r + (to.r - from.r) * t;
  const base = Math.exp(Math.log(from.dist) + (Math.log(to.dist) - Math.log(from.dist)) * t);
  const lift = Math.min(2.4, sep * 1.1);
  out.dist = Math.max(base, lift > base ? base + (lift - base) * Math.sin(Math.PI * t) : base);
  out.tilt = from.tilt + (to.tilt - from.tilt) * t;
  out.heading = from.heading + wrap(to.heading - from.heading) * t;
  return out;
}
