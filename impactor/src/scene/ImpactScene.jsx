import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Billboard, Line } from "@react-three/drei";
import { AdditiveBlending, Color, Quaternion, Vector3 } from "three";
import { useSim } from "../store.js";
import { simulateImpact } from "../physics/impact.js";
import { zonesFor } from "../physics/zones.js";
import { latLonToVector, localFrame } from "./sphereMath.js";
import { clearZones, setShock, setZoneOpacity, setZones } from "./zoneOverlay.js";
import { APPROACH_SECONDS, TOTAL_SECONDS, clock, phaseAt, shockRadiusM } from "./timeline.js";
import { glowTexture, rockGeometry, runGeometry } from "./effects.js";

const Y_AXIS = new Vector3(0, 1, 0);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Advances the playback clock and reports phase changes to the store. */
export function Timeline() {
  const runId = useSim((s) => s.run?.id);
  useEffect(() => {
    clock.t = 0;
  }, [runId]);
  useFrame((_, dt) => {
    const s = useSim.getState();
    if (!s.run) return;
    if (s.phase === "done") {
      clock.t = Math.max(clock.t, TOTAL_SECONDS);
      return;
    }
    if (!s.paused) clock.t += Math.min(dt, 0.1) * s.timeScale;
    s.setPhase(phaseAt(clock.t));
  });
  return null;
}

/** Pin on the chosen target that stays the same size on screen. */
export function TargetMarker() {
  const target = useSim((s) => s.target);
  const group = useRef();
  const pulse = useRef();
  const center = useMemo(() => (target ? latLonToVector(target.lat, target.lon) : null), [target]);
  const quaternion = useMemo(
    () => (center ? new Quaternion().setFromUnitVectors(Y_AXIS, center.clone().normalize()) : null),
    [center],
  );
  const ringPoints = useMemo(
    () =>
      Array.from(
        { length: 49 },
        (_, i) => new Vector3(Math.cos((i / 48) * Math.PI * 2), 0, Math.sin((i / 48) * Math.PI * 2)),
      ),
    [],
  );
  useFrame(({ camera, clock: c }) => {
    if (!group.current || !center) return;
    const size = camera.position.distanceTo(center) * 0.018;
    group.current.scale.setScalar(size);
    const phase = useSim.getState().phase;
    group.current.visible = phase === "idle" || phase === "done";
    if (pulse.current) {
      const k = (c.elapsedTime * 0.8) % 1;
      pulse.current.scale.setScalar(1 + k * 1.6);
      pulse.current.material.opacity = 1 - k;
    }
  });

  if (!center) return null;
  return (
    <group position={center} quaternion={quaternion}>
      <group ref={group}>
        <Line
          points={ringPoints}
          color="#7fd4ff"
          lineWidth={2}
          depthWrite={false}
          toneMapped={false}
          raycast={() => null}
        />
        <Line
          ref={pulse}
          points={ringPoints}
          color="#7fd4ff"
          lineWidth={1.5}
          transparent
          depthWrite={false}
          toneMapped={false}
          raycast={() => null}
        />
        <Line
          points={[
            [0, 0, 0],
            [0, 2.4, 0],
          ]}
          color="#7fd4ff"
          lineWidth={1.5}
          depthWrite={false}
          toneMapped={false}
          raycast={() => null}
        />
      </group>
    </group>
  );
}

/** Dashed preview of the damage zones for the current settings, before launch. */
export function PreviewZones() {
  const target = useSim((s) => s.target);
  const run = useSim((s) => s.run);
  const asteroid = useSim((s) => s.asteroid);
  const diameterM = useSim((s) => s.diameterM);
  const velocityKms = useSim((s) => s.velocityKms);
  const composition = useSim((s) => s.composition);
  const angleDeg = useSim((s) => s.angleDeg);

  const zones = useMemo(() => {
    if (!target || !asteroid) return [];
    const params = useSim.getState().params();
    return zonesFor(simulateImpact(params)).filter((z) => z.key !== "fireball");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, asteroid, diameterM, velocityKms, composition, angleDeg]);
  const center = useMemo(() => (target ? latLonToVector(target.lat, target.lon) : null), [target]);
  const show = Boolean(center) && !run && zones.length > 0;

  useEffect(() => {
    if (!show) return;
    const owner = {};
    setZones(
      owner,
      center,
      zones.map((z) => ({ radiusM: z.radiusM, line: z.line, lineOpacity: 0.7, width: 1.5, dashed: true })),
    );
    return () => clearZones(owner);
  }, [show, center, zones]);
  return null;
}

/** The asteroid flying in, its entry glow and trail. */
function Asteroid({ geo, run }) {
  const group = useRef();
  const rock = useRef();
  const glowRef = useRef();
  const trail = useRef();
  const geometry = useMemo(() => rockGeometry(run.id), [run.id]);
  const trailQuat = useMemo(() => new Quaternion().setFromUnitVectors(Y_AXIS, geo.incoming), [geo]);
  const realRadiusRE = run.params.diameterM / 2 / 6.371e6;
  const pos = useMemo(() => new Vector3(), []);

  useFrame(({ camera }, dt) => {
    if (!group.current) return;
    const t = clock.t;
    const visible = t < APPROACH_SECONDS;
    group.current.visible = visible;
    if (!visible) return;
    const u = t / APPROACH_SECONDS;
    pos.lerpVectors(geo.start, geo.end, u);
    group.current.position.copy(pos);
    const camDist = camera.position.distanceTo(pos);
    const size = Math.max(realRadiusRE, camDist * 0.011);
    rock.current.scale.setScalar(size);
    rock.current.rotation.x += dt * 0.7;
    rock.current.rotation.y += dt * 0.4;
    // Entry heating starts high in the atmosphere (drawn exaggerated for visibility).
    const altitude = pos.length() - 1;
    const heat = smooth(0.06, 0.004, altitude);
    glowRef.current.scale.setScalar(size * (3.5 + heat * 5));
    glowRef.current.material.opacity = 0.45 + heat * 0.55;
    trail.current.visible = heat > 0.01;
    trail.current.scale.set(size * 1.4, size * 26 * heat, size * 1.4);
    trail.current.material.opacity = heat * 0.8;
  });

  return (
    <group ref={group}>
      <mesh ref={rock} geometry={geometry}>
        <meshStandardMaterial color="#8a8178" roughness={0.95} metalness={0.05} />
      </mesh>
      <Billboard>
        <mesh ref={glowRef} raycast={() => null}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={glowTexture()}
            transparent
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </Billboard>
      <mesh ref={trail} quaternion={trailQuat} raycast={() => null}>
        <cylinderGeometry args={[0.15, 1, 1, 16, 1, true]} />
        <meshBasicMaterial
          color="#ffad5c"
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Flash, fireball, expanding air blast, damage zones, crater and ejecta. */
function ImpactEffects({ geo, run }) {
  const isMobile = useThree((s) => s.size.width < 900);
  const zones = useMemo(
    () => zonesFor(run.result).filter((z) => z.key !== "fireball" && z.key !== "crater"),
    [run],
  );
  const crater = run.result.crater;
  const craterIndex = crater?.finalDiameterM && !geo.airburst ? zones.length : -1;
  const outerM = zones[0]?.radiusM ?? 0;
  const burstPoint = geo.end;
  const flash = useRef();
  const fireball = useRef();
  const fills = useRef([]);
  const debris = useRef();

  // Zones and crater are painted by the Earth shader (see zoneOverlay.js); they
  // start transparent and fade in as the blast front reaches them.
  useEffect(() => {
    const owner = {};
    const layers = zones.map((z) => ({
      radiusM: z.radiusM,
      fill: z.color,
      fillOpacity: 0,
      line: z.line,
      lineOpacity: 0.9,
      width: 1.6,
    }));
    if (craterIndex >= 0) {
      layers.push({
        radiusM: crater.finalDiameterM / 2,
        fill: "#140a06",
        fillOpacity: 0,
        line: "#ff9a52",
        lineOpacity: 0,
        width: 2.2,
      });
    }
    fills.current = layers.map(() => 0);
    setZones(owner, geo.center, layers);
    return () => clearZones(owner);
  }, [geo, zones, crater, craterIndex]);

  // Fireball size: Eq. 32 radius when the model reports one; otherwise a visual glow
  // scaled to the blast so airbursts still read clearly.
  const fireballRE = Math.max(run.result.fireballRadiusM ?? 0, Math.min(outerM * 0.08, 40000), 300) / 6.371e6;
  const showDebris = !geo.airburst;

  const debrisData = useMemo(() => {
    const count = isMobile ? 160 : 380;
    const spread = Math.max((crater?.finalDiameterM ?? 0) * 2.5, outerM * 0.18, 1500) / 6.371e6;
    const { east, north, up } = localFrame(geo.center);
    const dirs = [];
    const params = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      dirs.push(east.clone().multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a)));
      const T = 0.8 + Math.random() * 1.6;
      const R = spread * (0.15 + Math.random() ** 1.5 * 0.85);
      params.push({ T, vh: R / T, vv: (spread * 4 * T) / 2 });
    }
    return { dirs, params, up, g: spread * 4, positions: new Float32Array(count * 3) };
  }, [geo, crater, outerM, isMobile]);

  // Hot ejecta cooling to dust (or spray settling to sea), mixed into one reused colour.
  const debrisColors = useMemo(() => {
    const water = run.target.surface === "water";
    return {
      hot: new Color(water ? "#d8f0ff" : "#ffb35c"),
      cool: new Color(water ? "#7fb6d9" : "#5a3a28"),
      now: new Color(),
    };
  }, [run]);
  const tmp = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const tau = clock.t - APPROACH_SECONDS;
    const done = useSim.getState().phase === "done";
    const active = tau >= 0;

    if (flash.current) {
      const k = active ? Math.max(0, 1 - tau / 0.7) : 0;
      flash.current.visible = k > 0 && !done;
      flash.current.scale.setScalar(geo.viewRadiusRE * (0.4 + (1 - k) * 0.9));
      flash.current.material.opacity = k * k;
    }
    if (fireball.current) {
      const grow = smooth(0, 0.9, tau);
      const fade = 1 - smooth(1.2, 3.6, tau);
      fireball.current.visible = active && fade > 0 && !done;
      fireball.current.scale.setScalar(fireballRE * 2.4 * (0.3 + 0.7 * grow));
      fireball.current.material.opacity = fade;
    }
    const front = active ? (done ? outerM * 2 : shockRadiusM(clock.t, run)) : 0;
    const shockVisible = active && !done && front > 0 && front < outerM * 1.08;
    setShock(Math.min(front, outerM), shockVisible ? 0.95 : 0);
    zones.forEach((z, i) => {
      const reached = front >= z.radiusM;
      const target = reached ? 0.12 + 0.1 * (i / Math.max(1, zones.length - 1)) : 0;
      const current = fills.current[i] ?? 0;
      fills.current[i] = done ? target : current + (target - current) * 0.12;
      setZoneOpacity(i, fills.current[i]);
    });
    if (craterIndex >= 0) {
      const show = done ? 1 : smooth(0.15, 0.8, tau);
      setZoneOpacity(craterIndex, 0.92 * show, show > 0.05 ? 1 : 0);
    }
    if (debris.current && showDebris) {
      const { dirs, params, up, g, positions } = debrisData;
      const visible = active && tau < 5 && !done;
      debris.current.visible = visible;
      if (visible) {
        for (let i = 0; i < dirs.length; i++) {
          const p = params[i];
          const s = Math.min(tau, p.T);
          const height = Math.max(0, p.vv * s - 0.5 * g * s * s);
          tmp
            .copy(geo.center)
            .addScaledVector(dirs[i], p.vh * s)
            .addScaledVector(up, height + 2e-6);
          positions[i * 3] = tmp.x;
          positions[i * 3 + 1] = tmp.y;
          positions[i * 3 + 2] = tmp.z;
        }
        const attr = debris.current.geometry.getAttribute("position");
        attr.needsUpdate = true;
        const { hot, cool, now } = debrisColors;
        debris.current.material.color.copy(now.lerpColors(hot, cool, smooth(0, 2.5, tau)));
        debris.current.material.opacity = 1 - smooth(3.5, 5, tau);
      }
    }
  });

  return (
    <group>
      <Billboard position={burstPoint}>
        <mesh ref={fireball} visible={false} raycast={() => null}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={glowTexture()}
            transparent
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={flash} visible={false} raycast={() => null}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={glowTexture()}
            color="#fff8e8"
            transparent
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </Billboard>
      {showDebris && (
        <points ref={debris} visible={false} frustumCulled={false} raycast={() => null}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[debrisData.positions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={isMobile ? 3 : 3.5}
            sizeAttenuation={false}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </points>
      )}
    </group>
  );
}

/** Dashed line showing where the asteroid is coming from, during the approach. */
function Trajectory({ geo }) {
  const ref = useRef();
  const points = useMemo(() => [geo.start.toArray(), geo.end.toArray()], [geo]);
  useFrame(() => {
    if (ref.current) ref.current.visible = clock.t < APPROACH_SECONDS;
  });
  return (
    <Line
      ref={ref}
      points={points}
      color="#ffb347"
      lineWidth={1.2}
      dashed
      dashSize={0.04}
      gapSize={0.03}
      transparent
      opacity={0.55}
      depthWrite={false}
      toneMapped={false}
      raycast={() => null}
    />
  );
}

export function ImpactSequence() {
  const run = useSim((s) => s.run);
  const geo = useMemo(() => (run ? runGeometry(run) : null), [run]);
  if (!run || !geo) return null;
  return (
    <group key={run.id}>
      <Trajectory geo={geo} />
      <Asteroid geo={geo} run={run} />
      <ImpactEffects geo={geo} run={run} />
    </group>
  );
}
