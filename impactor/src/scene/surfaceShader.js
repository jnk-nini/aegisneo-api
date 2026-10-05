// GLSL shared by the globe and the crater patch, so the two shade identically
// and the patch blends into the globe without a visible edge.
import { DataTexture, RGBAFormat, Vector2, Vector4 } from "three";

const blank = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, RGBAFormat);
blank.needsUpdate = true;

/**
 * Close-up imagery around where the camera looks (DetailImagery.jsx): NASA
 * colour and 31 m shaded relief for a lon/lat window, sharper than the globe's
 * own texture. Shared by every material that includes surfaceShader.
 */
export const detailUniforms = {
  detailColor: { value: blank },
  detailRelief: { value: blank },
  detailRect: { value: new Vector4(0, 0, 0, 0) }, // u, v of the south-west corner; width, height
  detailOn: { value: new Vector2(0, 0) }, // colour, relief
};

/**
 * Day/night shading of the surface. `nSphere` is the true sphere normal (day
 * side, limb glow); `nLight` is the normal of the actual terrain, which only
 * differs inside the crater, so its walls catch the sun or fall into shadow.
 */
export const surfaceShader = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D maskMap;
  uniform vec3 sunDir;
  uniform sampler2D detailColor;
  uniform sampler2D detailRelief;
  uniform vec4 detailRect;
  uniform vec2 detailOn;

  // The day colour at texture coordinates uv, sharpened with the close-up
  // imagery where it covers. Relief is used as detail only (ratio to its local
  // average), since the colour already carries the broad shading.
  vec3 detailDay(vec2 uv, vec3 day) {
    if (detailOn.x + detailOn.y <= 0.0) return day;
    vec2 l = vec2(fract(uv.x - detailRect.x), uv.y - detailRect.y) / detailRect.zw;
    if (l.x <= 0.0 || l.x >= 1.0 || l.y <= 0.0 || l.y >= 1.0) return day;
    vec2 e = min(l, 1.0 - l);
    float w = smoothstep(0.0, 0.08, min(e.x, e.y));
    vec3 c = detailOn.x > 0.0 ? texture(detailColor, l).rgb : day;
    if (detailOn.y > 0.0) {
      float r = texture(detailRelief, l).r;
      float avg = texture(detailRelief, l, 5.0).r;
      c *= clamp(0.5 + 0.5 * r / max(avg, 0.08), 0.65, 1.4);
    }
    return mix(day, c, w);
  }

  vec3 shadeSurface(vec3 day, vec3 night, float ocean, vec3 nSphere, vec3 nLight, vec3 viewDir) {
    float ndl = dot(nLight, sunDir);
    float sphereNdl = dot(nSphere, sunDir);
    float dayAmount = smoothstep(-0.12, 0.2, sphereNdl);

    vec3 lit = day * (0.05 + 1.1 * max(ndl, 0.0));
    vec3 halfDir = normalize(sunDir + viewDir);
    lit += vec3(1.0, 0.92, 0.8) * pow(max(dot(nLight, halfDir), 0.0), 70.0) * ocean * 0.55;
    vec3 color = mix(night * 1.6 + day * 0.025, lit, dayAmount);

    // Thin blue limb, brighter on the day side, orange along the terminator.
    float fresnel = pow(1.0 - max(dot(nSphere, viewDir), 0.0), 3.0);
    float terminator = smoothstep(0.25, 0.0, abs(sphereNdl));
    color += mix(vec3(0.25, 0.55, 1.0), vec3(1.0, 0.5, 0.2), terminator * 0.6) * fresnel * (0.15 + 0.85 * dayAmount);
    return color;
  }

  // Texture coordinates of a direction, matching SphereGeometry's UVs.
  vec2 sphereUv(vec3 d) {
    return vec2(fract(atan(d.z, -d.x) / (2.0 * PI)), 1.0 - acos(clamp(d.y, -1.0, 1.0)) / PI);
  }

  // Samples with gradients that ignore the jump in u at the date line, so the
  // mipmap choice doesn't draw a seam there.
  vec4 sampleSphere(sampler2D tex, vec2 uv) {
    vec2 dx = dFdx(uv);
    vec2 dy = dFdy(uv);
    dx.x -= floor(dx.x + 0.5);
    dy.x -= floor(dy.x + 0.5);
    return textureGrad(tex, uv, dx, dy);
  }
`;
