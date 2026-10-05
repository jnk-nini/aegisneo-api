// GLSL shared by the globe and the crater patch, so the two shade identically
// and the patch blends into the globe without a visible edge.

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
