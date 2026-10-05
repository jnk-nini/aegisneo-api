// A small tileable 3D noise texture for the volumetric fireball and smoke.
// Sampling a texture is far cheaper than evaluating noise in the shader at
// every ray-march step, which is what makes real volumes affordable here.
//   R: billowy "Perlin-Worley" (fBm shaped by inverted cellular noise), for the
//      large cauliflower lumps of smoke.
//   G: finer cellular fBm, for eroding the edges into wisps.
// It is drawn once on the GPU, slice by slice (a few ms; on the CPU it takes
// seconds).
import {
  Camera,
  GLSL3,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RawShaderMaterial,
  RepeatWrapping,
  WebGL3DRenderTarget,
} from "three";

const SIZE = 64;

const vertexShader = /* glsl */ `
  in vec3 position;
  out vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uZ; // slice, 0..1
  in vec2 vUv;
  out vec4 outColor;

  // Hash of an integer lattice point wrapped to period p.
  vec3 hash33(vec3 c, float p, float seed) {
    c = mod(c, p);
    vec3 q = vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)));
    return fract(sin(q + seed) * 43758.5453123);
  }

  float valueNoise(vec3 x, float p, float seed) {
    vec3 i = floor(x);
    vec3 f = x - i;
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = hash33(i, p, seed).x;
    float b = hash33(i + vec3(1, 0, 0), p, seed).x;
    float c = hash33(i + vec3(0, 1, 0), p, seed).x;
    float d = hash33(i + vec3(1, 1, 0), p, seed).x;
    float e = hash33(i + vec3(0, 0, 1), p, seed).x;
    float f2 = hash33(i + vec3(1, 0, 1), p, seed).x;
    float g = hash33(i + vec3(0, 1, 1), p, seed).x;
    float h = hash33(i + vec3(1, 1, 1), p, seed).x;
    return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f2, u.x), mix(g, h, u.x), u.y), u.z);
  }

  // 1 - distance to the nearest feature point (cellular / Worley noise).
  float cellular(vec3 x, float p, float seed) {
    vec3 i = floor(x);
    float best = 9.0;
    for (int a = -1; a <= 1; a++)
      for (int b = -1; b <= 1; b++)
        for (int c = -1; c <= 1; c++) {
          vec3 cell = i + vec3(a, b, c);
          vec3 d = cell + hash33(cell, p, seed) - x;
          best = min(best, dot(d, d));
        }
    return 1.0 - min(1.0, sqrt(best));
  }

  float remap(float v, float a, float b, float c, float d) {
    return c + (v - a) / (b - a) * (d - c);
  }

  void main() {
    vec3 u = vec3(vUv, uZ);
    float fbm = (0.5 * valueNoise(u * 4.0, 4.0, 1.0) + 0.25 * valueNoise(u * 8.0, 8.0, 2.0)
      + 0.125 * valueNoise(u * 16.0, 16.0, 3.0)) / 0.875;
    float cells = 0.625 * cellular(u * 4.0, 4.0, 4.0) + 0.375 * cellular(u * 8.0, 8.0, 5.0);
    float base = clamp(remap(fbm, cells - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
    float detail = 0.625 * cellular(u * 8.0, 8.0, 6.0) + 0.25 * cellular(u * 16.0, 16.0, 7.0)
      + 0.125 * cellular(u * 32.0, 32.0, 8.0);
    outColor = vec4(base, detail, 0.0, 1.0);
  }
`;

let target = null;

/** The shared noise texture, drawn with `gl` on first use. */
export function noiseVolume(gl) {
  if (target) return target.texture;
  target = new WebGL3DRenderTarget(SIZE, SIZE, SIZE, { depthBuffer: false });
  const texture = target.texture;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.generateMipmaps = false;

  const material = new RawShaderMaterial({
    vertexShader,
    fragmentShader,
    glslVersion: GLSL3,
    uniforms: { uZ: { value: 0 } },
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const camera = new Camera();
  const previous = gl.getRenderTarget();
  const autoClear = gl.autoClear;
  gl.autoClear = false;
  for (let z = 0; z < SIZE; z++) {
    material.uniforms.uZ.value = (z + 0.5) / SIZE;
    gl.setRenderTarget(target, z);
    gl.render(quad, camera);
  }
  gl.setRenderTarget(previous);
  gl.autoClear = autoClear;
  quad.geometry.dispose();
  material.dispose();
  return texture;
}
