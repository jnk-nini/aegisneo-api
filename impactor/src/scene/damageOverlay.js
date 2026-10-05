// Visible damage painted on the ground by the globe and crater shaders: charred
// land, fires, flattened forest, cities gone dark, the tsunami ring and the
// planet-wide dust veil. Every radius is a model output (thermal, blast and
// wind ranges) passed in as a chord, like the zone rings in zoneOverlay.js.
// The look (char colour, fire flicker, streaks) is illustrative.
import { Vector4 } from "three";
import { chordFor } from "./zoneOverlay.js";

export function createDamageUniforms() {
  return {
    dmgChordA: { value: new Vector4() }, // scorched, fires, flattened, lights out
    dmgChordB: { value: new Vector4() }, // wrecked, tsunami front, tsunami width, crater hole
    dmgLevel: { value: new Vector4() }, // scorched, fires, flattened, wrecked (0..1)
    dmgFx: { value: new Vector4() }, // tsunami strength, dust veil, time (s), lights-out level
    dmgLight: { value: new Vector4() }, // fireball light: world position, reach (Earth radii)
    dmgLightColor: { value: new Vector4() }, // its colour, brightness
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

/** Needs noiseShader and zoneShader (for zoneCenter/East/North) included first. */
export const damageShader = /* glsl */ `
  uniform vec4 dmgChordA;
  uniform vec4 dmgChordB;
  uniform vec4 dmgLevel;
  uniform vec4 dmgFx;
  ${impactLightShader}

  float dmgInside(float c, float chord, float soft) {
    return chord > 0.0 ? 1.0 - smoothstep(chord * (1.0 - soft), chord, c) : 0.0;
  }

  // Changes the surface colours in place and returns light it emits (fires).
  // Every layer checks its radius first: a zero radius would divide by zero.
  vec3 applyDamage(inout vec3 day, inout vec3 night, float land, vec3 n) {
    vec3 q = n - zoneCenter;
    float c = length(q);
    vec3 glow = vec3(0.0);
    if (c > max(max(dmgChordA.x, dmgChordA.y), max(max(dmgChordA.z, dmgChordA.w), max(dmgChordB.x, dmgChordB.y + 3.0 * dmgChordB.z)))) {
      return glow;
    }

    // Flattened forest: land browned in streaks pointing away from the impact.
    if (dmgLevel.z > 0.0 && dmgChordA.z > 0.0) {
      float r = dmgChordA.z;
      vec2 radial = vec2(dot(q, zoneEast), dot(q, zoneNorth)) / max(c, 1e-9);
      float streak = vnoise(vec3(radial * 9.0, c / r * 1.5));
      float flat_ = dmgLevel.z * land * dmgInside(c, r, 0.08);
      day = mix(day, day * vec3(0.78, 0.62, 0.42), flat_ * (0.45 + 0.55 * streak));
    }

    // Wrecked ground (masonry collapses): a grey-brown wash.
    if (dmgLevel.w > 0.0 && dmgChordB.x > 0.0) {
      float w = dmgLevel.w * land * dmgInside(c, dmgChordB.x, 0.1);
      float grey = dot(day, vec3(0.3, 0.59, 0.11));
      day = mix(day, vec3(grey) * vec3(0.62, 0.56, 0.5), w * 0.75);
    }

    // Scorched land, with an uneven edge and patchy char.
    if (dmgLevel.x > 0.0 && dmgChordA.x > 0.0) {
      float r = dmgChordA.x;
      float edge = fbm(q / r * 3.0);
      float s = dmgLevel.x * land * (1.0 - smoothstep(r * (0.55 + 0.4 * edge), r * (1.0 + 0.12 * edge), c));
      float patchy = 0.55 + 0.45 * fbm(q / r * 11.0 + 3.7);
      day = mix(day, vec3(0.05, 0.04, 0.035), s * patchy * 0.9);
    }

    // Fires: burning patches across the zone, broken into individual flames
    // (~1 km) once the camera is close enough to see them.
    if (dmgLevel.y > 0.0 && dmgChordA.y > 0.0) {
      float r = dmgChordA.y;
      float zone = dmgLevel.y * land * (1.0 - smoothstep(r * 0.8, r, c));
      if (zone > 0.0) {
        float patches = smoothstep(0.6, 0.88, fbm(q / r * 14.0)) * (0.5 + 0.5 * fbm(q / r * 55.0 + 9.1));
        vec3 pf = q * 5300.0;
        float metresPerPx = fwidth(c) * 6.371e6;
        float detail = 1.0 - smoothstep(150.0, 1200.0, metresPerPx);
        float flames = smoothstep(0.55, 0.85, vnoise(pf + vec3(0.0, 0.0, dmgFx.z * 0.6)));
        float flicker = 0.75 + 0.25 * sin(dmgFx.z * 9.0 + hash13(floor(pf)) * 6.283);
        glow += vec3(1.0, 0.34, 0.06) * patches * mix(0.4, flames * 1.4, detail) * flicker * zone;
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
