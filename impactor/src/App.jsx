import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useSim } from "./store.js";
import { useIsMobile } from "./ui/hooks.js";
import { useEarthTextures } from "./scene/useEarthTextures.js";
import { applyScenarioQuery } from "./lib/scenario.js";
import TopBar from "./ui/TopBar.jsx";
import Hud from "./ui/Hud.jsx";
import ViewControls from "./ui/ViewControls.jsx";
import FallbackMap from "./ui/FallbackMap.jsx";
import ErrorBoundary from "./ui/ErrorBoundary.jsx";
import AboutDialog from "./ui/AboutDialog.jsx";
import FlybyCaption from "./ui/FlybyCaption.jsx";
import { DesktopPanels, MobileSheet } from "./ui/Panels.jsx";

const Scene = lazy(() => import("./scene/Scene.jsx"));

function ScreenFlash() {
  const phase = useSim((s) => s.phase);
  const reducedMotion = useSim((s) => s.reducedMotion);
  if (phase !== "impact" || reducedMotion) return null;
  return <div className="screen-flash" aria-hidden="true" />;
}

function Loading({ text }) {
  return (
    <div className="loading" role="status">
      <div className="loading-orbit" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const view3d = useSim((s) => s.view3d);
  const webglFailed = useSim((s) => s.webglFailed);
  const asteroid = useSim((s) => s.asteroid);
  const reducedMotion = useSim((s) => s.reducedMotion);
  const [aboutOpen, setAboutOpen] = useState(false);
  const fallbackReason = useSim((s) => s.fallbackReason);
  const { textures, error: textureError } = useEarthTextures();
  const restored = useRef(false);

  // Restore a shared scenario from the URL once the globe is ready to show it.
  useEffect(() => {
    if (restored.current || !location.search) return;
    if (!textures && !webglFailed && !textureError) return;
    restored.current = true;
    applyScenarioQuery(location.search, { launch: true }).catch(() => {});
  }, [textures, webglFailed, textureError]);

  // On phones, after choosing an asteroid, guide the user to pick a target on the globe.
  useEffect(() => {
    if (isMobile && asteroid && !useSim.getState().target) {
      useSim.setState({ mobileTab: "target", sheet: "peek" });
    }
  }, [asteroid, isMobile]);

  const failTo2d = (reason) => useSim.setState({ webglFailed: true, view3d: false, fallbackReason: reason });

  const show3d = view3d && !webglFailed && !textureError;

  return (
    <div
      className={`app ${isMobile ? "app--mobile" : "app--desktop"} ${reducedMotion ? "reduce-motion" : ""}`}
    >
      <a className="skip-link" href="#main-controls">
        Skip to controls
      </a>
      <TopBar onAbout={() => setAboutOpen(true)} />
      <main className="stage" aria-label="Simulation view">
        {show3d ? (
          textures ? (
            <ErrorBoundary
              fallback={
                <FallbackMap reason="The 3D view hit a problem, so you're seeing the 2D map instead." />
              }
              onError={() => useSim.setState({ webglFailed: true })}
            >
              <Suspense fallback={<Loading text="Loading 3D engine…" />}>
                <Scene
                  textures={textures}
                  onContextLost={() =>
                    failTo2d("The graphics driver reset, so you're seeing the 2D map instead.")
                  }
                />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <Loading text="Painting the globe…" />
          )
        ) : (
          <FallbackMap
            reason={
              textureError ? "The globe couldn't load, so you're seeing the 2D map instead." : fallbackReason
            }
          />
        )}
        <ScreenFlash />
        <FlybyCaption />
        <ViewControls />
        <Hud />
      </main>
      <div id="main-controls">{isMobile ? <MobileSheet /> : <DesktopPanels />}</div>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
