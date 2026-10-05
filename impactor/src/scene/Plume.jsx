// Fireball and mushroom cloud, drawn as a real 3D volume: every pixel marches
// a ray through a density field (a fireball that rises and rolls out into a
// toroidal cap over a flaring stem, plus a base surge along the ground) carved
// by 3D noise. Each sample is lit by the sun with self-shadowing, by the sky,
// and by the fire inside it, and glows by its own heat. Its size comes from the
// model's fireball radius (Eq. 32); the plume's height, timing and shape are
// illustrative.
//
// Ray marching is the expensive part, so the volume is drawn into its own
// buffer at a fraction of the screen resolution (smoke is soft; it doesn't
// show) and then laid over the scene. Rays stop at the ejecta rocks, whose
// distances are drawn first into a matching small buffer, so rocks in front of
// the cloud stay in front and rocks behind it are hidden.
import { useEffect, useMemo, useRef } from "react";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import {
  BackSide,
  BoxGeometry,
  Color,
  FrontSide,
  HalfFloatType,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from "three";
import { useSim } from "../store.js";
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { APPROACH_SECONDS, clock, shockRadiusM } from "./timeline.js";
import { noiseVolume } from "./noiseVolume.js";
import { setImpactLight } from "./damageOverlay.js";
import { fireColor, plumeState, ROCK_LAYER, rockDistancePass } from "./plumeModel.js";

const Y_AXIS = new Vector3(0, 1, 0);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Half-width and height range of the box the rays march through, in fireball radii.
const HALF_WIDTH = 3.3;
const BOTTOM = -0.6;

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  precision highp sampler3D;
  uniform sampler3D uNoise;
  uniform vec3 uCam;      // camera, object space (fireball radii)
  uniform float uInside;  // 1 when the camera is inside the box
  uniform vec3 uSun;      // direction to the sun, object space
  uniform vec3 uSunColor;
  uniform float uDay;     // sunlight reaching the site, 0..1
  uniform vec4 uEarth;    // Earth's centre (object space), |c|² − R²
  uniform vec3 uBoxMin;
  uniform vec3 uBoxMax;
  uniform float uTime;    // playback seconds since impact
  uniform vec4 uCap;      // height, torus radius, tube radius, heat
  uniform vec4 uStem;     // radius, surge radius, surge thickness, ground heat
  uniform float uOpacity;
  uniform vec3 uAlbedo;   // dusty smoke over land, white steam and spray over water
  uniform sampler2D uRocks; // distance to the nearest ejecta rock per pixel (0 = none)
  uniform vec2 uViewport;   // size of the buffers, px
  uniform float uScale;     // Earth radii per object unit
  varying vec3 vPos;

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }
  float sdTorus(vec3 p, float big, float small, float squash) {
    vec2 q = vec2(length(p.xz) - big, p.y / squash);
    return length(q) - small;
  }
  float remap(float v, float a, float b) {
    return clamp((v - a) / max(b - a, 1e-4), 0.0, 1.0);
  }

  // Distance to the cap (a rising fireball rolling out into a torus).
  float capSd(vec3 p) {
    vec3 c = p - vec3(0.0, uCap.x, 0.0);
    float ring = sdTorus(c, uCap.y, uCap.z, 0.78);
    float dome = length(c * vec3(1.0, 1.5, 1.0)) - (uCap.y * 0.75 + uCap.z * 0.85);
    return smin(ring, dome, 0.35);
  }

  // Signed distance to the whole cloud, in fireball radii.
  float shapeSd(vec3 p, out float cap) {
    cap = capSd(p);
    float d = cap;
    if (uStem.x > 0.0) {
      float flare = uStem.x * (1.0 + 1.7 * exp(-max(p.y, 0.0) / 0.35));
      float stem = max(length(p.xz) - flare, max(-p.y - 0.3, p.y - uCap.x));
      d = smin(d, stem, 0.45);
    }
    if (uStem.z > 0.0) {
      d = min(d, sdTorus(p - vec3(0.0, uStem.z * 0.5, 0.0), uStem.y, uStem.z, 0.5));
    }
    return d;
  }

  float coverage(float d) {
    return clamp(0.5 - d / 0.45, 0.0, 1.0);
  }

  // Noise coordinates: drifting upward with the rising cloud.
  vec3 flow(vec3 p) {
    return p - vec3(0.0, uTime * 0.22, 0.0);
  }

  // Large billows only: shape carved by two scales of the base noise. "big" is
  // the coarse noise on its own, reused for the fireball's hot and cool cells.
  float billows(vec3 q, float shape, out float big) {
    big = texture(uNoise, q * 0.55 + vec3(0.0, 0.0, uTime * 0.015)).r;
    float n = big * 0.65 + texture(uNoise, q * 1.3 + 0.37).r * 0.35;
    return remap(n, 1.0 - shape, 1.0);
  }

  // Density (0..1) and temperature (0..1) at p.
  float density(vec3 p, out float heat) {
    heat = 0.0;
    float cap;
    float d = shapeSd(p, cap);
    if (d > 0.3) return 0.0;
    vec3 q = flow(p);
    float shape = coverage(d);
    float big;
    float dens = billows(q, shape, big);
    // Erode the edges into wisps with the fine cellular noise.
    float detail = texture(uNoise, q * 3.1 - vec3(uTime * 0.05)).g;
    dens = remap(dens, detail * 0.32, 1.0);
    // Hottest deep inside, with hot and cooler cells churning through it, so
    // the fireball boils between yellow-white, orange and dark-red folds. The
    // ground stays hot low down for a while too.
    float core = clamp(-cap / max(uCap.z, 0.05), 0.0, 1.0);
    heat = uCap.w * (0.6 + 0.4 * sqrt(core)) * (0.3 + 0.95 * smoothstep(0.2, 0.85, big));
    heat = max(heat, uStem.w * exp(-max(p.y, 0.0) / 0.45) * shape * 0.8);
    return sqrt(dens);
  }

  // Density as the sunlight sees it: billows close by (so each lump shades the
  // next), the overall shape farther out.
  float lightDensity(vec3 p) {
    float cap;
    float shape = coverage(shapeSd(p, cap));
    if (shape <= 0.0) return 0.0;
    float n = texture(uNoise, flow(p) * 0.55 + vec3(0.0, 0.0, uTime * 0.015)).r;
    return remap(n, 1.0 - shape, 1.0);
  }

  float sunTransmittance(vec3 p) {
    float cap;
    float od = lightDensity(p + uSun * 0.1) * 0.1
      + lightDensity(p + uSun * 0.3) * 0.2
      + coverage(shapeSd(p + uSun * 0.75, cap)) * 0.45
      + coverage(shapeSd(p + uSun * 1.6, cap)) * 0.85;
    #if STEPS > 64
    od += coverage(shapeSd(p + uSun * 2.8, cap)) * 1.2;
    #endif
    return exp(-od * 5.0);
  }

  vec3 fireColor(float t) {
    vec3 c = mix(vec3(0.5, 0.03, 0.0), vec3(1.0, 0.25, 0.03), smoothstep(0.0, 0.4, t));
    c = mix(c, vec3(1.0, 0.55, 0.15), smoothstep(0.4, 0.75, t));
    return mix(c, vec3(1.0, 0.85, 0.55), smoothstep(0.75, 1.0, t));
  }

  // Where the ray (o, d) first hits the Earth ahead, or a large number.
  float earthHit(vec3 o, vec3 d) {
    vec3 c = uEarth.xyz;
    float cc = dot(o, o) - 2.0 * dot(o, c) + uEarth.w;
    if (cc <= 0.0) return -1.0; // starts underground
    float b = dot(o, d) - dot(c, d);
    float disc = b * b - cc;
    if (b >= 0.0 || disc <= 0.0) return 1e9;
    return cc / (-b + sqrt(disc)); // stable form of the near root
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 rd = normalize(vPos - uCam);
    // Outside the box: start where the ray enters (this fragment). Inside: at the camera.
    vec3 o = uInside > 0.5 ? uCam : vPos;
    vec3 t0 = (uBoxMin - o) / rd;
    vec3 t1 = (uBoxMax - o) / rd;
    vec3 tFar = max(t0, t1);
    float len = min(min(tFar.x, tFar.y), tFar.z);
    float ground = earthHit(o, rd);
    if (ground < 0.0) discard;
    len = min(len, ground);
    // Outside the box, the Earth may also lie between the camera and the box.
    float entry = 0.0;
    if (uInside < 0.5) {
      entry = length(vPos - uCam);
      float before = earthHit(uCam, rd);
      if (before > 0.0 && before < entry) discard;
    }
    // Stop at the nearest ejecta rock in this pixel.
    float rock = texture(uRocks, gl_FragCoord.xy / uViewport).r;
    if (rock > 0.0) len = min(len, rock / uScale - entry);
    if (len <= 0.0) discard;

    // Short fixed steps inside the cloud (it is optically thick, so a ray rarely
    // needs many before it is used up); empty space is skipped quickly below.
    float stepLen = max(STEP_SIZE, len / float(STEPS * 4));
    // Jitter the start per pixel so the fixed steps don't show as bands.
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float t = stepLen * jitter;
    float mu = dot(rd, uSun);
    float phase = 0.55 + 1.4 * (1.0 - 0.35 * 0.35) / pow(1.0 + 0.35 * 0.35 - 0.7 * mu, 1.5) / 4.0;
    vec3 sky = mix(vec3(0.035, 0.03, 0.03), vec3(0.3, 0.36, 0.46), uDay);
    vec3 albedo = uAlbedo;

    vec3 color = vec3(0.0);
    float trans = 1.0;
    for (int i = 0; i < STEPS; i++) {
      if (t > len || trans < 0.015) break;
      vec3 p = o + rd * t;
      float cap;
      float d = shapeSd(p, cap);
      if (d > 0.35) {
        // Empty space: skip ahead by whole steps, so the per-pixel jitter survives
        // (skipping to the surface itself lines every pixel up into bands).
        t += stepLen * max(1.0, floor((d - 0.3) / stepLen));
        continue;
      }
      float heat;
      float dens = density(p, heat);
      if (dens > 0.004) {
        float a = 1.0 - exp(-dens * 7.0 * stepLen);
        float height = clamp((p.y + 0.3) / (uCap.x + uCap.z + 0.3), 0.0, 1.0);
        // "Powder": thin edges facing the sun scatter less light back at us,
        // which is what draws the dark outlines between billows.
        float powder = 1.0 - exp(-dens * 5.0);
        vec3 light = uSunColor * uDay * sunTransmittance(p) * phase * (0.3 + 0.7 * powder) * 1.6;
        light += sky * (0.2 + 0.55 * height);
        // The fire inside lights the smoke around it from within and below.
        float near = exp(-max(cap, 0.0) * 2.0);
        light += fireColor(uCap.w) * uCap.w * uCap.w * near * 1.4;
        light += vec3(1.0, 0.4, 0.12) * uStem.w * exp(-max(p.y, 0.0) / 0.4) * 0.6;
        // Glowing gas is seen by its own light; reflected light only shows once it cools.
        vec3 sampleColor = albedo * light * (1.0 - 0.9 * smoothstep(0.1, 0.45, heat));
        // Kept within ~2.5x white so the colour survives; the bloom adds the glare.
        sampleColor += fireColor(heat) * heat * heat * (1.0 + 2.0 * heat);
        color += trans * a * sampleColor;
        trans *= 1.0 - a;
      }
      t += stepLen;
    }
    // Compress highlights without bleaching them: scale all channels together.
    float peak = max(color.r, max(color.g, color.b));
    if (peak > 1.0) color *= (1.0 + 0.6 * log(peak)) / peak;
    float alpha = (1.0 - trans) * uOpacity;
    if (alpha <= 0.002) discard;
    gl_FragColor = vec4(color * uOpacity, alpha);
    #include <colorspace_fragment>
  }
`;

export default function Plume({ run, geo, radiusM, sunDir }) {
  // Over the ocean most of the plume is steam: whiter, and much less fire.
  const water = run.params.surface === "water" && !geo.airburst;
  const lowQuality = useSim((s) => s.quality === "low");
  const gl = useThree((s) => s.gl);
  const mesh = useRef();
  const overlay = useRef();
  const pass = useVolumeBuffers(lowQuality ? 0.34 : 0.5);
  const L = radiusM / EARTH_RADIUS_M; // Earth radii per object unit
  // Tall enough to read as a column; the largest plumes leave the atmosphere.
  const topRE = Math.min(L * 4, Math.max(L * 1.6, 0.1));
  const topUnits = topRE / L;

  const quaternion = useMemo(() => new Quaternion().setFromUnitVectors(Y_AXIS, geo.frame.up), [geo]);
  const box = useMemo(() => {
    const top = topUnits + 1.4;
    const geometry = new BoxGeometry(HALF_WIDTH * 2, top - BOTTOM, HALF_WIDTH * 2);
    geometry.translate(0, (top + BOTTOM) / 2, 0);
    return {
      geometry,
      min: new Vector3(-HALF_WIDTH, BOTTOM, -HALF_WIDTH),
      max: new Vector3(HALF_WIDTH, top, HALF_WIDTH),
    };
  }, [topUnits]);
  useEffect(() => () => box.geometry.dispose(), [box]);

  const uniforms = useMemo(() => {
    const inverse = quaternion.clone().invert();
    const sun = sunDir.clone().normalize().applyQuaternion(inverse);
    // Earth's centre relative to the burst point, and |c|² − R² computed from the
    // burst altitude so it stays exact (both terms are huge in fireball radii).
    const centre = geo.end.clone().negate().applyQuaternion(inverse).divideScalar(L);
    const h = geo.end.length() - 1;
    const sunUp = sunDir.clone().normalize().dot(geo.frame.up);
    const warm = smooth(0, 0.4, sunUp);
    return {
      uNoise: { value: noiseVolume(gl) },
      uCam: { value: new Vector3() },
      uInside: { value: 0 },
      uSun: { value: sun },
      uSunColor: { value: new Vector3(1, 0.55 + 0.41 * warm, 0.3 + 0.6 * warm).multiplyScalar(1.05) },
      uDay: { value: smooth(-0.2, 0.25, sunUp) },
      uEarth: { value: new Vector4(centre.x, centre.y, centre.z, (h * (2 + h)) / (L * L)) },
      uBoxMin: { value: box.min },
      uBoxMax: { value: box.max },
      uTime: { value: 0 },
      uCap: { value: new Vector4() },
      uStem: { value: new Vector4() },
      uOpacity: { value: 0 },
      uAlbedo: { value: water ? new Vector3(0.8, 0.83, 0.86) : new Vector3(0.56, 0.51, 0.47) },
      uRocks: { value: pass.rocks.texture },
      uViewport: { value: pass.size },
      uScale: { value: L },
    };
  }, [gl, quaternion, sunDir, geo, L, box, water, pass]);
  // STEPS caps the samples per pixel; STEP_SIZE is the step inside the cloud (fireball radii).
  const defines = useMemo(
    () => (lowQuality ? { STEPS: 40, STEP_SIZE: "0.11" } : { STEPS: 80, STEP_SIZE: "0.06" }),
    [lowQuality],
  );

  const scratch = useMemo(
    () => ({ v: new Vector3(), inverse: quaternion.clone().invert(), color: new Vector3() }),
    [quaternion],
  );

  useFrame(({ camera, scene }) => {
    const m = mesh.current;
    if (!m || !overlay.current) return;
    const tau = clock.t - APPROACH_SECONDS;
    const done = useSim.getState().phase === "done";
    const state = plumeState(tau, topUnits, shockRadiusM(clock.t, run) / radiusM);
    const show = tau >= 0 && !done && state.opacity > 0;
    m.visible = show;
    overlay.current.visible = show;
    if (!show) {
      setImpactLight(scratch.v.set(0, 0, 0), 0, scratch.color.set(0, 0, 0), 0);
      return;
    }
    const u = uniforms;
    // Camera in object space, computed in double precision on the CPU.
    u.uCam.value.copy(camera.position).sub(geo.end).applyQuaternion(scratch.inverse).divideScalar(L);
    const c = u.uCam.value;
    const inside =
      c.x > box.min.x - 0.05 &&
      c.x < box.max.x + 0.05 &&
      c.y > box.min.y - 0.05 &&
      c.y < box.max.y + 0.05 &&
      c.z > box.min.z - 0.05 &&
      c.z < box.max.z + 0.05;
    u.uInside.value = inside ? 1 : 0;
    // Inside the box only its far faces are in front of us. Occlusion by the
    // Earth and the rocks is worked out in the shader.
    m.material.side = inside ? BackSide : FrontSide;
    u.uTime.value = tau;
    u.uCap.value.set(state.capY, state.capMajor, state.capMinor, state.heat * (water ? 0.55 : 1));
    // An airburst has no stem or base surge: the fireball forms high above the ground.
    if (geo.airburst) u.uStem.value.set(0, 0, 0, 0);
    else u.uStem.value.set(state.stem, state.surge, state.surgeThick, water ? 0 : state.groundHeat);
    u.uOpacity.value = state.opacity;

    // The fireball lights the ground around it.
    const glow = state.heat * state.heat + (geo.airburst ? 0 : 0.35 * state.groundHeat);
    scratch.v
      .set(0, state.capY * L, 0)
      .applyQuaternion(quaternion)
      .add(geo.end);
    fireColor(Math.max(state.heat, 0.3), scratch.color);
    setImpactLight(scratch.v, L * (1.2 + 1.2 * state.capMinor), scratch.color, glow * 2.2);

    pass.render(gl, scene, camera);
  });
  useEffect(() => () => setImpactLight(new Vector3(), 0, new Vector3(), 0), []);

  return (
    <>
      {createPortal(
        <group position={geo.end} quaternion={quaternion} scale={L}>
          <mesh ref={mesh} geometry={box.geometry} frustumCulled={false} raycast={() => null} visible={false}>
            <shaderMaterial
              key={lowQuality ? "low" : "high"}
              args={[{ vertexShader, fragmentShader, uniforms, defines }]}
              transparent
              premultipliedAlpha
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </group>,
        pass.scene,
      )}
      <mesh
        ref={overlay}
        geometry={FULL_SCREEN}
        frustumCulled={false}
        raycast={() => null}
        visible={false}
        renderOrder={5}
      >
        <shaderMaterial
          args={[
            { vertexShader: overlayVertex, fragmentShader: overlayFragment, uniforms: pass.overlayUniforms },
          ]}
          transparent
          premultipliedAlpha
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

const FULL_SCREEN = new PlaneGeometry(2, 2);

const overlayVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const overlayFragment = /* glsl */ `
  uniform sampler2D uVolume;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uVolume, vUv);
    if (c.a < 0.002) discard;
    gl_FragColor = c; // premultiplied, linear HDR
  }
`;

const CLEAR = new Color(0, 0, 0);

/**
 * The small buffers the volume is drawn into, and `render`, which fills them:
 * first each ejecta rock's distance, then the volume itself.
 */
function useVolumeBuffers(scale) {
  const pass = useMemo(() => {
    const options = { type: HalfFloatType, depthBuffer: false };
    const volume = new WebGLRenderTarget(1, 1, options);
    const rocks = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    const size = new Vector2(1, 1);
    const drawing = new Vector2();
    const previousClear = new Color();
    return {
      scene: new Scene(),
      volume,
      rocks,
      size,
      overlayUniforms: { uVolume: { value: volume.texture } },
      render(gl, scene, camera) {
        gl.getDrawingBufferSize(drawing);
        const w = Math.max(1, Math.round(drawing.x * scale));
        const h = Math.max(1, Math.round(drawing.y * scale));
        if (w !== size.x || h !== size.y) {
          size.set(w, h);
          volume.setSize(w, h);
          rocks.setSize(w, h);
        }
        const target = gl.getRenderTarget();
        const autoClear = gl.autoClear;
        const clearAlpha = gl.getClearAlpha();
        gl.getClearColor(previousClear);
        const background = scene.background;
        const layers = camera.layers.mask;
        gl.autoClear = false;
        gl.setClearColor(CLEAR, 0);

        // Rock distances (0 where there is none).
        gl.setRenderTarget(rocks);
        gl.clear(true, true, false);
        scene.background = null;
        camera.layers.set(ROCK_LAYER);
        rockDistancePass.value = 1;
        gl.render(scene, camera);
        rockDistancePass.value = 0;
        camera.layers.mask = layers;
        scene.background = background;

        // The volume.
        gl.setRenderTarget(volume);
        gl.clear(true, false, false);
        gl.render(this.scene, camera);

        gl.setRenderTarget(target);
        gl.setClearColor(previousClear, clearAlpha);
        gl.autoClear = autoClear;
      },
    };
  }, [scale]);
  useEffect(
    () => () => {
      pass.volume.dispose();
      pass.rocks.dispose();
    },
    [pass],
  );
  return pass;
}
