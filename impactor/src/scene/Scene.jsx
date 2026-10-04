import { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor, Stars } from "@react-three/drei";
import { useSim } from "../store.js";
import { latLonToVector, subsolarPoint, vectorToLatLon } from "../lib/geo.js";
import { pickTarget } from "../lib/target.js";
import Earth from "./Earth.jsx";
import CameraRig from "./CameraRig.jsx";
import Flyby from "./Flyby.jsx";
import { ImpactSequence, PreviewZones, TargetMarker, Timeline } from "./ImpactScene.jsx";

const isCoarse = () => window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;

/** Lets the UI grab a PNG of the current 3D view without preserveDrawingBuffer. */
function CaptureBridge() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    useSim.setState({
      capture: () =>
        new Promise((resolve) => {
          gl.render(scene, camera);
          gl.domElement.toBlob(resolve, "image/png");
        }),
    });
    return () => useSim.setState({ capture: null });
  }, [gl, scene, camera]);
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
      <Earth textures={textures} sunDir={sunDir} onSurfaceClick={onSurfaceClick} />
      <TargetMarker />
      <PreviewZones />
      <ImpactSequence />
      <CameraRig />
      <Timeline />
    </>
  );
}

export default function Scene({ textures, onContextLost }) {
  const mode = useSim((s) => s.mode);
  const asteroid = useSim((s) => s.asteroid);
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, isCoarse() ? 1.75 : 2));
  const coarse = useMemo(() => isCoarse(), []);
  // Real day/night for the moment the page was opened.
  const sunDir = useMemo(() => {
    const { lat, lon } = subsolarPoint(new Date());
    return latLonToVector(lat, lon).normalize();
  }, []);
  const flyby = mode === "flyby" && asteroid;
  const starRadius = flyby ? Math.max(asteroid.miss_distance_km / 384400, 1) * 60 : 300;

  return (
    <Canvas
      className="scene-canvas"
      dpr={dpr}
      camera={{ fov: 45, near: 1e-5, far: 2000, position: [0.6, 0.9, 3.3] }}
      gl={{
        antialias: !coarse || dpr < 2,
        logarithmicDepthBuffer: true,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        // Phones drop the GPU context under memory pressure. three.js rebuilds it
        // when the browser restores it; only fall back to 2D if that doesn't happen.
        let fallbackTimer = null;
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          fallbackTimer = setTimeout(onContextLost, 4000);
        });
        gl.domElement.addEventListener("webglcontextrestored", () => clearTimeout(fallbackTimer));
      }}
      aria-label="3D view of Earth. Choose a target with the panel or by tapping the globe."
      role="img"
    >
      <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(1, d * 0.75))} />
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
      <CaptureBridge />
    </Canvas>
  );
}
