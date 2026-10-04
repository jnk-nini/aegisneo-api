import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BackSide, Vector3 } from "three";
import { createZoneUniforms, zoneShader, zoneUniforms } from "./zoneOverlay.js";

const earthVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vPosW = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
    #include <logdepthbuf_vertex>
  }
`;

const earthFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D maskMap;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  ${zoneShader}
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float ndl = dot(n, sunDir);
    float dayAmount = smoothstep(-0.12, 0.2, ndl);

    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    float ocean = 1.0 - texture2D(maskMap, vUv).r;

    vec3 lit = day * (0.05 + 1.1 * max(ndl, 0.0));
    vec3 halfDir = normalize(sunDir + viewDir);
    lit += vec3(1.0, 0.92, 0.8) * pow(max(dot(n, halfDir), 0.0), 70.0) * ocean * 0.55;
    vec3 color = mix(night * 1.6 + day * 0.025, lit, dayAmount);

    // Thin blue limb, brighter on the day side, orange along the terminator.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    float terminator = smoothstep(0.25, 0.0, abs(ndl));
    color += mix(vec3(0.25, 0.55, 1.0), vec3(1.0, 0.5, 0.2), terminator * 0.6) * fresnel * (0.15 + 0.85 * dayAmount);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
    gl_FragColor.rgb = drawZones(gl_FragColor.rgb, n);
  }
`;

const cloudFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    #include <logdepthbuf_fragment>
    float density = texture2D(cloudMap, vUv).r;
    float ndl = dot(normalize(vNormalW), sunDir);
    float light = 0.04 + 0.96 * smoothstep(-0.15, 0.35, ndl);
    gl_FragColor = vec4(vec3(light), density * 0.82 * opacity);
    #include <colorspace_fragment>
  }
`;

const atmosphereVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const atmosphereFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 sunDir;
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    #include <logdepthbuf_fragment>
    float intensity = pow(clamp(0.68 - dot(vNormalV, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.5);
    float sunSide = 0.2 + 0.8 * smoothstep(-0.35, 0.45, dot(vNormalW, sunDir));
    gl_FragColor = vec4(vec3(0.3, 0.6, 1.0) * intensity * sunSide * 1.6, 1.0);
    #include <colorspace_fragment>
  }
`;

const CLOUD_RADIUS = 1.0016; // ~10 km up
const ATMOSPHERE_RADIUS = 1.03;

/**
 * Unit-radius Earth. `scale` lets the flyby view shrink it without breaking the
 * cloud fade, which depends on the camera's altitude in Earth radii. With
 * `showZones`, it paints the damage zones set through zoneOverlay.js.
 */
export default function Earth({
  textures,
  sunDir,
  segments = 160,
  scale = 1,
  onSurfaceClick,
  showZones = false,
}) {
  const cloudsRef = useRef();
  const sun = useMemo(() => sunDir.clone().normalize(), [sunDir]);
  const tmp = useMemo(() => new Vector3(), []);

  const zones = useMemo(() => (showZones ? zoneUniforms : createZoneUniforms()), [showZones]);
  const earthUniforms = useMemo(
    () => ({
      ...zones,
      dayMap: { value: textures.day },
      nightMap: { value: textures.night },
      maskMap: { value: textures.mask },
      sunDir: { value: sun },
    }),
    [textures, sun, zones],
  );
  const cloudUniforms = useMemo(
    () => ({ cloudMap: { value: textures.clouds }, sunDir: { value: sun }, opacity: { value: 1 } }),
    [textures, sun],
  );
  const atmosphereUniforms = useMemo(() => ({ sunDir: { value: sun } }), [sun]);

  useFrame(({ camera, gl }, dt) => {
    zones.zonePixelRatio.value = gl.getPixelRatio();
    const clouds = cloudsRef.current;
    if (!clouds) return;
    clouds.rotation.y += dt * 0.004;
    // Fade the cloud deck out when zoomed in close so it never hides an impact.
    const altitude = camera.getWorldPosition(tmp).length() / scale - 1;
    cloudUniforms.opacity.value = Math.min(1, Math.max(0, (altitude - 0.15) / 0.35));
    clouds.visible = cloudUniforms.opacity.value > 0.01;
  });

  return (
    <group scale={scale}>
      <mesh onClick={onSurfaceClick} name="earth">
        <sphereGeometry args={[1, segments, segments / 2]} />
        {/* Uniforms go through args: a `uniforms` prop is copied entry by entry, so
            numbers updated in place later (zone count, cloud fade) would never arrive. */}
        <shaderMaterial
          args={[{ vertexShader: earthVertex, fragmentShader: earthFragment, uniforms: earthUniforms }]}
        />
      </mesh>
      <mesh ref={cloudsRef} raycast={() => null}>
        <sphereGeometry args={[CLOUD_RADIUS, 96, 48]} />
        <shaderMaterial
          args={[{ vertexShader: earthVertex, fragmentShader: cloudFragment, uniforms: cloudUniforms }]}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh raycast={() => null}>
        <sphereGeometry args={[ATMOSPHERE_RADIUS, 64, 32]} />
        <shaderMaterial
          vertexShader={atmosphereVertex}
          fragmentShader={atmosphereFragment}
          uniforms={atmosphereUniforms}
          side={BackSide}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
