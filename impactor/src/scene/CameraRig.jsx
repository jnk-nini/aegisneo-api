import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Vector3 } from "three";
import { useSim } from "../store.js";
import { latLonToVector, localFrame } from "./sphereMath.js";
import { EARTH_RADIUS_M, simulateImpact } from "../physics/impact.js";
import { outermostRadiusM } from "../physics/zones.js";
import { AFTERMATH_SECONDS, APPROACH_SECONDS, clock, playbackAt } from "./timeline.js";
import { blendPose, focusPose, newPose, runGeometry } from "./effects.js";
import { severity } from "./impactVisuals.js";
import { collapseWindow, craterVisual } from "./craterShape.js";
import GlobeControls from "./GlobeControls.jsx";
import { fitGlobeDistance, navFromCamera, newNav } from "./globeNav.js";

const ORIGIN = new Vector3();
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const ramp = (a, b, x) => easeInOut(Math.min(1, Math.max(0, (x - a) / (b - a))));
const CRATER_TILT = 55; // lower than the usual 38° so the crater's depth reads
const ORBIT_RADIANS = 0.22; // how far the camera circles the site during the aftermath
const AIRBURST_TILT = 68; // nearly side-on, so the burst shows above the ground
const FINALE_TILT = 50;
// The run ends back over the crater, so it is in view once the animation stops.
const FINALE = [AFTERMATH_SECONDS - 3.2, AFTERMATH_SECONDS - 0.2];
const poseCamera = new PerspectiveCamera();

/** Nav state (see globeNav.js) for a camera pose, so flights can end anywhere. */
function navFromPose(pose, camera) {
  poseCamera.fov = camera.fov;
  poseCamera.position.copy(pose.position);
  poseCamera.up.copy(pose.up);
  poseCamera.lookAt(pose.target);
  return navFromCamera(poseCamera, pose.target, newNav());
}

/** Radius (Earth radii) of the closing shot over the finished crater, or null for an airburst. */
function finaleRadiusRE(run, geo) {
  const crater = run ? craterVisual(run.result) : null;
  if (!crater) return null;
  // At sea, the crater that lasts is the smaller one on the seabed.
  const radiusM = crater.seafloor
    ? Math.max(crater.seafloor.radiusM * 1.3, crater.radiusM * 0.6)
    : crater.radiusM;
  return Math.min(geo.viewRadiusRE, (radiusM * 3.6) / EARTH_RADIUS_M);
}

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

function currentPose(camera) {
  const target = camera.userData.lookAt?.clone() ?? ORIGIN.clone();
  return { position: camera.position.clone(), target, up: camera.up.clone() };
}

/** Share of the screen's height the globe can use: phones lose some to the top bar and the sheet. */
function freeHeightShare(height) {
  const { sheetHeight, sheet } = useSim.getState();
  if (!window.matchMedia("(max-width: 1099px)").matches) return 1;
  const covered = Math.min(sheetHeight || height * (sheet === "peek" ? 0.2 : 0.52), height * 0.55);
  return Math.max(0.3, (height - covered - 60) / height);
}

/** The whole globe, north up, centred on `center` or on what is in view now. */
function globeNav(camera, center, height) {
  const nav = newNav();
  const look = center ?? camera.userData.lookAt;
  nav.n.copy(look && look.length() > 0.5 ? look : camera.position).normalize();
  nav.dist = fitGlobeDistance(camera, freeHeightShare(height));
  return nav;
}

/** Where the globe first faces: the viewer's part of the world, guessed from their time zone. */
function homeNav(camera, height) {
  const lon = Math.max(-180, Math.min(180, (-new Date().getTimezoneOffset() / 60) * 15));
  return globeNav(camera, latLonToVector(18, lon), height);
}

export default function CameraRig() {
  const camera = useThree((s) => s.camera);
  const height = useThree((s) => s.size.height);
  const run = useSim((s) => s.run);
  const phase = useSim((s) => s.phase);
  const focusRequest = useSim((s) => s.focusRequest);
  const craterRequest = useSim((s) => s.craterRequest);
  const globeRequest = useSim((s) => s.globeRequest);
  const reducedMotion = useSim((s) => s.reducedMotion);
  const controls = useRef();
  // Reused every frame so the cinematic allocates nothing (less GC stutter on phones).
  const scratch = useMemo(
    () => ({
      out: newPose(),
      intro: newPose(),
      focus: newPose(),
      close: newPose(),
      mid: newPose(),
      finale: newPose(),
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
    // Leave room for the pull-back to the whole planet before the closing shot.
    return Math.min(planet ? 3.4 : 5, Math.max(2.2, settled + 0.4));
  }, [run, planet]);
  const finaleRE = useMemo(() => (geo ? finaleRadiusRE(run, geo) : null), [run, geo]);
  const cinematic = Boolean(run) && (phase === "approach" || phase === "impact");

  const applyPose = (pose) => {
    camera.position.copy(pose.position);
    camera.up.copy(pose.up);
    camera.lookAt(pose.target);
    (camera.userData.lookAt ??= new Vector3()).copy(pose.target);
  };

  const fly = (to, duration) => {
    const nav = to.n ? to : navFromPose(to, camera);
    controls.current?.flyTo(nav, reducedMotion ? 1 : duration);
  };

  // A finished run leaves the camera over the crater; the controls take over
  // from there (GlobeControls syncs when it is switched back on), free to roam.
  useEffect(() => {
    if (!geo || phase !== "done" || !reducedMotion) return;
    applyPose(
      finaleRE
        ? focusPose(geo.center, geo.frame, finaleRE, camera, geo.horizontal, newPose(), FINALE_TILT)
        : focusPose(geo.center, geo.frame, geo.viewRadiusRE, camera, geo.horizontal),
    );
    controls.current?.sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, phase]);

  // First view: the viewer's own side of the planet, the whole globe in view.
  useEffect(() => {
    if (!useSim.getState().run) controls.current?.flyTo(homeNav(camera, height), 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Zoom to target" button.
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
    fly(focusPose(center, frame, viewRadiusRE, camera), 1600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // "Crater" button: back to the close-up of the finished run's crater.
  useEffect(() => {
    if (!craterRequest || !geo) return;
    const pose = focusPose(
      geo.center,
      geo.frame,
      finaleRE ?? geo.closeRadiusRE,
      camera,
      geo.horizontal,
      newPose(),
      CRATER_TILT,
    );
    fly(pose, 1600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [craterRequest]);

  // "Reset view": the whole globe, north up, over the target if there is one.
  useEffect(() => {
    if (!globeRequest) return;
    const { target } = useSim.getState();
    fly(globeNav(camera, target ? latLonToVector(target.lat, target.lon) : null, height), 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globeRequest]);

  const wideStart = useRef(null);
  useEffect(() => {
    if (!cinematic) {
      wideStart.current = null;
      return;
    }
    controls.current?.stop();
    wideStart.current = currentPose(camera);
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
      const close = focusPose(
        geo.closeTarget,
        geo.frame,
        geo.closeRadiusRE,
        camera,
        around,
        scratch.close,
        geo.airburst ? AIRBURST_TILT : CRATER_TILT,
      );
      let pose;
      if (tau < 0) {
        const intro = blendPose(wideStart.current, wide, easeInOut(Math.min(1, t / 1.2)), scratch.intro);
        const u = Math.min(1, t / APPROACH_SECONDS);
        pose = blendPose(intro, close, u < 0.3 ? 0 : easeInOut((u - 0.3) / 0.7), scratch.out);
      } else {
        // Close-up, then one slow pull-back over the spreading damage (the whole
        // planet after the largest impacts), then back down over the crater.
        const pulled =
          planet ?? focusPose(geo.center, geo.frame, geo.viewRadiusRE, camera, around, scratch.focus);
        const pullBack = ramp(holdUntil, Math.min(holdUntil + 3.2, FINALE[0] - 0.4), tau);
        pose = blendPose(close, pulled, pullBack, scratch.mid);
        if (finaleRE) {
          const finale = focusPose(
            geo.center,
            geo.frame,
            finaleRE,
            camera,
            around,
            scratch.finale,
            FINALE_TILT,
          );
          pose = blendPose(pose, finale, ramp(FINALE[0], FINALE[1], tau), scratch.out);
        }
      }
      // A short, smooth rumble right after impact (not per-frame jitter).
      if (tau > 0 && tau < 0.9 && !reducedMotion) {
        const amp = pose.position.distanceTo(pose.target) * 0.004 * (1 - tau / 0.9) ** 2;
        pose.position.x += Math.sin(tau * 47) * amp;
        pose.position.y += Math.sin(tau * 39 + 1.3) * amp;
        pose.position.z += Math.sin(tau * 53 + 2.1) * amp;
      }
      applyPose(pose);
    }
  });

  return <GlobeControls ref={controls} enabled={!cinematic} />;
}
