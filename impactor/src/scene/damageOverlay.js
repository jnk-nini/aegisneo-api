// Visible damage painted on the ground by the globe and crater shaders: charred
// land, fires, flattened forest, cities gone dark, the tsunami ring and the
// planet-wide dust veil. Every radius is a model output (thermal, blast and
// wind ranges) passed in as a chord, like the zone rings in zoneOverlay.js.
// The look (char and ash, embers, fire fronts, rubble) is illustrative.
import { Vector4 } from "three";
import { chordFor } from "./zoneOverlay.js";

// All zero: `new Vector4()` starts with w = 1, which would cut a crater hole
// ~6,000 km wide at the north pole before any impact.
const off = () => new Vector4(0, 0, 0, 0);

export function createDamageUniforms() {
  return {
    dmgChordA: { value: off() }, // scorched, fires, flattened, lights out
    dmgChordB: { value: off() }, // wrecked, tsunami front, tsunami width, crater hole
    dmgLevel: { value: off() }, // scorched, fires, flattened, wrecked (0..1)
    dmgFx: { value: off() }, // tsunami strength, dust veil, time (s), lights-out level
    dmgLight: { value: off() }, // fireball light: world position, reach (Earth radii)
    dmgLightColor: { value: off() }, // its colour, brightness
  };
}

/** Shared by the impact globe, its clouds and atmosphere, and the crater patch. */
export const damageUniforms = createDamageUniforms();

export function resetDamage() {
  for (const u of Object.values(damageUniforms)) u.value.set(0, 0, 0, 0);
}

/**
 * Sets the damage radii (m) and how far each has appeared (0..1). Radii of 0
 * hide a layer. `holeM` is the radius of the crater patch the globe hides.
 */
export function setDamage({
  scorchM = 0,
  firesM = 0,
  flattenedM = 0,
  lightsOutM = 0,
  wreckedM = 0,
  tsunamiM = 0,
  holeM = 0,
  levels = [0, 0, 0, 0],
  tsunami = 0,
  dust = 0,
  time = 0,
  lightsOut = 0,
}) {
  const c = (m) => (m > 0 ? chordFor(m) : 0);
  const u = damageUniforms;
  u.dmgChordA.value.set(c(scorchM), c(firesM), c(flattenedM), c(lightsOutM));
  const front = c(tsunamiM);
  u.dmgChordB.value.set(c(wreckedM), front, Math.max(front * 0.035, 1e-6), c(holeM));
  u.dmgLevel.value.set(...levels);
  u.dmgFx.value.set(tsunami, dust, time, lightsOut);
}

/**
 * Light from the fireball and molten rock, at `position` (world units) and
 * reaching about `reachRE` Earth radii. Brightness 0 switches it off.
 */
export function setImpactLight(position, reachRE, color, brightness) {
  damageUniforms.dmgLight.value.set(position.x, position.y, position.z, reachRE);
  damageUniforms.dmgLightColor.value.set(color.x, color.y, color.z, brightness);
}

/** The fireball's light on anything nearby (ground, crater walls, ejecta). */
export const impactLightShader = /* glsl */ `
  uniform vec4 dmgLight;
  uniform vec4 dmgLightColor;

  vec3 impactLight(vec3 posW, vec3 normal, vec3 albedo) {
    if (dmgLightColor.w <= 0.0) return vec3(0.0);
    vec3 toLight = dmgLight.xyz - posW;
    float d = length(toLight);
    float falloff = 1.0 / (1.0 + d * d / (dmgLight.w * dmgLight.w));
    float facing = max(dot(normal, toLight / max(d, 1e-9)), 0.0) * 0.85 + 0.15;
    return (albedo + 0.04) * dmgLightColor.rgb * dmgLightColor.w * facing * falloff;
  }
`;

/**
 * The shared 3D noise texture (noiseVolume.js) for the ground damage and the
 * crater: a texture lookup is far cheaper than evaluating noise in the shader.
 * Kept apart from damageUniforms, whose values are all vectors.
 */
export const damageNoise = { dmgNoise: { value: null } };

/** Noise lookups: billows (0..1, mostly bright) and cellular (dark at cell edges). */
export const texNoiseShader = /* glsl */ `
  precision highp sampler3D;
  uniform sampler3D dmgNoise;
  float nb(vec3 p) { return texture(dmgNoise, p).r; }
  float nc(vec3 p) { return texture(dmgNoise, p).g; }
`;

/** Needs texNoiseShader, surfaceShader (sunDir) and zoneShader included first. */
export const damageShader = /* glsl */ `
  uniform vec4 dmgChordA;
  uniform vec4 dmgChordB;
  uniform vec4 dmgLevel;
  uniform vec4 dmgFx;
  ${impactLightShader}

  float dmgInside(float c, float chord, float soft) {
    return chord > 0.0 ? 1.0 - smoothstep(chord * (1.0 - soft), chord, c) : 0.0;
  }

  // Shading from small relief: compares a height field here and a step toward
  // the sun, so ridges and pits catch light on one side and shadow on the other.
  float relief(vec3 q, vec3 sunT, float scale, float step_, float strength) {
    float h0 = nb(q * scale);
    float h1 = nb((q + sunT * step_) * scale);
    return 1.0 + clamp((h1 - h0) * strength, -0.5, 0.5);
  }

  // Changes the surface colours in place and returns light it emits (fires,
  // embers). Every layer checks its radius first: a zero radius would divide by zero.
  vec3 applyDamage(inout vec3 day, inout vec3 night, float land, vec3 n) {
    vec3 q = n - zoneCenter;
    float c = length(q);
    vec3 glow = vec3(0.0);
    if (c > max(max(dmgChordA.x, dmgChordA.y), max(max(dmgChordA.z, dmgChordA.w), max(dmgChordB.x, dmgChordB.y + 3.0 * dmgChordB.z)))) {
      return glow;
    }
    float t = dmgFx.z;
    // Toward the sun along the ground, for the relief shading.
    vec3 sunT = sunDir - n * dot(sunDir, n);
    sunT /= max(length(sunT), 1e-6);
    // Ground detail at a fixed size (~500 m cells), shown once the camera is close.
    vec3 pa = n * 3000.0;
    float metresPerPx = fwidth(c) * 6.371e6;
    float close = 1.0 - smoothstep(250.0, 2500.0, metresPerPx);

    // Flattened forest: trees down in streaks pointing away from the impact, dead and brown.
    if (dmgLevel.z > 0.0 && dmgChordA.z > 0.0) {
      float r = dmgChordA.z;
      vec2 radial = vec2(dot(q, zoneEast), dot(q, zoneNorth)) / max(c, 1e-9);
      float streak = nb(vec3(radial * 2.2, c / r * 0.4));
      float flat_ = dmgLevel.z * land * dmgInside(c, r, 0.08);
      float grey = dot(day, vec3(0.3, 0.59, 0.11));
      vec3 dead = mix(vec3(grey) * vec3(0.95, 0.78, 0.55), day * vec3(0.7, 0.55, 0.38), streak);
      day = mix(day, dead, flat_ * (0.55 + 0.45 * streak));
    }

    // Wrecked ground: rubble, grey-brown and uneven.
    if (dmgLevel.w > 0.0 && dmgChordB.x > 0.0) {
      float r = dmgChordB.x;
      float w = dmgLevel.w * land * dmgInside(c, r, 0.1);
      float rubble = mix(nb(q / r * 5.0), nb(pa * 0.8), close * 0.7);
      vec3 rubbleColor = mix(vec3(0.17, 0.15, 0.13), vec3(0.36, 0.33, 0.3), rubble);
      day = mix(day, rubbleColor * relief(q / r, sunT, 9.0, r * 0.01, 3.0), w * 0.85);
    }

    // Scorched land: black char and grey ash (more ash farther out), with
    // embers still smouldering in it.
    if (dmgLevel.x > 0.0 && dmgChordA.x > 0.0) {
      float r = dmgChordA.x;
      float edge = nb(q / r * 0.9);
      float s = dmgLevel.x * land * (1.0 - smoothstep(r * (0.5 + 0.45 * edge), r * (1.0 + 0.1 * edge), c));
      if (s > 0.0) {
        float ashy = smoothstep(0.55, 0.9, nb(q / r * 3.0 + 3.7)) * (0.35 + 0.65 * c / r);
        float grain = mix(nc(q / r * 14.0), nc(pa * 0.6), close);
        vec3 burnt = mix(vec3(0.03, 0.026, 0.024), vec3(0.3, 0.29, 0.28) * (0.8 + 0.4 * grain), ashy);
        day = mix(day, burnt * relief(q / r, sunT, 8.0, r * 0.012, 3.5), s * 0.95);
        float specks = smoothstep(0.08, 0.0, mix(nc(q / r * 30.0 + vec3(0.0, 0.0, t * 0.01)), nc(pa * 1.4), close));
        float pulse = 0.55 + 0.45 * sin(t * 2.7 + grain * 25.0);
        glow += vec3(1.0, 0.26, 0.03) * specks * pulse * s * (1.0 - ashy) * 1.4;
      }
    }

    // Fires: burning fronts and patches across the zone, and, close up,
    // individual flames.
    if (dmgLevel.y > 0.0 && dmgChordA.y > 0.0) {
      float r = dmgChordA.y;
      float zone = dmgLevel.y * land * (1.0 - smoothstep(r * 0.8, r, c));
      if (zone > 0.0) {
        float field = nb(q / r * 4.0 - vec3(0.0, 0.0, t * 0.004));
        // Thin, broken lines of flame where the fire is advancing, a few
        // patches still fully ablaze, and black ground it has already burnt.
        float lineWidth = max(0.012, fwidth(field) * 0.8);
        float front = (1.0 - smoothstep(0.0, lineWidth, abs(field - 0.74))) * smoothstep(0.45, 0.8, nb(q / r * 13.0 + 1.7));
        float patches = smoothstep(0.9, 0.98, field) * smoothstep(0.5, 0.85, nb(q / r * 20.0));
        float flames = smoothstep(0.55, 0.9, nb(pa * 0.5 + vec3(0.0, 0.0, t * 0.3)));
        float flicker = 0.7 + 0.3 * sin(t * 9.0 + field * 40.0);
        float fire = (front * 1.3 + patches * 0.8) * mix(1.0, 0.4 + flames * 1.4, close);
        glow += vec3(1.0, 0.3, 0.04) * fire * flicker * zone;
        day = mix(day, vec3(0.04, 0.035, 0.03), zone * smoothstep(0.6, 0.74, field) * 0.85);
      }
    }

    // Cities in the destroyed area go dark.
    night *= 1.0 - dmgFx.w * dmgInside(c, dmgChordA.w, 0.05);

    // Tsunami: a bright crest racing across the ocean (illustrative).
    if (dmgFx.x > 0.0 && dmgChordB.y > 0.0) {
      // Bright crest with a dark trough just behind it, on the ocean only.
      float d = (c - dmgChordB.y) / dmgChordB.z;
      float sea = (1.0 - land) * dmgFx.x;
      day *= 1.0 - 0.4 * sea * exp(-(d + 2.2) * (d + 2.2));
      day = mix(day, vec3(0.55, 0.78, 0.9), 0.8 * sea * exp(-d * d));
    }
    return glow;
  }

  // Planet-wide dust and soot after the largest impacts.
  vec3 applyDust(vec3 color) {
    return mix(color, color * vec3(0.42, 0.34, 0.26) + vec3(0.018, 0.011, 0.005), dmgFx.y);
  }
`;
