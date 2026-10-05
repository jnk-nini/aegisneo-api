import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor, Stars } from "@react-three/drei";
import { useSim } from "../store.js";
import { subsolarPoint } from "../lib/geo.js";
import { pickTarget } from "../lib/target.js";
import { isWeakRenderer, rendererName } from "../lib/gpu.js";
import { latLonToVector, vectorToLatLon } from "./sphereMath.js";
import { useEarthTextures } from "./useEarthTextures.js";
import Earth from "./Earth.jsx";
import CameraRig from "./CameraRig.jsx";
import Flyby from "./Flyby.jsx";
import { ImpactSequence, PreviewZones, TargetMarker, Timeline } from "./ImpactScene.jsx";
import PostFX from "./PostFX.jsx";

const isCoarse = () => window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;

/**
 * On phones the bottom sheet covers the lower part of the full-height canvas.
 * Shift the projection so the camera's centre (the globe, or the impact site)
 * sits in the middle of the area left visible between the top bar and the sheet.
 */
function SheetViewOffset() {
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);
  const sheetHeight = useSim((s) => s.sheetHeight);
  useEffect(() => {
    if (!sheetHeight) {
      camera.clearViewOffset();
      return;
    }
    const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 0;
    // Past half the screen the sheet is being read, not the globe; stop following it.
    const covered = Math.min(sheetHeight, height * 0.55);
    camera.setViewOffset(width, height, 0, (covered - topbar) / 2, width, height);
  }, [camera, width, height, sheetHeight]);
  useEffect(() => () => camera.clearViewOffset(), [camera]);
  return null;
}

function ImpactWorld({ textures, sunDir }) {
  const phase = useSim((s) => s.phase);
  const onSurfaceClick = (event) => {
    // Ignore drags (orbiting the globe) and taps during the animation.
    if (event.delta > 6 || phase === "approach" || phase === "impact") return;
    event.stopPropagation();
    const { lat, lon } = vectorToLatLon(event.point);
    pickTarget(lat, lon);
  };
  return (
    <>
      <Earth textures={textures} sunDir={sunDir} onSurfaceClick={onSurfaceClick} showZones />
      <TargetMarker />
      <PreviewZones />
      <ImpactSequence textures={textures} sunDir={sunDir} />
      <CameraRig />
      <Timeline />
    </>
  );
}

/**
 * The 3D view. Loaded lazily with three.js, so people who only see the 2D map
 * never download either; shows `loading` while the globe is being painted.
 */
export default function Scene({ loading, onContextLost, onTextureError }) {
  const { textures, error } = useEarthTextures();
  useEffect(() => {
    if (error) onTextureError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  useEffect(() => {
    useSim.setState({ globeReady: Boolean(textures) });
    return () => useSim.setState({ globeReady: false });
  }, [textures]);
  if (!textures) return loading;
  return <SceneCanvas textures={textures} onContextLost={onContextLost} />;
}

function SceneCanvas({ textures, onContextLost }) {
  const mode = useSim((s) => s.mode);
  const asteroid = useSim((s) => s.asteroid);
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, isCoarse() ? 1.75 : 2));
  const coarse = useMemo(() => isCoarse(), []);
  useEffect(() => {
    if (coarse) useSim.setState({ quality: "low" });
  }, [coarse]);
  // Switching quality rebuilds every shader, a visible freeze, so a drop asked
  // for during an impact waits until it has finished.
  const phase = useSim((s) => s.phase);
  const busy = phase === "approach" || phase === "impact";
  const lowerLater = useRef(false);
  useEffect(() => {
    if (!busy && lowerLater.current) {
      lowerLater.current = false;
      useSim.setState({ quality: "low" });
    }
  }, [busy]);
  // Real day/night for the moment the page was opened.
  const sunDir = useMemo(() => {
    const { lat, lon } = subsolarPoint(new Date());
    return latLonToVector(lat, lon).normalize();
  }, []);
  const flyby = mode === "flyby" && asteroid;
  const starRadius = flyby ? Math.max(asteroid.miss_distance_km / 384400, 1) * 60 : 300;

  // React Three Fiber deliberately drops the WebGL context when the 3D view
  // unmounts (e.g. switching to the 2D map). That isn't a driver reset, so the
  // fallback timer must not outlive the view.
  const contextLoss = useRef({ mounted: true, timer: null });
  useEffect(() => {
    const state = contextLoss.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      clearTimeout(state.timer);
    };
  }, []);

  return (
    <Canvas
      className="scene-canvas"
      dpr={dpr}
      camera={{ fov: 45, near: 1e-5, far: 2000, position: [0.6, 0.9, 3.3] }}
      gl={{
        // The scene is drawn into the post-processing buffers (PostFX), which do
        // their own anti-aliasing, so the canvas itself needs none.
        antialias: false,
        logarithmicDepthBuffer: true,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        // Integrated and phone GPUs start in the lighter mode, at a modest resolution.
        if (isWeakRenderer(rendererName(gl.getContext()))) {
          useSim.setState({ quality: "low" });
          setDpr((d) => Math.min(d, 1.25));
        }
        // Phones drop the GPU context under memory pressure. three.js rebuilds it
        // when the browser restores it; only fall back to 2D if that doesn't happen.
        const state = contextLoss.current;
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          if (!state.mounted) return;
          state.timer = setTimeout(() => state.mounted && onContextLost(), 4000);
        });
        gl.domElement.addEventListener("webglcontextrestored", () => clearTimeout(state.timer));
      }}
      aria-label="3D view of Earth. Choose a target with the panel or by tapping the globe."
      role="img"
    >
      <PerformanceMonitor
        onDecline={() => {
          // Lower the resolution first; once it's at 1×, simplify the effects too.
          if (dpr <= 1) {
            const { phase: now } = useSim.getState();
            if (now === "approach" || now === "impact") lowerLater.current = true;
            else useSim.setState({ quality: "low" });
          }
          setDpr((d) => Math.max(1, d * 0.75));
        }}
      />
      <color attach="background" args={["#020309"]} />
      <ambientLight intensity={0.06} />
      <directionalLight position={sunDir.clone().multiplyScalar(10)} intensity={2.4} />
      <Stars
        radius={starRadius}
        depth={starRadius * 0.3}
        count={coarse ? 2500 : 6000}
        factor={4}
        saturation={0}
        fade
        speed={0.3}
      />
      {flyby ? (
        <Flyby textures={textures} sunDir={sunDir} />
      ) : (
        <ImpactWorld textures={textures} sunDir={sunDir} />
      )}
      <PostFX />
      <SheetViewOffset />
    </Canvas>
  );
}
