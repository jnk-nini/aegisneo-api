import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useSim } from "./store.js";
import { useIsMobile } from "./ui/hooks.js";
import { loadEarthImages, loadLandMask } from "./lib/world.js";
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
  const globeReady = useSim((s) => s.globeReady);
  const restored = useRef(false);
  const show3d = view3d && !webglFailed;

  // Start painting the globe (in a worker) while the 3D code downloads; the
  // 2D map only needs the land/water mask.
  useEffect(() => {
    if (show3d) loadEarthImages().catch(() => {});
    else loadLandMask();
  }, [show3d]);

  // Restore a shared scenario from the URL once the view is ready to show it.
  useEffect(() => {
    if (restored.current || !location.search) return;
    if (show3d && !globeReady) return;
    restored.current = true;
    applyScenarioQuery(location.search, { launch: true }).catch(() => {});
  }, [show3d, globeReady]);

  // On phones, after choosing an asteroid, guide the user to pick a target on the globe.
  useEffect(() => {
    if (isMobile && asteroid && !useSim.getState().target) {
      useSim.setState({ mobileTab: "target", sheet: "peek" });
    }
  }, [asteroid, isMobile]);

  const failTo2d = (reason) => useSim.setState({ webglFailed: true, view3d: false, fallbackReason: reason });

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
          <ErrorBoundary
            fallback={
              <FallbackMap reason="The 3D view hit a problem, so you're seeing the 2D map instead." />
            }
            onError={() => failTo2d("The 3D view hit a problem, so you're seeing the 2D map instead.")}
          >
            <Suspense fallback={<Loading text="Loading 3D engine…" />}>
              <Scene
                loading={<Loading text="Painting the globe…" />}
                onContextLost={() =>
                  failTo2d("The graphics driver reset, so you're seeing the 2D map instead.")
                }
                onTextureError={() =>
                  failTo2d("The globe couldn't load, so you're seeing the 2D map instead.")
                }
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <FallbackMap reason={fallbackReason} />
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
