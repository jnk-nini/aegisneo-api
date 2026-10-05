// Debris thrown out on ballistic arcs, drawn as glowing streaks. Small impacts
// throw a burst of hot debris around the crater; the largest throw it out of
// the atmosphere and halfway round the planet, where it glows again as it
// falls back in. Ranges and flight times follow 45° ballistic flight scaled
// by the impact's energy (severity); counts and look are illustrative.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Vector2,
  Vector3,
} from "three";
import { useSim } from "../store.js";
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { arc, debrisReachM } from "./impactVisuals.js";
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

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec2 aCorner;  // x: 0 tail .. 1 head; y: -1 .. 1 across
  attribute vec4 aFlight;  // range (rad), azimuth, flight time (s), launch time (s)
  attribute vec2 aLook;    // apex height (Earth radii), width scale
  uniform vec3 uUp;
  uniform vec3 uEast;
  uniform vec3 uNorth;
  uniform float uTime;
  uniform vec2 uViewport;
  uniform float uWidth;     // px
  varying float vHeat;
  varying float vAlong;
  varying float vAcross;
  varying float vAlive;

  vec3 along(float s) {
    float theta = aFlight.x * s;
    float h = aLook.x * 4.0 * s * (1.0 - s);
    vec3 radial = cos(aFlight.y) * uEast + sin(aFlight.y) * uNorth;
    float hs = sin(0.5 * theta);
    float cm1 = -2.0 * hs * hs;
    vec3 dir = uUp * (1.0 + cm1) + radial * sin(theta);
    return uUp * cm1 + radial * sin(theta) + dir * h; // relative to the impact point
  }

  void main() {
    float s = (uTime - aFlight.w) / aFlight.z;
    vAlive = step(0.0, s) * step(s, 1.0);
    s = clamp(s, 0.0, 1.0);
    float tail = max(0.0, s - 0.05);
    vec4 head = projectionMatrix * modelViewMatrix * vec4(along(s), 1.0);
    vec4 back = projectionMatrix * modelViewMatrix * vec4(along(tail), 1.0);
    vec4 here = mix(back, head, aCorner.x);
    // Widen the segment across the screen, a few pixels thick.
    vec2 a = back.xy / max(back.w, 1e-9);
    vec2 b = head.xy / max(head.w, 1e-9);
    vec2 d = (b - a) * uViewport;
    vec2 side = length(d) > 1e-4 ? normalize(vec2(-d.y, d.x)) : vec2(0.0, 1.0);
    float width = uWidth * aLook.y * mix(0.4, 1.0, aCorner.x);
    here.xy += side * aCorner.y * width / uViewport * 2.0 * here.w;
    gl_Position = vAlive > 0.0 ? here : vec4(0.0, 0.0, -2.0, 1.0);
    // White-hot when thrown, cooling in flight; glowing again on the way back
    // in through the atmosphere if it went high enough.
    float launchHeat = 1.0 - smoothstep(0.0, 0.45, s);
    float reentry = step(0.012, aLook.x) * smoothstep(0.8, 0.96, s) * (1.0 - smoothstep(0.985, 1.0, s));
    vHeat = max(launchHeat, reentry);
    vAlong = aCorner.x;
    vAcross = aCorner.y;
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uDay;
  uniform float uSpray;
  varying float vHeat;
  varying float vAlong;
  varying float vAcross;
  varying float vAlive;
  void main() {
    #include <logdepthbuf_fragment>
    if (vAlive <= 0.0) discard;
    float core = (1.0 - vAcross * vAcross) * (0.25 + 0.75 * vAlong);
    vec3 hot = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.8, 0.5), smoothstep(0.5, 1.0, vHeat));
    vec3 color = hot * vHeat * vHeat * 3.0;
    // Cooled rock still shows as a dusty trail in daylight.
    color += vec3(0.35, 0.32, 0.3) * uDay * 0.35 * (1.0 - vHeat);
    color = mix(color, vec3(0.75, 0.85, 0.95) * (0.4 + 0.8 * uDay), uSpray);
    gl_FragColor = vec4(color * core, 1.0);
    #include <colorspace_fragment>
  }
`;

export default function Debris({ run, geo, visual, severity, sunDir }) {
  const lowQuality = useSim((s) => s.quality === "low");
  const mesh = useRef();
  const water = visual.kind === "water";
  const reachM = useMemo(() => debrisReachM(visual.patchRadiusM, severity), [visual, severity]);
  const count = Math.round((lowQuality ? 120 : 260) + severity * (lowQuality ? 800 : 2400));

  const geometry = useMemo(() => {
    const rand = mulberry32(run.id * 92821 + 7);
    const g = new InstancedBufferGeometry();
    // Two triangles from tail to head.
    g.setAttribute("aCorner", new BufferAttribute(new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), 2));
    g.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const flight = new Float32Array(count * 4);
    const look = new Float32Array(count * 2);
    const E = Math.max(visual.excavationSeconds, 0.05);
    for (let i = 0; i < count; i++) {
      // Most debris falls close in; a long tail of it goes far.
      const rangeM = reachM * (0.04 + 0.96 * rand() ** 2.2);
      const { seconds, apexM } = arc(rangeM);
      flight.set(
        [rangeM / EARTH_RADIUS_M, rand() * Math.PI * 2, seconds * (0.85 + rand() * 0.3), E * rand() ** 2],
        i * 4,
      );
      look.set([apexM / EARTH_RADIUS_M, 0.6 + rand() * 0.8], i * 2);
    }
    g.setAttribute("aFlight", new InstancedBufferAttribute(flight, 4));
    g.setAttribute("aLook", new InstancedBufferAttribute(look, 2));
    g.instanceCount = count;
    return g;
  }, [run.id, count, reachM, visual]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uUp: { value: new Vector3().copy(geo.frame.up) },
      uEast: { value: new Vector3().copy(geo.frame.east) },
      uNorth: { value: new Vector3().copy(geo.frame.north) },
      uTime: { value: 0 },
      uViewport: { value: new Vector2(800, 600) },
      uWidth: { value: lowQuality ? 2.2 : 2.8 },
      uDay: { value: Math.min(1, Math.max(0, (sunDir.clone().normalize().dot(geo.frame.up) + 0.15) / 0.4)) },
      uSpray: { value: water ? 1 : 0 },
    }),
    [geo, sunDir, water, lowQuality],
  );
  const lastsUntil = useMemo(() => {
    const longest = arc(reachM).seconds * 1.15;
    return Math.max(visual.excavationSeconds, 0.05) + longest;
  }, [reachM, visual]);

  useFrame(({ size, gl }) => {
    if (!mesh.current) return;
    const done = useSim.getState().phase === "done";
    const s = simulatedSeconds(clock.t, run);
    const show = !done && clock.t >= APPROACH_SECONDS && s < lastsUntil;
    mesh.current.visible = show;
    if (!show) return;
    uniforms.uTime.value = s;
    const ratio = gl.getPixelRatio();
    uniforms.uViewport.value.set(size.width * ratio, size.height * ratio);
  });

  return (
    <mesh
      ref={mesh}
      position={geo.center}
      geometry={geometry}
      frustumCulled={false}
      raycast={() => null}
      visible={false}
    >
      <shaderMaterial
        args={[{ vertexShader, fragmentShader, uniforms }]}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}
