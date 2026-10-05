import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, BackSide, Vector3 } from "three";
import { createZoneUniforms, zoneShader, zoneUniforms } from "./zoneOverlay.js";
import { createDamageUniforms, damageNoise, damageShader, damageUniforms, texNoiseShader } from "./damageOverlay.js";
import { surfaceShader } from "./surfaceShader.js";
import { noiseVolume } from "./noiseVolume.js";

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
  ${texNoiseShader}
  ${surfaceShader}
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  ${zoneShader}
  ${damageShader}
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormalW);
    // The crater patch (CraterPatch.jsx) replaces the globe around the impact.
    if (dmgChordB.w > 0.0 && length(n - zoneCenter) < dmgChordB.w) discard;
    vec3 viewDir = normalize(cameraPosition - vPosW);

    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    float land = texture2D(maskMap, vUv).r;
    vec3 glow = applyDamage(day, night, land, n);
    vec3 color = shadeSurface(day, night, 1.0 - land, n, n, viewDir) + glow + impactLight(vPosW, n, day);

    gl_FragColor = vec4(applyDust(color), 1.0);
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
  uniform vec3 zoneCenter;
  uniform vec4 zoneShock;
  uniform vec4 dmgChordA;
  uniform vec4 dmgFx;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormalW);
    float density = texture2D(cloudMap, vUv).r;
    float c = length(n - zoneCenter);
    // Blast winds tear the clouds apart where they flatten forests, and a
    // condensation ring rides the shock front.
    if (dmgChordA.z > 0.0) {
      density *= mix(1.0, 0.15, 1.0 - smoothstep(dmgChordA.z * 0.85, dmgChordA.z, c));
    }
    if (zoneShock.y > 0.0) {
      float d = (c - zoneShock.x) / max(zoneShock.x * 0.03, 1e-5);
      density = max(density, 0.75 * zoneShock.y * exp(-d * d));
    }
    float ndl = dot(n, sunDir);
    float light = 0.04 + 0.96 * smoothstep(-0.15, 0.35, ndl);
    vec3 tint = mix(vec3(1.0), vec3(0.45, 0.38, 0.3), dmgFx.y);
    gl_FragColor = vec4(vec3(light) * tint, density * 0.82 * opacity);
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
  uniform vec4 dmgFx;
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    #include <logdepthbuf_fragment>
    float intensity = pow(clamp(0.68 - dot(vNormalV, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.5);
    float sunSide = 0.2 + 0.8 * smoothstep(-0.35, 0.45, dot(vNormalW, sunDir));
    // Dust from the largest impacts turns the blue limb a dull brown.
    vec3 sky = mix(vec3(0.3, 0.6, 1.0), vec3(0.55, 0.36, 0.2), dmgFx.y);
    gl_FragColor = vec4(sky * intensity * sunSide * 1.6, 1.0);
    #include <colorspace_fragment>
  }
`;

const CLOUD_RADIUS = 1.0016; // ~10 km up
const ATMOSPHERE_RADIUS = 1.03;

/**
 * Unit-radius Earth. `scale` lets the flyby view shrink it without breaking the
 * cloud fade, which depends on the camera's altitude in Earth radii. With
 * `showZones`, it paints the damage zones and ground damage set through
 * zoneOverlay.js and damageOverlay.js.
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
  const gl = useThree((s) => s.gl);
  const sun = useMemo(() => sunDir.clone().normalize(), [sunDir]);
  const tmp = useMemo(() => new Vector3(), []);

  const zones = useMemo(() => (showZones ? zoneUniforms : createZoneUniforms()), [showZones]);
  const damage = useMemo(() => (showZones ? damageUniforms : createDamageUniforms()), [showZones]);
  const earthUniforms = useMemo(() => {
    damageNoise.dmgNoise.value = noiseVolume(gl);
    return {
      ...zones,
      ...damage,
      dmgNoise: damageNoise.dmgNoise,
      dayMap: { value: textures.day },
      nightMap: { value: textures.night },
      maskMap: { value: textures.mask },
      sunDir: { value: sun },
    };
  }, [gl, textures, sun, zones, damage]);
  const cloudUniforms = useMemo(
    () => ({
      cloudMap: { value: textures.clouds },
      sunDir: { value: sun },
      opacity: { value: 1 },
      zoneCenter: zones.zoneCenter,
      zoneShock: zones.zoneShock,
      dmgChordA: damage.dmgChordA,
      dmgFx: damage.dmgFx,
    }),
    [textures, sun, zones, damage],
  );
  const atmosphereUniforms = useMemo(() => ({ sunDir: { value: sun }, dmgFx: damage.dmgFx }), [sun, damage]);

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
          args={[
            { vertexShader: atmosphereVertex, fragmentShader: atmosphereFragment, uniforms: atmosphereUniforms },
          ]}
          side={BackSide}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
