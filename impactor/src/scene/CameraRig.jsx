import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import { useSim } from "../store.js";
import { latLonToVector, localFrame } from "./sphereMath.js";
import { simulateImpact } from "../physics/impact.js";
import { outermostRadiusM } from "../physics/zones.js";
import { APPROACH_SECONDS, clock, playbackAt } from "./timeline.js";
import { blendPose, focusPose, newPose, runGeometry } from "./effects.js";
import { severity } from "./impactVisuals.js";
import { collapseWindow, craterVisual } from "./craterShape.js";

const ORIGIN = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const ramp = (a, b, x) => easeInOut(Math.min(1, Math.max(0, (x - a) / (b - a))));
const CRATER_TILT = 55; // lower than the usual 38° so the crater's depth reads
const ORBIT_RADIANS = 0.55; // how far the camera circles the site during the aftermath

/** Whole-planet view centred on the impact, for the largest impacts. */
function planetPose(geo) {
  return {
    position: geo.center.clone().multiplyScalar(3.2),
    target: ORIGIN.clone(),
    up: geo.frame.north.clone(),
  };
}

/** Wide opening shot of a run: side-on to the incoming path, both ends in view. */
function widePose(geo) {
  const sideways = geo.frame.up.clone().cross(geo.horizontal).normalize();
  const target = geo.center
    .clone()
    .multiplyScalar(0.35)
    .add(geo.start.clone().sub(geo.center).multiplyScalar(0.3));
  return {
    target,
    position: target.clone().add(sideways.multiplyScalar(3.4).addScaledVector(geo.frame.up, 1.2)),
    up: geo.frame.up.clone(),
  };
}

function currentPose(camera, controls) {
  return {
    position: camera.position.clone(),
    target: controls?.target?.clone() ?? ORIGIN.clone(),
    up: camera.up.clone(),
  };
}

function globePose(camera) {
  const dir = camera.position.clone().normalize();
  return { position: dir.multiplyScalar(3.3), target: ORIGIN.clone(), up: WORLD_UP.clone() };
}

export default function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controlsRef = useRef();
  const run = useSim((s) => s.run);
  const phase = useSim((s) => s.phase);
  const focusRequest = useSim((s) => s.focusRequest);
  const craterRequest = useSim((s) => s.craterRequest);
  const globeRequest = useSim((s) => s.globeRequest);
  const reducedMotion = useSim((s) => s.reducedMotion);
  const [control, setControl] = useState({ kind: "globe", center: null, key: 0 });
  const flight = useRef(null);
  // Reused every frame so the cinematic allocates nothing (less GC stutter on phones).
  const scratch = useMemo(
    () => ({
      out: newPose(),
      intro: newPose(),
      focus: newPose(),
      close: newPose(),
      mid: newPose(),
      orbit: new Vector3(),
    }),
    [],
  );
  const geo = useMemo(() => (run ? runGeometry(run) : null), [run]);
  const wide = useMemo(() => (geo ? widePose(geo) : null), [geo]);
  const planet = useMemo(() => (geo && severity(run.result) > 0.3 ? planetPose(geo) : null), [geo, run]);
  // Stay on the crater until it has settled into its final shape (playback
  // seconds after impact), then pull back over the spreading damage.
  const holdUntil = useMemo(() => {
    const crater = run ? craterVisual(run.result) : null;
    if (!crater) return 2.2;
    const settled = playbackAt(collapseWindow(crater)[1], run) - APPROACH_SECONDS;
    return Math.min(5, Math.max(2.2, settled + 0.4));
  }, [run]);
  const cinematic = Boolean(run) && (phase === "approach" || phase === "impact");

  const applyPose = (pose) => {
    camera.position.copy(pose.position);
    camera.up.copy(pose.up);
    camera.lookAt(pose.target);
  };

  const fly = (to, duration, then) => {
    const from = currentPose(camera, controlsRef.current);
    if (reducedMotion || duration <= 0) {
      applyPose(to);
      then?.();
      return;
    }
    flight.current = { from, to, start: performance.now(), duration, then };
    // Controls would fight the scripted move; switch them off until it lands.
    if (controlsRef.current) controlsRef.current.enabled = false;
  };

  // Hand control to the user, orbiting either the globe or a surface point.
  const settle = (kind, center) => setControl((c) => ({ kind, center, key: c.key + 1 }));

  // A finished run: orbit the impact site. The camera lives outside React, so
  // syncing control state to the run's end is exactly what an effect is for.
  useEffect(() => {
    if (!geo || phase !== "done") return;
    flight.current = null;
    if (reducedMotion) applyPose(focusPose(geo.center, geo.frame, geo.viewRadiusRE, camera, geo.horizontal));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    settle("focus", geo.center);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, phase]);

  // "Focus target" button.
  useEffect(() => {
    if (!focusRequest) return;
    const { target, run: r } = useSim.getState();
    if (!target) return;
    const center = latLonToVector(target.lat, target.lon).normalize();
    const frame = localFrame(center);
    let outerM = 0;
    if (r) outerM = outermostRadiusM(r.result);
    else if (useSim.getState().asteroid)
      outerM = outermostRadiusM(simulateImpact(useSim.getState().params()));
    const viewRadiusRE = (Math.max(outerM, 20000) * 1.4) / 6.371e6;
    fly(focusPose(center, frame, viewRadiusRE, camera), 1400, () => settle("focus", center));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // "Crater" button: back to the close-up of the finished run's crater.
  useEffect(() => {
    if (!craterRequest || !geo) return;
    const pose = focusPose(geo.center, geo.frame, geo.closeRadiusRE, camera, geo.horizontal, newPose(), CRATER_TILT);
    fly(pose, 1400, () => settle("focus", geo.center));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [craterRequest]);

  // "Globe view" button.
  useEffect(() => {
    if (!globeRequest) return;
    fly(globePose(camera), 1400, () => settle("globe", null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globeRequest]);

  const wideStart = useRef(null);
  useEffect(() => {
    if (!cinematic) {
      wideStart.current = null;
      return;
    }
    flight.current = null;
    wideStart.current = currentPose(camera, controlsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cinematic, run?.id]);

  useFrame(() => {
    if (cinematic && geo && wideStart.current) {
      // A wide shot of the incoming path, then down to a close-up of the crater
      // as it forms; back out over the damage as the blast spreads, and out to
      // the whole planet after the largest impacts.
      const t = clock.t;
      const tau = t - APPROACH_SECONDS;
      // After impact the camera slowly circles the site, so the parallax shows
      // the crater, cloud and debris in depth instead of as a flat picture.
      const drift = tau > 0 ? ORBIT_RADIANS * easeInOut(Math.min(1, tau / (holdUntil + 6))) : 0;
      const around = scratch.orbit.copy(geo.horizontal).applyAxisAngle(geo.frame.up, drift);
      const close = focusPose(geo.center, geo.frame, geo.closeRadiusRE, camera, around, scratch.close, CRATER_TILT);
      let pose;
      if (tau < 0) {
        const intro = blendPose(wideStart.current, wide, easeInOut(Math.min(1, t / 1.2)), scratch.intro);
        const u = Math.min(1, t / APPROACH_SECONDS);
        pose = blendPose(intro, close, u < 0.3 ? 0 : easeInOut((u - 0.3) / 0.7), scratch.out);
      } else {
        const region = focusPose(geo.center, geo.frame, geo.viewRadiusRE, camera, around, scratch.focus);
        pose = blendPose(close, region, ramp(holdUntil, holdUntil + 2.4, tau), planet ? scratch.mid : scratch.out);
        if (planet) pose = blendPose(scratch.mid, planet, ramp(holdUntil + 3, holdUntil + 6, tau), scratch.out);
      }
      // Camera shake right after impact.
      if (tau > 0 && tau < 1.2) {
        const amp = pose.position.distanceTo(pose.target) * 0.012 * (1 - tau / 1.2);
        pose.position.x += (Math.random() - 0.5) * amp;
        pose.position.y += (Math.random() - 0.5) * amp;
        pose.position.z += (Math.random() - 0.5) * amp;
      }
      applyPose(pose);
      return;
    }
    const f = flight.current;
    if (f) {
      const t = Math.min(1, (performance.now() - f.start) / f.duration);
      applyPose(blendPose(f.from, f.to, easeInOut(t), scratch.out));
      if (t >= 1) {
        flight.current = null;
        if (controlsRef.current) controlsRef.current.enabled = !cinematic;
        f.then?.();
      }
    }
  });

  const focus = control.kind === "focus";
  const target = useMemo(() => (focus ? control.center.clone() : ORIGIN.clone()), [focus, control]);

  return (
    <OrbitControls
      key={control.key}
      ref={controlsRef}
      makeDefault
      target={target}
      enabled={!cinematic}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={focus ? 0.45 : 0.5}
      zoomSpeed={0.9}
      minDistance={focus ? 0.00008 : 1.08}
      maxDistance={focus ? 4 : 9}
      maxPolarAngle={focus ? 1.42 : Math.PI}
    />
  );
}
