// Wildfires as 3D objects standing on the ground: flickering flames and the
// smoke columns rising from them, scattered over land inside the model's
// third-degree-burn range (where the heat pulse sets vegetation alight). They
// catch as the heat arrives and keep burning to the end. Drawn much larger
// than real flames so they read from the air; placement and look are illustrative.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Vector3,
} from "three";
import { useSim } from "../store.js";
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { surfaceAt } from "../lib/world.js";
import { vectorToLatLon } from "./sphereMath.js";
import { APPROACH_SECONDS, clock } from "./timeline.js";
import { damageNoise, texNoiseShader } from "./damageOverlay.js";

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

/** Ground points for `count` fires on land between `innerM` and `outerM` from the impact. */
function firePoints(geo, innerM, outerM, count, seed) {
  const rand = mulberry32(seed);
  const { up, east, north } = geo.frame;
  const points = [];
  const dir = new Vector3();
  for (let tries = 0; points.length < count && tries < count * 8; tries++) {
    // Uniform over the ring's area.
    const r = Math.sqrt(innerM ** 2 + rand() * (outerM ** 2 - innerM ** 2)) / EARTH_RADIUS_M;
    const az = rand() * Math.PI * 2;
    dir
      .copy(up)
      .multiplyScalar(Math.cos(r))
      .addScaledVector(east, Math.sin(r) * Math.cos(az))
      .addScaledVector(north, Math.sin(r) * Math.sin(az));
    const { lat, lon } = vectorToLatLon(dir);
    if (surfaceAt(lat, lon) !== "land") continue;
    points.push({ dir: dir.clone(), seed: rand(), size: 0.6 + rand() * 0.8, delay: rand() });
  }
  return points;
}

function quadGeometry(points, perPoint) {
  const g = new InstancedBufferGeometry();
  g.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), 3),
  );
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const base = new Float32Array(points.length * perPoint * 3);
  const info = new Float32Array(points.length * perPoint * 4);
  points.forEach((p, i) => {
    for (let k = 0; k < perPoint; k++) {
      const j = i * perPoint + k;
      base.set([p.dir.x, p.dir.y, p.dir.z], j * 3);
      info.set([p.seed, p.size, p.delay, k / perPoint], j * 4);
    }
  });
  g.setAttribute("aBase", new InstancedBufferAttribute(base, 3));
  g.setAttribute("aInfo", new InstancedBufferAttribute(info, 4));
  g.instanceCount = points.length * perPoint;
  return g;
}

// Billboards that stay upright on the ground and turn to face the camera.
const billboardGlsl = /* glsl */ `
  attribute vec3 aBase;  // ground direction (unit sphere)
  attribute vec4 aInfo;  // seed, size, ignition delay, puff phase
  uniform vec3 uCenter;  // the impact point, the mesh origin
  uniform float uSize;   // Earth radii
  uniform float uTime;   // playback seconds since impact
  vec4 billboard(vec3 lift, float halfWidth, float height, out vec3 worldPos) {
    vec3 up = normalize(aBase);
    vec3 local = (aBase - uCenter) + lift;
    worldPos = (modelMatrix * vec4(local, 1.0)).xyz;
    vec3 toCam = normalize(cameraPosition - worldPos);
    vec3 side = cross(up, toCam);
    side = length(side) > 1e-5 ? normalize(side) : vec3(1.0, 0.0, 0.0);
    local += side * position.x * halfWidth + up * position.y * height;
    return projectionMatrix * modelViewMatrix * vec4(local, 1.0);
  }
`;

const flameVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  ${billboardGlsl}
  varying vec2 vUv;
  varying float vSeed;
  varying float vLife;
  void main() {
    float life = smoothstep(0.0, 1.0, (uTime - 0.6 - aInfo.z * 2.5) / 1.2);
    float s = uSize * aInfo.y * life;
    vec3 worldPos;
    gl_Position = billboard(vec3(0.0), s * 0.55, s * 1.6, worldPos);
    vUv = position.xy;
    vSeed = aInfo.x;
    vLife = life;
    #include <logdepthbuf_vertex>
  }
`;

const flameFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  ${texNoiseShader}
  uniform float uTime;
  varying vec2 vUv;
  varying float vSeed;
  varying float vLife;
  void main() {
    #include <logdepthbuf_fragment>
    if (vLife <= 0.0) discard;
    // Licking tongues of flame: noise scrolling upward bends and breaks up a
    // teardrop that is widest a little above the ground.
    float y = vUv.y;
    float n = nb(vec3(vUv.x * 0.5 + vSeed * 7.0, y * 0.6 - uTime * 0.8, vSeed * 3.0));
    float x = vUv.x + (n - 0.6) * 0.6 * y;
    float width = pow(1.0 - y, 0.7) * smoothstep(0.0, 0.18, y + 0.06) * (0.6 + 0.4 * n);
    float body = (1.0 - smoothstep(width * 0.35, width, abs(x))) * (1.0 - smoothstep(0.45, 1.0, y + (1.0 - n) * 0.4));
    if (body <= 0.01) discard;
    float core = body * (1.0 - smoothstep(0.0, 0.6, y));
    vec3 color = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.62, 0.18), core);
    gl_FragColor = vec4(color * body * 1.5, 1.0);
    #include <colorspace_fragment>
  }
`;

const smokeVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  ${billboardGlsl}
  uniform vec3 uWind;    // drift direction along the ground
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    float life = smoothstep(0.0, 1.0, (uTime - 0.9 - aInfo.z * 2.5) / 1.5);
    // Each puff rises, spreads and fades, then starts again at the bottom.
    float age = fract(uTime * 0.12 + aInfo.w + aInfo.x);
    float s = uSize * aInfo.y;
    vec3 up = normalize(aBase);
    vec3 lift = up * s * (0.8 + age * 9.0) + uWind * s * age * age * 5.0;
    float radius = s * (0.9 + age * 2.6) * life;
    vec3 worldPos;
    gl_Position = billboard(lift - up * radius, radius, radius * 2.0, worldPos);
    vUv = position.xy;
    vAlpha = life * smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.55, 1.0, age));
    vSeed = aInfo.x + aInfo.w;
    #include <logdepthbuf_vertex>
  }
`;

const smokeFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  ${texNoiseShader}
  uniform float uDay;
  uniform float uTime;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 c = vec2(vUv.x, vUv.y * 2.0 - 1.0);
    float r = length(c);
    float n = nb(vec3(c * 0.5 + vSeed * 5.0, uTime * 0.03));
    float shape = smoothstep(1.0, 0.35, r + (0.6 - n) * 0.5);
    if (shape * vAlpha <= 0.004) discard;
    // Lit like a ball of smoke: brighter on top, glowing from the fire beneath.
    float top = 0.5 + 0.5 * c.y;
    vec3 color = vec3(0.16, 0.15, 0.14) * (0.3 + 1.1 * uDay * top) + vec3(0.5, 0.15, 0.03) * (1.0 - top) * 0.6;
    gl_FragColor = vec4(color, shape * vAlpha * 0.8);
    #include <colorspace_fragment>
  }
`;

export default function Fires({ run, geo, firesM, innerM, sunDir }) {
  const lowQuality = useSim((s) => s.quality === "low");
  const flames = useRef();
  const smoke = useRef();
  const doneAt = useRef(null);
  const count = lowQuality ? 90 : 260;
  const points = useMemo(
    () => (firesM > innerM * 1.2 ? firePoints(geo, innerM, firesM * 0.92, count, run.id * 4241 + 3) : []),
    [geo, innerM, firesM, count, run.id],
  );
  const flameGeometry = useMemo(() => quadGeometry(points, 1), [points]);
  const smokeGeometry = useMemo(() => quadGeometry(points, lowQuality ? 2 : 3), [points, lowQuality]);
  useEffect(
    () => () => {
      flameGeometry.dispose();
      smokeGeometry.dispose();
    },
    [flameGeometry, smokeGeometry],
  );

  const uniforms = useMemo(() => {
    // Big enough to see from the air, small next to the burning area.
    const sizeM = Math.min(Math.max(firesM * 0.006, 150), 6000);
    const wind = new Vector3()
      .copy(geo.frame.east)
      .multiplyScalar(0.8)
      .addScaledVector(geo.frame.north, 0.3)
      .normalize();
    return {
      ...damageNoise,
      uCenter: { value: geo.center.clone() },
      uSize: { value: sizeM / EARTH_RADIUS_M },
      uTime: { value: 0 },
      uWind: { value: wind },
      uDay: { value: Math.min(1, Math.max(0, (sunDir.clone().normalize().dot(geo.frame.up) + 0.15) / 0.4)) },
    };
  }, [geo, firesM, sunDir]);

  useFrame(() => {
    const done = useSim.getState().phase === "done";
    const tau = clock.t - APPROACH_SECONDS;
    const show = done || tau > 0;
    if (flames.current) flames.current.visible = show;
    if (smoke.current) smoke.current.visible = show;
    // Once the run is over they keep burning, in real time.
    const now = performance.now() / 1000;
    if (!done) doneAt.current = null;
    else doneAt.current ??= now;
    uniforms.uTime.value = done ? 10 + now - doneAt.current : tau;
  });

  if (points.length === 0) return null;
  return (
    <group position={geo.center}>
      <mesh
        ref={smoke}
        geometry={smokeGeometry}
        frustumCulled={false}
        raycast={() => null}
        visible={false}
        renderOrder={2}
      >
        <shaderMaterial
          args={[{ vertexShader: smokeVertex, fragmentShader: smokeFragment, uniforms }]}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={flames}
        geometry={flameGeometry}
        frustumCulled={false}
        raycast={() => null}
        visible={false}
        renderOrder={3}
      >
        <shaderMaterial
          args={[{ vertexShader: flameVertex, fragmentShader: flameFragment, uniforms }]}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
