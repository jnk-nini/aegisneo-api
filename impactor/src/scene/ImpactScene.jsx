import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Line } from "@react-three/drei";
import { AdditiveBlending, Quaternion, Vector3 } from "three";
import { useSim } from "../store.js";
import { EARTH_RADIUS_M, simulateImpact } from "../physics/impact.js";
import { zonesFor } from "../physics/zones.js";
import { latLonToVector } from "./sphereMath.js";
import { clearZones, setShock, setZoneOpacity, setZones } from "./zoneOverlay.js";
import { resetDamage, setDamage } from "./damageOverlay.js";
import {
  APPROACH_SECONDS,
  TOTAL_SECONDS,
  aftermathRealSeconds,
  clock,
  phaseAt,
  shockRadiusM,
  simulatedSeconds,
} from "./timeline.js";
import { glowTexture, rockGeometry, runGeometry } from "./effects.js";
import { craterVisual } from "./craterShape.js";
import { damageRadii, reentrySeconds, severity, tsunamiSpeed } from "./impactVisuals.js";
import CraterPatch from "./CraterPatch.jsx";
import Plume from "./Plume.jsx";
import { EjectaCurtain, Reentry } from "./Ejecta.jsx";

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

/**
 * Flash, the air-blast front, damage on the ground, and (when switched on) the
 * damage-zone rings. The ground damage and rings are painted by the globe and
 * crater shaders through damageOverlay.js and zoneOverlay.js.
 */
function ImpactEffects({ geo, run, visual }) {
  const showZoneRings = useSim((s) => s.showZoneRings);
  const zones = useMemo(
    () => zonesFor(run.result).filter((z) => z.key !== "fireball" && z.key !== "crater"),
    [run],
  );
  const craterZone = useMemo(() => zonesFor(run.result).find((z) => z.key === "crater"), [run]);
  const outerM = zones[0]?.radiusM ?? 0;
  const radii = useMemo(() => damageRadii(run.result), [run]);
  const level = useMemo(() => severity(run.result), [run]);
  const aftermathS = useMemo(() => aftermathRealSeconds(run), [run]);
  const water = run.params.surface === "water";
  const flash = useRef();
  const fills = useRef([]);

  // Outlines of the zones, only when the user asks for them. Their fills
  // fade in as the blast front reaches them.
  useEffect(() => {
    const owner = {};
    const layers = showZoneRings
      ? zones.map((z) => ({
          radiusM: z.radiusM,
          fill: z.color,
          fillOpacity: 0,
          line: z.line,
          lineOpacity: 0.9,
          width: 1.6,
        }))
      : [];
    if (showZoneRings && craterZone) {
      layers.push({ radiusM: craterZone.radiusM, fillOpacity: 0, line: craterZone.line, lineOpacity: 0.9, width: 2 });
    }
    fills.current = layers.map(() => 0);
    setZones(owner, geo.center, layers);
    return () => clearZones(owner);
  }, [geo, zones, craterZone, showZoneRings]);
  useEffect(() => () => resetDamage(), []);

  useFrame(({ clock: frameClock }) => {
    const tau = clock.t - APPROACH_SECONDS;
    const done = useSim.getState().phase === "done";
    const active = done || tau >= 0;

    if (flash.current) {
      const k = tau >= 0 && !done ? Math.max(0, 1 - tau / 0.7) : 0;
      flash.current.visible = k > 0;
      flash.current.scale.setScalar(geo.closeRadiusRE * (1.2 + (1 - k) * 2.5));
      flash.current.material.opacity = k * k;
    }

    if (!active) {
      setShock(0, 0);
      setDamage({});
      return;
    }
    const s = done ? aftermathS : Math.max(0, simulatedSeconds(clock.t, run));
    const front = done ? Infinity : shockRadiusM(clock.t, run);
    const shockVisible = !done && front > 0 && front < outerM * 1.08;
    setShock(Math.min(front, outerM), shockVisible ? 0.95 : 0, 4);

    if (useSim.getState().showZoneRings) {
      zones.forEach((z, i) => {
        const target = front >= z.radiusM ? 0.12 + 0.1 * (i / Math.max(1, zones.length - 1)) : 0;
        const current = fills.current[i] ?? 0;
        fills.current[i] = done ? target : current + (target - current) * 0.12;
        setZoneOpacity(i, fills.current[i]);
      });
    }

    // After the largest impacts, fires spread worldwide as ejecta falls back
    // in, and dust and soot darken the whole planet over the following hours.
    const fireAll = level > 0.3 ? level * smooth(reentrySeconds(0.3), reentrySeconds(Math.PI), s) : 0;
    const firesM = radii.fires + (Math.PI * EARTH_RADIUS_M - radii.fires) * fireAll;
    setDamage({
      scorchM: radii.scorch,
      firesM,
      flattenedM: Math.min(radii.flattened, front),
      lightsOutM: Math.min(radii.lightsOut, front),
      wreckedM: Math.min(radii.wrecked, front),
      tsunamiM: water ? tsunamiSpeed() * s : 0,
      holeM: visual ? visual.patchRadiusM * 0.995 : 0,
      levels: [done ? 1 : smooth(0, 0.8, tau), done ? 1 : smooth(0.6, 2.5, tau), 1, 1],
      tsunami: water ? 1 : 0,
      dust: level * 0.85 * smooth(0.02 * aftermathS, 0.6 * aftermathS, s),
      time: frameClock.elapsedTime,
      lightsOut: 1,
    });
  });

  return (
    <Billboard position={geo.end}>
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

export function ImpactSequence({ textures, sunDir }) {
  const run = useSim((s) => s.run);
  const geo = useMemo(() => (run ? runGeometry(run) : null), [run]);
  const visual = useMemo(() => (run ? craterVisual(run.result) : null), [run]);
  if (!run || !geo) return null;
  const level = severity(run.result);
  // Fireball radius from Eq. 32 when the model gives one; airbursts get a glow
  // scaled to their blast so they still read clearly.
  const outerM = zonesFor(run.result)[0]?.radiusM ?? 0;
  const plumeM = Math.max(run.result.fireballRadiusM ?? 0, Math.min(outerM * 0.08, 40000), 300);
  return (
    <group key={run.id}>
      <Trajectory geo={geo} />
      <Asteroid geo={geo} run={run} />
      <ImpactEffects geo={geo} run={run} visual={visual} />
      {visual && <CraterPatch run={run} geo={geo} visual={visual} textures={textures} sunDir={sunDir} />}
      {visual && <EjectaCurtain run={run} geo={geo} visual={visual} />}
      <Plume run={run} geo={geo} radiusM={plumeM} sunDir={sunDir} />
      {level > 0.3 && <Reentry run={run} geo={geo} strength={level} />}
    </group>
  );
}
