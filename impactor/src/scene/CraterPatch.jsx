// The crater itself: a detailed disc of ground at the impact site, carved into
// the shape from craterShape.js and animated from excavation to its final form.
// The globe's own mesh is far too coarse for this (~125 km per cell), so the
// globe leaves a hole here (see damageOverlay.js) and this patch fills it,
// shaded with the same textures and lighting so the join doesn't show.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Vector3, Vector4 } from "three";
import { useSim } from "../store.js";
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { G } from "./impactVisuals.js";
import { collapseWindow } from "./craterShape.js";
import { APPROACH_SECONDS, aftermathRealSeconds, clock, simulatedSeconds } from "./timeline.js";
import { detailUniforms, surfaceShader } from "./surfaceShader.js";
import { zoneShader, zoneUniforms } from "./zoneOverlay.js";
import { damageNoise, damageShader, damageUniforms, texNoiseShader } from "./damageOverlay.js";

const KIND = { simple: 0, complex: 1, melt: 2, water: 3 };
// Depth of the skirt hung from the patch edge (Earth radii). The globe's flat
// triangles sag up to ~2.5 km below the true sphere; the skirt covers that gap.
const SKIRT_RE = 0.0006;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Polar grid in crater radii: rings packed around the centre and rim, sparser
 * towards the edge, plus a skirt ring. Positions are computed in the shader.
 */
function patchGeometry(edge, rings, segments) {
  const inner = Math.round(rings * 0.55);
  const xs = [];
  for (let i = 0; i <= rings; i++) {
    xs.push(
      i <= inner ? 1.2 * (i / inner) ** 0.8 : 1.2 + (edge - 1.2) * ((i - inner) / (rings - inner)) ** 1.5,
    );
  }
  xs.push(edge); // skirt
  const cols = segments + 1;
  const count = xs.length * cols;
  const polar = new Float32Array(count * 2);
  const skirt = new Float32Array(count);
  xs.forEach((x, r) => {
    for (let s = 0; s < cols; s++) {
      const k = r * cols + s;
      polar[k * 2] = x;
      polar[k * 2 + 1] = (s / segments) * Math.PI * 2;
      skirt[k] = r === xs.length - 1 ? 1 : 0;
    }
  });
  const index = [];
  for (let r = 0; r < xs.length - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * cols + s;
      const b = a + cols;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("aPolar", new BufferAttribute(polar, 2));
  geometry.setAttribute("aSkirt", new BufferAttribute(skirt, 1));
  geometry.setIndex(index);
  return geometry;
}

const craterGlsl = /* glsl */ `
  const float EARTH_R = ${EARTH_RADIUS_M.toFixed(1)};
  uniform vec3 cUp;
  uniform vec3 cEast;
  uniform vec3 cNorth;
  uniform float cRadius; // crater radius, Earth radii
  uniform vec4 cShape;   // rim (m), depth (m), floor fraction, peak (m)
  uniform vec4 cShape2;  // peak ring, patch edge, transient radius (crater radii), transient depth (m)
  uniform vec4 cAnim;    // growth, collapse, exaggeration, kind
  uniform vec4 cWave;    // water: wave time, wave height (m), jet height (m); ejecta blanket reveal
  uniform float cMelt;   // melt temperature, 0..1
  uniform vec4 cSea;     // water: seabed reveal 0..1, water radii per seabed radius, drawn water depth (m), seabed kind
  uniform vec4 cBed;     // water: seabed crater rim, depth, floor fraction, peak (m)

  // Crater profile at x crater radii (kind: 0 bowl, 1 complex, 2 peak ring).
  // Mirrors finalHeight() in craterShape.js.
  float craterProfile(float x, vec4 shape, float edge, float kind) {
    float rim = shape.x;
    float depth = shape.y;
    float floorH = rim - depth;
    if (x >= 1.0) {
      float e = pow(edge, -3.0);
      return max(0.0, rim * (pow(x, -3.0) - e) / (1.0 - e));
    }
    if (kind < 0.5) return floorH + depth * x * x;
    float t = clamp((x - shape.z) / (1.0 - shape.z), 0.0, 1.0);
    float wall = t * t * (3.0 - 2.0 * t) + 0.04 * sin(6.0 * PI * t) * 4.0 * t * (1.0 - t);
    float h = floorH + depth * wall;
    if (shape.w > 0.0) {
      float k = kind > 1.5 ? (x - 0.28) / 0.07 : x / 0.12;
      h += shape.w * exp(-k * k);
    }
    return h;
  }

  float craterFinal(float x) {
    float kind = cAnim.w < 0.5 || cAnim.w > 2.5 ? 0.0 : 1.0 + cShape2.x;
    return craterProfile(x, cShape, cShape2.y, kind);
  }

  // The seabed under the settled water: its crater, below the drawn water depth.
  float seabed(float x) {
    return craterProfile(x * cSea.y, cBed, cShape2.y * cSea.y, cSea.w) - cSea.z;
  }

  // Mirrors transientHeight() in craterShape.js.
  float craterTransient(float x, float grow) {
    if (grow <= 0.0) return 0.0;
    float r = cShape2.z * pow(grow, 1.0 / 3.0);
    float d = cShape2.w * grow;
    float lip = cShape2.w * 0.12 * grow;
    if (x < r) return -d + (d + lip) * (x / r) * (x / r);
    return lip * pow(r / x, 3.0) * (1.0 - smoothstep(cShape2.y * 0.8, cShape2.y, x));
  }

  // Ground height (m, true scale) at x crater radii right now.
  float craterHeight(float x) {
    if (cAnim.w > 2.5) {
      // Water: the cavity fills back in, a jet rises at the centre and rings run outward.
      float front = 0.8 * cWave.x;
      float h = craterTransient(x, cAnim.x) * (1.0 - cAnim.y);
      h += cWave.y * sin(9.0 * (x - front)) * exp(-2.5 * abs(x - front));
      h += cWave.z * exp(-(x / 0.12) * (x / 0.12));
      return cSea.x > 0.0 ? mix(h, seabed(x), cSea.x) : h;
    }
    return mix(craterTransient(x, cAnim.x), craterFinal(x), cAnim.y);
  }
`;

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec2 aPolar;
  attribute float aSkirt;
  ${craterGlsl}
  varying vec3 vDir;
  varying vec3 vNormalL;
  varying vec3 vPosW;
  varying float vX;
  varying float vH;
  varying float vSlope;
  void main() {
    float x = aPolar.x;
    vec3 radial = cos(aPolar.y) * cEast + sin(aPolar.y) * cNorth;
    float theta = x * cRadius;
    float st = sin(theta);
    float hs = sin(0.5 * theta);
    float cm1 = -2.0 * hs * hs; // cos(theta) - 1 without losing precision
    vec3 dir = cUp * (1.0 + cm1) + radial * st;

    float h = craterHeight(x);
    float x0 = max(x - 0.004, 0.0);
    float x1 = x + 0.004;
    float slope = (craterHeight(x1) - craterHeight(x0)) / (x1 - x0) * cAnim.z / (cRadius * EARTH_R);
    float lift = aSkirt > 0.5 ? -${SKIRT_RE} : h * cAnim.z / EARTH_R;
    // Relative to the impact point (the mesh origin), so metre-scale craters stay precise.
    vec3 local = cUp * cm1 + radial * st + dir * lift;

    vec3 tangent = -cUp * st + radial * cos(theta);
    vNormalL = aSkirt > 0.5 ? dir : normalize(dir - tangent * slope);
    vDir = dir;
    vX = x;
    vH = h;
    vSlope = slope;
    vPosW = (modelMatrix * vec4(local, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  ${texNoiseShader}
  ${surfaceShader}
  ${craterGlsl}
  ${zoneShader}
  ${damageShader}
  varying vec3 vDir;
  varying vec3 vNormalL;
  varying vec3 vPosW;
  varying float vX;
  varying float vH;
  varying float vSlope;

  vec3 meltColor(float t) {
    vec3 warm = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.88, 0.62), smoothstep(0.7, 1.0, t));
    return mix(vec3(0.55, 0.04, 0.0), warm, smoothstep(0.15, 0.7, t));
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 dir = normalize(vDir);
    vec3 nL = normalize(vNormalL);
    vec3 viewDir = normalize(cameraPosition - vPosW);
    vec2 uv = sphereUv(dir);
    vec3 day = detailDay(uv, sampleSphere(dayMap, uv).rgb);
    vec3 night = sampleSphere(nightMap, uv).rgb;
    float land = sampleSphere(maskMap, uv).r;
    vec3 glow = applyDamage(day, night, land, dir);

    float x = vX;
    float water = step(2.5, cAnim.w);
    float rock = 1.0 - water;
    vec3 p = (dir - cUp) / cRadius; // local coordinates in crater radii, for noise
    vec2 flat2 = vec2(dot(p, cEast), dot(p, cNorth));

    // Ejecta blanket: thick by the rim, thinning outward in rays, laid down as it lands.
    float reach = 1.0 + (cShape2.y - 1.0) * cWave.w;
    float rays = nb(vec3(flat2 / max(length(flat2), 1e-6) * 1.6, 0.5));
    float blanket = (1.0 - smoothstep(reach * 0.9, reach, x)) * clamp(1.5 * pow(max(x, 1.0), -1.6) - 0.1, 0.0, 1.0);
    blanket *= 0.5 + 0.5 * smoothstep(0.45, 0.85, rays);
    vec3 sunT = sunDir - dir * dot(sunDir, dir);
    sunT /= max(length(sunT), 1e-6);
    vec3 ejecta = vec3(0.36, 0.3, 0.25) * (0.75 + 0.45 * nb(p * 2.4 + 5.0)) * relief(p, sunT, 3.0, 0.02, 3.0);
    day = mix(day, ejecta, blanket * 0.85 * rock * step(1.0, x));

    // Exposed rock wherever the ground was dug out.
    float below = (1.0 - smoothstep(-0.06 * max(cShape.y, 1.0), 0.0, vH)) * step(x, 1.05);
    float bowl = max(below, (1.0 - smoothstep(0.98, 1.04, x)) * cAnim.y);
    vec3 bedrock = vec3(0.17, 0.14, 0.12) * (0.7 + 0.5 * nb(p * 1.2)) * relief(p, sunT, 2.0, 0.03, 2.5);
    day = mix(day, bedrock, bowl * rock);
    night *= 1.0 - max(bowl, blanket) * rock;

    // Melt: the whole bowl glows at first; the floor's melt sheet cools to dark
    // rock, its cracks glowing longest.
    float floorZone = 1.0 - smoothstep(cAnim.w > 0.5 ? 0.55 : 0.4, 0.85, x);
    float meltZone = mix(bowl, floorZone, cAnim.y) * rock;
    float cracks = smoothstep(0.16, 0.02, nc(p * 1.8));
    float hot = meltZone * cMelt * mix(cracks, 1.0, smoothstep(0.45, 0.9, cMelt));
    day = mix(day, vec3(0.07, 0.055, 0.05), meltZone * 0.6);

    // Just outside the rim, molten ejecta: dark crust broken into plates with
    // glowing seams, cooling with the melt sheet.
    float moltenRing = rock * step(1.0, x) * (1.0 - smoothstep(1.15, 1.9, x + 0.25 * nb(p * 1.5)));
    float seams = smoothstep(0.14, 0.02, nc(p * 2.6));
    day = mix(day, vec3(0.06, 0.05, 0.045), moltenRing * 0.8);
    float ringHeat = max(cMelt - 0.12, 0.0) * moltenRing;

    // Water, once settled: the seabed and its crater, seen through the water
    // (WaterSurface draws the water itself over it).
    float bed = water * cSea.x;
    if (bed > 0.0) {
      float xs = x * cSea.y;
      float inBowl = 1.0 - smoothstep(0.92, 1.12, xs);
      float thrown = (1.0 - smoothstep(1.0, 2.6, xs + 0.4 * nb(p * 1.7))) * (1.0 - inBowl);
      vec3 silt = vec3(0.27, 0.26, 0.21) * (0.75 + 0.45 * nb(p * 2.2 + 3.0)) * relief(p, sunT, 3.0, 0.02, 3.0);
      vec3 rubble = vec3(0.24, 0.21, 0.18) * (0.7 + 0.5 * nb(p * 3.1 + 1.0)) * relief(p, sunT, 4.0, 0.02, 3.5);
      vec3 fresh = vec3(0.19, 0.16, 0.14) * (0.7 + 0.5 * nb(p * 1.2)) * relief(p, sunT, 2.0, 0.03, 2.5);
      // Light reaching the seabed and back loses its red first: blue-green,
      // and darker down in the crater.
      vec3 seabedColor = mix(mix(silt, rubble, thrown), fresh, inBowl);
      seabedColor *= mix(vec3(0.5, 0.82, 0.88), vec3(0.22, 0.48, 0.62), inBowl);
      day = mix(day, seabedColor, bed);
      night *= 1.0 - bed;
    }

    // Water: whitecaps where the surface is steep.
    float foam = smoothstep(0.2, 0.7, abs(vSlope)) * water * (1.0 - bed);
    day = mix(day, vec3(0.86, 0.92, 0.95), foam * 0.85);

    // Nothing burns in the crater or under fresh ejecta.
    glow *= 1.0 - max(bowl, blanket) * rock;
    glow += meltColor(cMelt) * hot * 3.0;
    glow += meltColor(ringHeat) * seams * ringHeat * 3.5;

    vec3 color = shadeSurface(day, night, (1.0 - land) * (1.0 - bowl * rock) * (1.0 - bed), dir, nL, viewDir) + glow;
    color += impactLight(vPosW, nL, day);
    // A faint fill light so the crater's shape still reads on the night side.
    // It fades out well inside the patch, so the join with the globe doesn't show.
    float nightSide = 1.0 - smoothstep(-0.12, 0.2, dot(dir, sunDir));
    float fill = 1.0 - smoothstep(0.45 * cShape2.y, 0.85 * cShape2.y, x);
    color += day * 0.24 * max(dot(nL, normalize(viewDir + dir)), 0.0) * nightSide * fill;
    gl_FragColor = vec4(applyDust(color), 1.0);
    #include <colorspace_fragment>
    gl_FragColor.rgb = drawZones(gl_FragColor.rgb, dir);
  }
`;

// The sea over a settled ocean impact: clear and pale over the seabed crater so
// it shows through, muddy where sediment was stirred up, flecked with floating
// pumice and debris, and turning into open ocean (matching the globe) by the
// edge of the patch. Drawn much shallower than the real sea; the HUD says so.
const waterVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec2 aPolar;
  uniform vec3 cUp;
  uniform vec3 cEast;
  uniform vec3 cNorth;
  uniform float cRadius;
  varying vec3 vDir;
  varying vec3 vPosW;
  varying float vX;
  void main() {
    float x = aPolar.x;
    vec3 radial = cos(aPolar.y) * cEast + sin(aPolar.y) * cNorth;
    float theta = x * cRadius;
    float hs = sin(0.5 * theta);
    float cm1 = -2.0 * hs * hs;
    vec3 local = cUp * cm1 + radial * sin(theta);
    vDir = cUp * (1.0 + cm1) + radial * sin(theta);
    vX = x;
    vPosW = (modelMatrix * vec4(local, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const waterFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  ${texNoiseShader}
  ${surfaceShader}
  uniform vec3 cUp;
  uniform vec3 cEast;
  uniform vec3 cNorth;
  uniform float cRadius;
  uniform vec4 cShape2;
  uniform vec4 cSea;
  ${zoneShader}
  ${damageShader}
  varying vec3 vDir;
  varying vec3 vPosW;
  varying float vX;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 dir = normalize(vDir);
    vec3 viewDir = normalize(cameraPosition - vPosW);
    vec2 uv = sphereUv(dir);
    vec3 day = detailDay(uv, sampleSphere(dayMap, uv).rgb);
    vec3 night = sampleSphere(nightMap, uv).rgb;
    vec3 glow = applyDamage(day, night, 0.0, dir);
    float x = vX;
    float xs = x * cSea.y; // in seabed crater radii
    vec3 p = (dir - cUp) / cRadius;
    vec2 flat2 = vec2(dot(p, cEast), dot(p, cNorth));

    // Clear only over the crater and its surroundings; open ocean beyond, and
    // always by the patch edge, so it meets the globe without a seam.
    float open = max(smoothstep(0.62 * cShape2.y, 0.96 * cShape2.y, x), smoothstep(1.3, 3.6, xs + 1.6 * (nb(p * cSea.y * 0.35) - 0.5)));
    float reveal = cSea.x;
    // Sediment stirred up from the seabed drifts out in muddy swirls.
    vec2 q = flat2 * cSea.y;
    vec2 warp = vec2(nb(vec3(q * 0.3, 1.7)), nb(vec3(q * 0.3, 4.1))) - 0.5;
    float swirl = nb(vec3(q * 0.45 + warp * 2.5, 0.3));
    float mud = smoothstep(0.45, 0.75, swirl) * (1.0 - smoothstep(0.8, 3.4, xs + warp.x * 1.5)) * (1.0 - open * 0.6);
    // Pumice and wreckage floating on the surface.
    float specks = smoothstep(0.05, 0.0, nc(p * 7.0 + 2.0)) * (1.0 - smoothstep(0.7, 2.6, xs)) * (1.0 - open);

    vec3 shallow = vec3(0.03, 0.2, 0.26);
    vec3 water = mix(shallow, day, open);
    water = mix(water, vec3(0.3, 0.27, 0.2), mud * 0.6);
    water = mix(water, vec3(0.6, 0.58, 0.54), specks * 0.85);
    float clearness = (1.0 - open) * (1.0 - 0.7 * mud) * (1.0 - specks);
    float fresnel = pow(1.0 - max(dot(dir, viewDir), 0.0), 4.0);
    float alpha = 1.0 - clearness * (1.0 - fresnel) * 0.55;
    // Fades in as the water settles; the edge first, so the globe stays sealed.
    alpha *= mix(smoothstep(0.0, 0.2, reveal), reveal, 1.0 - open);

    vec3 color = shadeSurface(water, night, 1.0 - max(mud, specks), dir, dir, viewDir) + glow;
    color += impactLight(vPosW, dir, water);
    gl_FragColor = vec4(applyDust(color), alpha);
    #include <colorspace_fragment>
    gl_FragColor.rgb = drawZones(gl_FragColor.rgb, dir);
  }
`;

export default function CraterPatch({ run, geo, visual, textures, sunDir }) {
  const lowQuality = useSim((s) => s.quality === "low");
  const mesh = useRef();
  const sea = useRef();
  const geometry = useMemo(
    () => (lowQuality ? patchGeometry(visual.edgeFrac, 72, 128) : patchGeometry(visual.edgeFrac, 160, 256)),
    [visual, lowQuality],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(() => {
    const { up, east, north } = geo.frame;
    return {
      ...zoneUniforms,
      ...damageUniforms,
      ...damageNoise,
      ...detailUniforms,
      dayMap: { value: textures.day },
      nightMap: { value: textures.night },
      maskMap: { value: textures.mask },
      sunDir: { value: sunDir.clone().normalize() },
      cUp: { value: new Vector3().copy(up) },
      cEast: { value: new Vector3().copy(east) },
      cNorth: { value: new Vector3().copy(north) },
      cRadius: { value: visual.radiusM / EARTH_RADIUS_M },
      cShape: { value: new Vector4(visual.rimM, visual.depthM, visual.floorFrac, visual.peakM) },
      cShape2: {
        value: new Vector4(
          visual.peakRing ? 1 : 0,
          visual.edgeFrac,
          visual.transientRadiusM / visual.radiusM,
          visual.transientDepthM,
        ),
      },
      cAnim: { value: new Vector4(0, 0, visual.exaggeration, KIND[visual.kind]) },
      cWave: { value: new Vector4() },
      cMelt: { value: 0 },
      ...seabedUniforms(visual),
    };
  }, [geo, visual, textures, sunDir]);

  // Real timings: excavation ≈ 0.8·√(D/g), then (complex craters) collapse;
  // ballistic ejecta lands farther out the later it is.
  const timing = useMemo(() => {
    const E = Math.max(visual.excavationSeconds, 0.05);
    const collapse = collapseWindow(visual);
    // An impact's melt sheet stays hot for hours to millennia, so its cracks
    // still glow at the end of the run; bigger craters hold more, hotter melt.
    const radiusKm = visual.radiusM / 1000;
    const residual = {
      simple: 0.28,
      complex: 0.35 + 0.35 * Math.min(1, Math.max(0, (Math.log10(radiusKm) - 0.5) / 2.5)),
      melt: 0.75,
      water: 0,
    }[visual.kind];
    return { E, collapse, residual, end: aftermathRealSeconds(run) };
  }, [visual, run]);

  useFrame(() => {
    const done = useSim.getState().phase === "done";
    // Hidden until the moment of impact; the globe leaves its hole at the same time.
    if (mesh.current) mesh.current.visible = done || clock.t >= APPROACH_SECONDS;
    const s = done ? timing.end : simulatedSeconds(clock.t, run);
    const { E, collapse, residual } = timing;
    const u = uniforms;
    const g = Math.min(1, Math.max(0, s / E));
    u.cAnim.value.x = 1 - (1 - g) ** 2;
    u.cAnim.value.y = smooth(collapse[0], collapse[1], s);
    u.cMelt.value =
      visual.kind === "water" ? 0 : s < E ? 1 : Math.max(residual, Math.exp(-(s - E) / (4 * E)));
    // Ejecta thrown last (from the rim) lands farthest: range from the rim ∝ flight time².
    const flight = Math.max(0, s - 0.3 * E);
    const reachM = (G * flight * flight) / 2;
    const reveal = done ? 1 : Math.min(1, reachM / (visual.radiusM * (visual.edgeFrac - 1)));
    const waveT = Math.max(0, (s - E) / E);
    const waveAmp = visual.transientDepthM * 0.05 * Math.exp(-0.35 * waveT) * smooth(0, 0.5, waveT);
    const jetPhase = Math.min(1, Math.max(0, (s - 1.2 * E) / (1.5 * E)));
    const jet = visual.transientDepthM * 0.5 * Math.sin(Math.PI * jetPhase);
    u.cWave.value.set(waveT, done ? 0 : waveAmp, done ? 0 : jet, reveal);
    // Once the water has settled, the seabed crater shows through it.
    if (visual.seafloor) {
      u.cSea.value.x = done ? 1 : smooth(collapse[1], collapse[1] + 3 * E, s);
      if (sea.current) sea.current.visible = mesh.current?.visible && u.cSea.value.x > 0;
    }
  });

  return (
    <mesh
      ref={mesh}
      position={geo.center}
      geometry={geometry}
      frustumCulled={false}
      raycast={() => null}
      visible={false}
      name="crater"
    >
      <shaderMaterial key={lowQuality ? "low" : "high"} args={[{ vertexShader, fragmentShader, uniforms }]} />
      {visual.seafloor && (
        <mesh ref={sea} geometry={geometry} frustumCulled={false} raycast={() => null} visible={false}>
          <shaderMaterial
            args={[{ vertexShader: waterVertex, fragmentShader: waterFragment, uniforms }]}
            transparent
            depthWrite={false}
          />
        </mesh>
      )}
    </mesh>
  );
}

/**
 * Seabed crater uniforms for an ocean impact. Heights are passed at the water
 * crater's exaggeration (applied to everything in the shader), so they are
 * rescaled to the seabed crater's own.
 */
function seabedUniforms(visual) {
  const bed = visual.seafloor;
  if (!bed) return { cSea: { value: new Vector4(0, 1, 0, 0) }, cBed: { value: new Vector4(0, 0, 0, 0) } };
  const k = bed.exaggeration / visual.exaggeration;
  const kind = bed.complex ? (bed.peakRing ? 2 : 1) : 0;
  return {
    cSea: { value: new Vector4(0, visual.radiusM / bed.radiusM, 0.6 * bed.depthM * k, kind) },
    cBed: { value: new Vector4(bed.rimM * k, bed.depthM * k, bed.floorFrac, bed.peakM * k) },
  };
}
