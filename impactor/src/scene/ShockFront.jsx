// The air-blast front as a 3D wall: a translucent shell racing outward over
// the ground at the speed the model gives (shockRadiusM), bright where you see
// it edge-on, with a skirt of dust kicked up along its base. It hugs the
// Earth's curvature and stops at the top of the atmosphere. Its look is
// illustrative; its radius is the model's.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, DoubleSide, Vector3 } from "three";
import { useSim } from "../store.js";
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { outermostRadiusM } from "../physics/zones.js";
import { APPROACH_SECONDS, clock, shockRadiusM } from "./timeline.js";

const TOP_M = 50000; // the front's height is capped at roughly the top of the atmosphere

function shellGeometry(around, up) {
  const cols = around + 1;
  const grid = new Float32Array(cols * (up + 1) * 2);
  for (let j = 0; j <= up; j++) {
    for (let i = 0; i <= around; i++) {
      const k = (j * cols + i) * 2;
      grid[k] = (i / around) * Math.PI * 2;
      grid[k + 1] = (j / up) ** 1.6; // rows packed toward the ground, where the skirt is
    }
  }
  const index = [];
  for (let j = 0; j < up; j++) {
    for (let i = 0; i < around; i++) {
      const a = j * cols + i;
      index.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(cols * (up + 1) * 3), 3));
  geometry.setAttribute("aGrid", new BufferAttribute(grid, 2));
  geometry.setIndex(index);
  return geometry;
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec2 aGrid; // azimuth, 0 at the ground .. 1 at the top
  uniform vec3 uUp;
  uniform vec3 uEast;
  uniform vec3 uNorth;
  uniform float uTheta;  // angular radius of the front
  uniform float uHeight; // Earth radii
  varying vec3 vLocal;
  varying vec3 vPosW;
  varying float vRise;
  void main() {
    float a = aGrid.y * 1.5707963;
    float theta = uTheta * cos(a);
    float h = uHeight * sin(a);
    vec3 radial = cos(aGrid.x) * uEast + sin(aGrid.x) * uNorth;
    float hs = sin(0.5 * theta);
    float cm1 = -2.0 * hs * hs; // cos(theta) - 1, precise for small fronts
    vec3 dir = uUp * (1.0 + cm1) + radial * sin(theta);
    // Relative to the impact point (the mesh origin), so small fronts stay precise.
    vec3 local = uUp * cm1 + radial * sin(theta) + dir * h;
    vLocal = local;
    vPosW = (modelMatrix * vec4(local, 1.0)).xyz;
    vRise = aGrid.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uOpacity;
  uniform float uDay;
  varying vec3 vLocal;
  varying vec3 vPosW;
  varying float vRise;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(cross(dFdx(vLocal), dFdy(vLocal)));
    vec3 view = normalize(cameraPosition - vPosW);
    // Compressed air bends light: the shell shows mostly where seen edge-on.
    float edge = pow(1.0 - abs(dot(n, view)), 3.0);
    float skirt = exp(-vRise * 7.0);
    vec3 air = vec3(0.85, 0.9, 1.0) * (0.5 + 0.9 * uDay);
    vec3 dust = vec3(0.55, 0.47, 0.39) * (0.15 + 0.85 * uDay);
    float alphaAir = 0.32 * edge * (1.0 - 0.7 * vRise);
    float alphaDust = 0.55 * skirt;
    float alpha = clamp(alphaAir + alphaDust, 0.0, 1.0) * uOpacity;
    if (alpha < 0.003) discard;
    vec3 color = (air * alphaAir + dust * alphaDust) / max(alphaAir + alphaDust, 1e-4);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export default function ShockFront({ run, geo, sunDir }) {
  const lowQuality = useSim((s) => s.quality === "low");
  const mesh = useRef();
  const geometry = useMemo(() => (lowQuality ? shellGeometry(96, 10) : shellGeometry(192, 16)), [lowQuality]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const outerM = useMemo(() => outermostRadiusM(run.result), [run]);
  // Starts once it is clear of the fireball, so it seems to burst out of it.
  const startM = useMemo(() => Math.max(run.result.fireballRadiusM ?? 0, 300) * 0.8, [run]);

  const uniforms = useMemo(
    () => ({
      uUp: { value: new Vector3().copy(geo.frame.up) },
      uEast: { value: new Vector3().copy(geo.frame.east) },
      uNorth: { value: new Vector3().copy(geo.frame.north) },
      uTheta: { value: 0 },
      uHeight: { value: 0 },
      uOpacity: { value: 0 },
      uDay: { value: smooth(-0.2, 0.25, sunDir.clone().normalize().dot(geo.frame.up)) },
    }),
    [geo, sunDir],
  );

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const done = useSim.getState().phase === "done";
    const front = clock.t >= APPROACH_SECONDS && !done ? shockRadiusM(clock.t, run) : 0;
    const opacity = smooth(startM, startM * 1.6, front) * (1 - smooth(outerM * 0.85, outerM * 1.05, front));
    m.visible = opacity > 0.002;
    if (!m.visible) return;
    uniforms.uTheta.value = front / EARTH_RADIUS_M;
    uniforms.uHeight.value = Math.min(front * 0.5, TOP_M) / EARTH_RADIUS_M;
    uniforms.uOpacity.value = opacity;
  });

  return (
    <mesh
      ref={mesh}
      position={geo.center}
      geometry={geometry}
      frustumCulled={false}
      raycast={() => null}
      visible={false}
      renderOrder={4}
    >
      <shaderMaterial
        args={[{ vertexShader, fragmentShader, uniforms }]}
        transparent
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}
