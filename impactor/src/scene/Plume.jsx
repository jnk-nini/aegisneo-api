// Fireball and rising plume: a hot core that grows to the model's fireball
// radius (Eq. 32), then a column of smoke and dust climbing and spreading into
// a mushroom cap. Drawn as camera-facing puffs placed by the vertex shader.
// The plume's height and shape are illustrative.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  Vector3,
} from "three";
import { useSim } from "../store.js";
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { APPROACH_SECONDS, clock } from "./timeline.js";
import { noiseShader } from "./surfaceShader.js";

function puffGeometry(count, seed) {
  const base = new PlaneGeometry(1, 1);
  const geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.getAttribute("position"));
  geometry.setAttribute("uv", base.getAttribute("uv"));
  let s = seed * 9301 + 49297;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4] = i / Math.max(1, count - 1); // place along the column, base to cap
    data[i * 4 + 1] = rand() * Math.PI * 2;
    data[i * 4 + 2] = rand();
    data[i * 4 + 3] = rand();
  }
  geometry.setAttribute("aSeed", new InstancedBufferAttribute(data, 4));
  geometry.instanceCount = count;
  return geometry;
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec4 aSeed;
  uniform vec3 uUp;
  uniform vec3 uEast;
  uniform vec3 uNorth;
  uniform float uRadius; // fireball radius, Earth radii
  uniform float uHeight; // current plume top, Earth radii
  uniform float uSpread; // cap growth, 0..1
  uniform float uCore;   // 1 for the glowing core, 0 for smoke
  varying vec2 vUv;
  varying vec4 vSeed;
  varying float vLevel;
  void main() {
    float k = aSeed.x;
    vec3 side = cos(aSeed.y) * uEast + sin(aSeed.y) * uNorth;
    vec3 center;
    float size;
    if (uCore > 0.5) {
      center = side * uRadius * 0.35 * aSeed.z + uUp * uRadius * 0.3 * aSeed.w;
      size = uRadius * (1.1 + 0.6 * aSeed.z);
    } else {
      // Puffs up the stem, the top third spreading outward into the cap.
      float h = uHeight * mix(0.1, 1.0, k) * (0.92 + 0.16 * aSeed.w);
      float cap = smoothstep(0.6, 1.0, k);
      float width = uRadius * (0.25 + 0.35 * aSeed.z) + cap * uSpread * uRadius * 2.2 * (0.3 + 0.7 * aSeed.w);
      center = uUp * h + side * width * mix(0.4, 1.0, cap);
      size = uRadius * (0.45 + 0.35 * aSeed.w) * (1.0 + cap * uSpread * 0.8);
    }
    vec4 mv = modelViewMatrix * vec4(center, 1.0);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
    vUv = uv;
    vSeed = aSeed;
    vLevel = k;
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  ${noiseShader}
  uniform float uCore;
  uniform float uHeat;    // 1 = white-hot, 0 = cold smoke
  uniform float uOpacity;
  uniform vec3 uSunDir;
  uniform vec3 uUp;
  varying vec2 vUv;
  varying vec4 vSeed;
  varying float vLevel;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float n = fbm(vec3(c * 3.0, vSeed.z * 10.0));
    float shape = 1.0 - smoothstep(0.35 + 0.35 * n, 1.0, r);
    if (shape <= 0.0) discard;
    if (uCore > 0.5) {
      vec3 hot = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.95, 0.82), smoothstep(0.4, 1.0, uHeat) * (1.0 - r));
      gl_FragColor = vec4(hot * shape * uOpacity * (0.6 + 0.6 * uHeat), 1.0);
    } else {
      // Dark smoke and dust, glowing orange low down while it is still hot.
      float lit = 0.35 + 0.65 * smoothstep(-0.2, 0.6, dot(uUp, uSunDir));
      vec3 smoke = vec3(0.22, 0.19, 0.17) * lit * (0.75 + 0.5 * n);
      smoke += vec3(1.0, 0.38, 0.08) * uHeat * (1.0 - vLevel) * 1.4;
      gl_FragColor = vec4(smoke, shape * shape * uOpacity * 0.7);
    }
    #include <colorspace_fragment>
  }
`;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export default function Plume({ run, geo, radiusM, sunDir }) {
  const lowQuality = useSim((s) => s.quality === "low");
  const core = useRef();
  const smoke = useRef();
  const radiusRE = radiusM / EARTH_RADIUS_M;
  // Tall enough to read as a column; the largest plumes leave the atmosphere.
  const topRE = Math.min(radiusRE * 4, Math.max(radiusRE * 1.6, 0.1));
  const coreGeometry = useMemo(() => puffGeometry(lowQuality ? 5 : 9, run.id), [run.id, lowQuality]);
  const smokeGeometry = useMemo(() => puffGeometry(lowQuality ? 16 : 40, run.id + 1), [run.id, lowQuality]);
  useEffect(
    () => () => {
      coreGeometry.dispose();
      smokeGeometry.dispose();
    },
    [coreGeometry, smokeGeometry],
  );

  const makeUniforms = (isCore) => ({
    uUp: { value: new Vector3().copy(geo.frame.up) },
    uEast: { value: new Vector3().copy(geo.frame.east) },
    uNorth: { value: new Vector3().copy(geo.frame.north) },
    uRadius: { value: radiusRE },
    uHeight: { value: 0 },
    uSpread: { value: 0 },
    uCore: { value: isCore ? 1 : 0 },
    uHeat: { value: 1 },
    uOpacity: { value: 0 },
    uSunDir: { value: sunDir.clone().normalize() },
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const coreUniforms = useMemo(() => makeUniforms(true), [geo, radiusRE, sunDir]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const smokeUniforms = useMemo(() => makeUniforms(false), [geo, radiusRE, sunDir]);
  const defines = useMemo(() => ({ NOISE_OCTAVES: lowQuality ? 2 : 3 }), [lowQuality]);

  useFrame(() => {
    // Playback seconds since impact: this is about what the eye can follow.
    const tau = clock.t - APPROACH_SECONDS;
    const done = useSim.getState().phase === "done";
    const active = tau >= 0 && !done;
    if (core.current) {
      const fade = 1 - smooth(1.4, 3.4, tau);
      core.current.visible = active && fade > 0;
      coreUniforms.uRadius.value = radiusRE * (0.3 + 0.7 * smooth(0, 0.9, tau));
      coreUniforms.uHeat.value = 1 - smooth(0.4, 2.4, tau);
      coreUniforms.uOpacity.value = fade;
    }
    if (smoke.current) {
      const fade = 1 - smooth(6.5, 9.5, tau);
      smoke.current.visible = active && tau > 0.3 && fade > 0;
      smokeUniforms.uHeight.value = topRE * (1 - Math.exp(-Math.max(0, tau - 0.3) / 1.8));
      smokeUniforms.uSpread.value = smooth(1.2, 5, tau);
      smokeUniforms.uHeat.value = 1 - smooth(0.5, 3, tau);
      smokeUniforms.uOpacity.value = smooth(0.3, 1.0, tau) * fade;
    }
  });

  return (
    <group position={geo.end}>
      <mesh ref={smoke} geometry={smokeGeometry} frustumCulled={false} raycast={() => null} visible={false}>
        <shaderMaterial
          key={lowQuality ? "low" : "high"}
          args={[{ vertexShader, fragmentShader, uniforms: smokeUniforms, defines }]}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh ref={core} geometry={coreGeometry} frustumCulled={false} raycast={() => null} visible={false}>
        <shaderMaterial
          key={lowQuality ? "low" : "high"}
          args={[{ vertexShader, fragmentShader, uniforms: coreUniforms, defines }]}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
