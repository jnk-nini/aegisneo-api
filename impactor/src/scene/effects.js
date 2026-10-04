// Small shared assets for the impact effects.
import { CanvasTexture, IcosahedronGeometry, SRGBColorSpace, Vector3 } from "three";
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { latLonToVector, localFrame } from "../lib/geo.js";
import { outermostRadiusM } from "../physics/zones.js";
import { PATH_LENGTH_RE } from "./timeline.js";

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
  return {
    center,
    frame,
    incoming,
    horizontal,
    start,
    end,
    burstRE,
    viewRadiusRE,
    airburst: run.result.entry.regime === "airburst",
  };
}

/** Camera pose that frames `viewRadiusRE` around a surface point, tilted for depth. */
export function focusPose(center, frame, viewRadiusRE, camera, horizontal = frame.north) {
  const vfov = (camera.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const distance = Math.min(Math.max(viewRadiusRE / Math.tan(Math.min(vfov, hfov) / 2), 0.0005), 3.6);
  const tilt = (38 * Math.PI) / 180;
  const side = horizontal
    .clone()
    .multiplyScalar(-0.55)
    .addScaledVector(frame.up.clone().cross(horizontal), 0.83)
    .normalize();
  const offset = frame.up.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt));
  return {
    position: center.clone().addScaledVector(offset, distance),
    target: center.clone(),
    up: frame.up.clone(),
  };
}
