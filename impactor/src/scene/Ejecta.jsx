// Ejecta, animated entirely on the GPU: each particle's position is worked out
// in the vertex shader from the simulated time, so no JavaScript runs per
// particle per frame (that matters on phones).
//
// EjectaCurtain: rock thrown out of the growing crater on 45° ballistic arcs.
// Material from near the centre leaves first and fastest; together the
// particles form the classic expanding inverted cone, then rain back down as
// the ejecta blanket.
//
// Reentry: after the largest impacts, ejecta thrown above the atmosphere falls
// back all around the planet as glowing streaks (the heat pulse thought to
// have lit fires worldwide after Chicxulub). Timings are illustrative.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Vector3 } from "three";
import { useSim } from "../store.js";
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { G, reentrySeconds } from "./impactVisuals.js";
import { APPROACH_SECONDS, clock, simulatedSeconds } from "./timeline.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointsGeometry(count, fill) {
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) fill(data, i * 4);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("aP", new BufferAttribute(data, 4));
  return geometry;
}

// Screen size of a point `worldSize` (Earth radii) across, clamped to a pixel range.
const pointSizeGlsl = /* glsl */ `
  uniform float uViewH;
  float pointPixels(float worldSize, vec4 mv, float minPx, float maxPx) {
    float px = worldSize * projectionMatrix[1][1] * 0.5 * uViewH / max(-mv.z, 1e-9);
    return clamp(px, minPx, maxPx);
  }
`;

const curtainVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec4 aP; // launch fraction of transient radius, azimuth, speed jitter, size jitter
  uniform vec3 uUp;
  uniform vec3 uEast;
  uniform vec3 uNorth;
  uniform float uTime;     // simulated seconds since impact
  uniform float uE;        // excavation time, s
  uniform float uRt;       // transient crater radius, m
  uniform float uMaxRange; // m
  uniform float uSpeed;    // launch-speed scale, m/s
  ${pointSizeGlsl}
  varying float vAge;
  varying float vAlpha;
  void main() {
    float f = aP.x;
    float launch = uE * pow(f, 2.5);
    float t = uTime - launch;
    float v = min(uSpeed * pow(f, -1.8) * aP.z, sqrt(${G} * uMaxRange));
    float flight = 1.41421356 * v / ${G};
    float tt = clamp(t, 0.0, flight);
    float d = f * uRt + 0.70710678 * v * tt;
    float z = max(0.0, 0.70710678 * v * tt - 0.5 * ${G} * tt * tt);
    float re = ${EARTH_RADIUS_M.toFixed(1)};
    vec3 radial = cos(aP.y) * uEast + sin(aP.y) * uNorth;
    float dr = d / re;
    vec3 local = radial * dr + uUp * (z / re - 0.5 * dr * dr + 2e-7);
    vec4 mv = modelViewMatrix * vec4(local, 1.0);
    gl_Position = projectionMatrix * mv;
    vAge = tt / max(flight, 1e-3);
    // Not launched yet: hidden. Landed: fades into the blanket.
    vAlpha = t < 0.0 ? 0.0 : 1.0 - smoothstep(flight, flight * 1.6 + uE * 0.3, t);
    gl_PointSize = t < 0.0 ? 0.0 : pointPixels(uRt * 0.018 * aP.w / re, mv, 1.2, 7.0);
    #include <logdepthbuf_vertex>
  }
`;

const curtainFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uHot;
  uniform vec3 uCool;
  uniform float uOpacity;
  varying float vAge;
  varying float vAlpha;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5 || vAlpha <= 0.0) discard;
    vec3 color = mix(uHot, uCool, smoothstep(0.0, 0.7, vAge));
    gl_FragColor = vec4(color, vAlpha * uOpacity * (1.0 - smoothstep(0.3, 0.5, r)));
    #include <colorspace_fragment>
  }
`;

export function EjectaCurtain({ run, geo, visual }) {
  const lowQuality = useSim((s) => s.quality === "low");
  const points = useRef();
  const water = visual.kind === "water";
  const count = lowQuality ? 1200 : 4000;
  const geometry = useMemo(() => {
    const rand = mulberry32(run.id * 7919 + 17);
    return pointsGeometry(count, (d, k) => {
      d[k] = 0.15 + 0.85 * rand() ** 0.6;
      d[k + 1] = rand() * Math.PI * 2;
      d[k + 2] = 0.7 + rand() * 0.6;
      d[k + 3] = 0.5 + rand();
    });
  }, [run.id, count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const rt = visual.transientRadiusM;
  const maxRange = visual.patchRadiusM * (water ? 0.6 : 1.2);
  const uniforms = useMemo(
    () => ({
      uUp: { value: new Vector3().copy(geo.frame.up) },
      uEast: { value: new Vector3().copy(geo.frame.east) },
      uNorth: { value: new Vector3().copy(geo.frame.north) },
      uTime: { value: 0 },
      uE: { value: Math.max(visual.excavationSeconds, 0.05) },
      uRt: { value: rt },
      uMaxRange: { value: maxRange },
      // Ejecta from the rim lands about one crater radius out (the thick blanket).
      uSpeed: { value: Math.sqrt(G * rt) * (water ? 0.5 : 0.8) },
      uViewH: { value: 800 },
      uHot: { value: water ? new Vector3(0.9, 0.96, 1.0) : new Vector3(1.0, 0.62, 0.3) },
      uCool: { value: water ? new Vector3(0.55, 0.72, 0.85) : new Vector3(0.42, 0.34, 0.27) },
      uOpacity: { value: 1 },
    }),
    [geo, visual, rt, maxRange, water],
  );
  const lastsUntil = useMemo(() => {
    const vmax = Math.sqrt(G * maxRange);
    return Math.max(visual.excavationSeconds, 0.05) * 1.3 + (2.4 * vmax) / G;
  }, [visual, maxRange]);

  useFrame(({ size, gl }) => {
    if (!points.current) return;
    const done = useSim.getState().phase === "done";
    const s = simulatedSeconds(clock.t, run);
    const show = !done && clock.t >= APPROACH_SECONDS && s < lastsUntil;
    points.current.visible = show;
    if (!show) return;
    uniforms.uTime.value = s;
    uniforms.uViewH.value = size.height * gl.getPixelRatio();
  });

  return (
    <points ref={points} position={geo.center} geometry={geometry} frustumCulled={false} raycast={() => null} visible={false}>
      <shaderMaterial
        args={[{ vertexShader: curtainVertex, fragmentShader: curtainFragment, uniforms }]}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

const reentryVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec4 aP; // direction (lat-ish, lon-ish packed), arrival time, size
  uniform vec3 uUp;
  uniform vec3 uEast;
  uniform vec3 uNorth;
  uniform float uTime;
  ${pointSizeGlsl}
  varying float vGlow;
  void main() {
    // Angular distance from the impact and bearing, unpacked into a direction.
    float theta = aP.x;
    vec3 radial = cos(aP.y) * uEast + sin(aP.y) * uNorth;
    vec3 dir = uUp * cos(theta) + radial * sin(theta);
    float t = (uTime - aP.z) / 150.0; // a re-entry lasts a couple of minutes
    float alt = mix(0.02, 0.0, clamp(t + 1.0, 0.0, 1.0)); // falls from ~130 km
    vec4 mv = modelViewMatrix * vec4(dir * (1.0 + alt), 1.0);
    gl_Position = projectionMatrix * mv;
    vGlow = smoothstep(-1.0, -0.4, t) * (1.0 - smoothstep(0.0, 0.6, t));
    gl_PointSize = vGlow > 0.0 ? pointPixels(0.004 * aP.w, mv, 1.5, 5.0) : 0.0;
    #include <logdepthbuf_vertex>
  }
`;

const reentryFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uOpacity;
  varying float vGlow;
  void main() {
    #include <logdepthbuf_fragment>
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5 || vGlow <= 0.0) discard;
    float core = 1.0 - smoothstep(0.0, 0.5, r);
    gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * core * vGlow * uOpacity * 1.6, 1.0);
    #include <colorspace_fragment>
  }
`;

export function Reentry({ run, geo, strength }) {
  const lowQuality = useSim((s) => s.quality === "low");
  const points = useRef();
  const count = lowQuality ? 700 : 2000;
  const geometry = useMemo(() => {
    const rand = mulberry32(run.id * 104729 + 3);
    return pointsGeometry(count, (d, k) => {
      // More of it lands nearer the impact.
      const theta = Math.acos(1 - 2 * rand() ** 0.7);
      d[k] = theta;
      d[k + 1] = rand() * Math.PI * 2;
      d[k + 2] = reentrySeconds(theta) * (0.85 + rand() * 0.3);
      d[k + 3] = 0.6 + rand() * 0.8;
    });
  }, [run.id, count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uUp: { value: new Vector3().copy(geo.frame.up) },
      uEast: { value: new Vector3().copy(geo.frame.east) },
      uNorth: { value: new Vector3().copy(geo.frame.north) },
      uTime: { value: 0 },
      uViewH: { value: 800 },
      uOpacity: { value: strength },
    }),
    [geo, strength],
  );

  useFrame(({ size, gl }) => {
    if (!points.current) return;
    const done = useSim.getState().phase === "done";
    const s = simulatedSeconds(clock.t, run);
    const show = !done && clock.t >= APPROACH_SECONDS && s > 300 && s < reentrySeconds(Math.PI) * 1.3;
    points.current.visible = show;
    if (!show) return;
    uniforms.uTime.value = s;
    uniforms.uViewH.value = size.height * gl.getPixelRatio();
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} raycast={() => null} visible={false}>
      <shaderMaterial
        args={[{ vertexShader: reentryVertex, fragmentShader: reentryFragment, uniforms }]}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
