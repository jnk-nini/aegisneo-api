// Damage zones are painted by the Earth shader itself instead of being meshes
// laid over the globe. The globe is built from flat triangles whose middles dip
// up to ~1.2 km below the true sphere, so anything floating just above it pokes
// in and out in a regular grid. Per pixel, the shader measures the distance to
// the impact site and colours fills and outlines from the uniforms below.
import { Color, SRGBColorSpace, Vector3, Vector4 } from "three";
import { localFrame } from "../lib/geo.js";
import { metersToAngle } from "./sphereMath.js";

export const MAX_ZONES = 8;

export function createZoneUniforms() {
  return {
    zoneCenter: { value: new Vector3(0, 1, 0) },
    zoneEast: { value: new Vector3(1, 0, 0) },
    zoneNorth: { value: new Vector3(0, 0, 1) },
    zoneCount: { value: 0 },
    zoneChord: { value: new Float32Array(MAX_ZONES) },
    zoneFill: { value: Array.from({ length: MAX_ZONES }, () => new Vector4()) },
    zoneLine: { value: Array.from({ length: MAX_ZONES }, () => new Vector4()) },
    zoneWidth: { value: new Float32Array(MAX_ZONES) },
    zoneDashes: { value: new Float32Array(MAX_ZONES) },
    zoneShock: { value: new Vector4() }, // chord, opacity, width, unused
    zonePixelRatio: { value: 1 },
  };
}

/** Shared by the impact globe and the components that draw zones on it. */
export const zoneUniforms = createZoneUniforms();

// Straight-line distance through the unit sphere for a surface distance. The
// shader compares these instead of angles: acos() loses all precision for the
// metre-scale craters of small impacts, a chord length doesn't.
export const chordFor = (radiusM) => 2 * Math.sin(metersToAngle(radiusM) / 2);

const scratch = new Color();
function srgb(hex, out) {
  // The overlay is mixed in after the shader's colour-space conversion.
  scratch.set(hex).getRGB(scratch, SRGBColorSpace);
  return out.set(scratch.r, scratch.g, scratch.b, out.w);
}

let owner = null;

/**
 * Draw `zones` around `center` (unit vector): each { radiusM, fill, fillOpacity,
 * line, lineOpacity, width (CSS px), dashed }. Ordered from the bottom layer up.
 */
export function setZones(who, center, zones) {
  owner = who;
  const u = zoneUniforms;
  const { east, north } = localFrame(center);
  u.zoneCenter.value.copy(center).normalize();
  u.zoneEast.value.copy(east);
  u.zoneNorth.value.copy(north);
  const list = zones.slice(0, MAX_ZONES);
  list.forEach((z, i) => {
    const angle = metersToAngle(z.radiusM);
    u.zoneChord.value[i] = chordFor(z.radiusM);
    srgb(z.fill ?? "#000000", u.zoneFill.value[i]).w = z.fillOpacity ?? 0;
    srgb(z.line, u.zoneLine.value[i]).w = z.lineOpacity ?? 1;
    u.zoneWidth.value[i] = z.width ?? 1.5;
    // A whole number of dashes so the pattern closes without a seam; spacing
    // scales with the ring like the dashed lines this replaces.
    u.zoneDashes.value[i] = z.dashed
      ? Math.max(6, Math.round((2 * Math.PI * Math.sin(angle)) / (0.204 * angle)))
      : 0;
  });
  u.zoneCount.value = list.length;
}

export function clearZones(who) {
  if (owner !== who) return;
  owner = null;
  zoneUniforms.zoneCount.value = 0;
  zoneUniforms.zoneShock.value.y = 0;
}

/** Fill and outline opacity of zone `i`, for animating them in. */
export function setZoneOpacity(i, fillOpacity, lineOpacity) {
  zoneUniforms.zoneFill.value[i].w = fillOpacity;
  if (lineOpacity != null) zoneUniforms.zoneLine.value[i].w = lineOpacity;
}

/** The expanding air-blast front. */
export function setShock(radiusM, opacity, width = 3) {
  zoneUniforms.zoneShock.value.set(chordFor(radiusM), opacity, width, 0);
}

export const zoneShader = /* glsl */ `
  #define MAX_ZONES ${MAX_ZONES}
  uniform vec3 zoneCenter;
  uniform vec3 zoneEast;
  uniform vec3 zoneNorth;
  uniform int zoneCount;
  uniform float zoneChord[MAX_ZONES];
  uniform vec4 zoneFill[MAX_ZONES];
  uniform vec4 zoneLine[MAX_ZONES];
  uniform float zoneWidth[MAX_ZONES];
  uniform float zoneDashes[MAX_ZONES];
  uniform vec4 zoneShock;
  uniform float zonePixelRatio;

  // Coverage of a line of width w (CSS px) at distance d (device px), anti-aliased.
  float zoneStroke(float d, float w) {
    float halfW = 0.5 * w * zonePixelRatio;
    return 1.0 - smoothstep(halfW - 0.5, halfW + 0.5, d);
  }

  vec3 drawZones(vec3 color, vec3 n) {
    float c = length(n - zoneCenter);
    float px = max(fwidth(c), 1e-9);
    if (zoneCount == 0 && zoneShock.y <= 0.0) return color;
    float around = atan(dot(n, zoneNorth), dot(n, zoneEast)) / 6.28318530718 + 0.5;
    for (int i = 0; i < MAX_ZONES; i++) {
      if (i >= zoneCount) break;
      float inside = 1.0 - smoothstep(-0.5, 0.5, (c - zoneChord[i]) / px);
      color = mix(color, zoneFill[i].rgb, zoneFill[i].a * inside);
    }
    for (int i = 0; i < MAX_ZONES; i++) {
      if (i >= zoneCount) break;
      float line = zoneStroke(abs(c - zoneChord[i]) / px, zoneWidth[i]);
      if (zoneDashes[i] > 0.0) line *= step(fract(around * zoneDashes[i]), 0.59);
      color = mix(color, zoneLine[i].rgb, zoneLine[i].a * line);
    }
    if (zoneShock.y > 0.0) {
      color = mix(color, vec3(1.0), zoneShock.y * zoneStroke(abs(c - zoneShock.x) / px, zoneShock.z));
    }
    return color;
  }
`;
