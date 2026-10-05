import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard, Html, Line, OrbitControls } from "@react-three/drei";
import { AdditiveBlending, Vector3 } from "three";
import { useSim } from "../store.js";
import Earth from "./Earth.jsx";
import { glowTexture, rockGeometry } from "./effects.js";
import { KM_PER_LD } from "../lib/geo.js";

// Units here are lunar distances (LD): 1 = 384,400 km.
const EARTH_RADIUS_LD = 6371 / KM_PER_LD;
const MOON_RADIUS_LD = 1737 / KM_PER_LD;

function circle(radius, segments = 256) {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return new Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  });
}

function Label({ position, children, tone = "default" }) {
  return (
    <Html position={position} center zIndexRange={[10, 0]} className={`scene-label scene-label--${tone}`}>
      {children}
    </Html>
  );
}

export default function Flyby({ textures, sunDir }) {
  const asteroid = useSim((s) => s.asteroid);
  const rock = useRef();
  const marker = useRef();
  const moon = useRef();
  const geometry = useMemo(() => rockGeometry(7), []);
  const missLD = asteroid ? asteroid.miss_distance_km / KM_PER_LD : 1;
  const span = Math.max(missLD, 1);
  // Straight-line pass: closest point on +X, moving along Z, slightly inclined.
  // Only the miss distance is real; the catalog has no orbit, so the direction
  // and inclination are invented (FlybyCaption says so).
  const closest = useMemo(() => new Vector3(missLD, 0, 0), [missLD]);
  const direction = useMemo(() => new Vector3(0, 0.18, 1).normalize(), []);
  const pathPoints = useMemo(
    () => [
      closest.clone().addScaledVector(direction, -span * 3),
      closest.clone().addScaledVector(direction, span * 3),
    ],
    [closest, direction, span],
  );
  const moonOrbit = useMemo(() => circle(1), []);
  const missRing = useMemo(() => circle(missLD), [missLD]);
  const camera = useThree((s) => s.camera);

  // Frame Earth, the Moon's orbit and the closest-approach point together.
  useEffect(() => {
    camera.up.set(0, 1, 0);
    camera.position.set(missLD / 2, span * 1.5, span * 2.4);
    camera.far = span * 400;
    camera.updateProjectionMatrix();
    camera.lookAt(missLD / 2, 0, 0);
    return () => {
      camera.far = 2000;
      camera.updateProjectionMatrix();
    };
  }, [camera, missLD, span]);

  const pos = useMemo(() => new Vector3(), []);

  useFrame(({ camera, clock }) => {
    const t = (clock.elapsedTime * 0.08) % 1;
    pos.copy(closest).addScaledVector(direction, (t * 2 - 1) * span * 3);
    const size = camera.position.distanceTo(pos) * 0.008;
    rock.current.position.copy(pos);
    rock.current.scale.setScalar(size);
    rock.current.rotation.y += 0.01;
    marker.current.position.copy(pos);
    marker.current.scale.setScalar(size * 3);
    const m = clock.elapsedTime * 0.02;
    moon.current.position.set(Math.cos(m), 0, Math.sin(m));
    moon.current.scale.setScalar(
      Math.max(MOON_RADIUS_LD, camera.position.distanceTo(moon.current.position) * 0.004),
    );
  });

  if (!asteroid) return null;
  const millionKm = asteroid.miss_distance_km / 1e6;

  return (
    <>
      <Earth textures={textures} sunDir={sunDir} scale={EARTH_RADIUS_LD} segments={96} />
      {/* When the pass is far away, Earth and the Moon's orbit overlap on screen: label them once. */}
      {span > 8 ? (
        <Label position={[0, 0, 0]}>Earth &amp; Moon&apos;s orbit</Label>
      ) : (
        <Label position={[0, -EARTH_RADIUS_LD * 6, 0]}>Earth</Label>
      )}

      <Line
        points={moonOrbit}
        color="#9fb3c8"
        lineWidth={1}
        dashed
        dashSize={0.06}
        gapSize={0.04}
        transparent
        opacity={0.7}
      />
      <mesh ref={moon}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshStandardMaterial color="#b9b6b0" roughness={1} />
      </mesh>
      {span <= 8 && (
        <Label position={[0, 0, -1.08]} tone="muted">
          Moon&apos;s orbit · 1 LD
        </Label>
      )}

      <Line points={missRing} color="#ffb347" lineWidth={1} transparent opacity={0.35} />
      <Line points={pathPoints} color="#ffb347" lineWidth={1.5} transparent opacity={0.8} />
      <Line
        points={[[0, 0, 0], closest.toArray()]}
        color="#ffb347"
        lineWidth={1}
        dashed
        dashSize={span * 0.03}
        gapSize={span * 0.02}
      />
      <Label position={closest.clone().multiplyScalar(0.5).toArray()} tone="accent">
        {missLD.toFixed(missLD < 10 ? 2 : 1)} LD · {millionKm.toFixed(millionKm < 1 ? 3 : 1)} million km
      </Label>

      <mesh ref={rock} geometry={geometry}>
        <meshStandardMaterial color="#8a8178" roughness={0.95} />
      </mesh>
      <Billboard ref={marker}>
        <mesh>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={glowTexture()}
            transparent
            opacity={0.6}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </Billboard>

      <OrbitControls
        makeDefault
        target={[missLD / 2, 0, 0]}
        enablePan={false}
        enableDamping
        minDistance={0.05}
        maxDistance={span * 12}
      />
    </>
  );
}
