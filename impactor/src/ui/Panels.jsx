import { useEffect, useRef } from "react";
import { useSim } from "../store.js";
import ObjectSection from "./ObjectSection.jsx";
import TargetSection from "./TargetSection.jsx";
import TuneSection from "./TuneSection.jsx";
import LaunchBar from "./LaunchBar.jsx";
import ResultsSection, { SavedList } from "./ResultsSection.jsx";

export function DesktopPanels() {
  return (
    <>
      <aside className="panel panel--left" aria-label="Simulation setup">
        <div className="panel-scroll">
          <ObjectSection />
          <TargetSection />
          <TuneSection />
          <SavedList />
        </div>
        <LaunchBar />
      </aside>
      <aside className="panel panel--right" aria-label="Results">
        <div className="panel-scroll">
          <ResultsSection />
        </div>
      </aside>
    </>
  );
}

const TABS = [
  { key: "object", label: "Asteroid" },
  { key: "target", label: "Target" },
  { key: "tune", label: "Tune" },
  { key: "results", label: "Results" },
];
const SNAPS = ["peek", "half", "full"];

/** Bottom sheet for phones: drag the handle or tap it to cycle heights. */
export function MobileSheet() {
  const tab = useSim((s) => s.mobileTab);
  const sheet = useSim((s) => s.sheet);
  const sheetRef = useRef();
  const drag = useRef(null);

  // Expose the sheet height so the HUD and view buttons can sit above it.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const update = () =>
      document.documentElement.style.setProperty("--sheet-h", `${el.getBoundingClientRect().height}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setSheet = (value) => useSim.setState({ sheet: value });
  const cycle = () => setSheet(SNAPS[(SNAPS.indexOf(sheet) + 1) % SNAPS.length]);

  const onPointerDown = (e) => {
    drag.current = { y: e.clientY, h: sheetRef.current.getBoundingClientRect().height, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) {
      sheetRef.current.style.transition = "none";
      sheetRef.current.style.height = `${Math.max(120, Math.min(window.innerHeight * 0.9, d.h + dy))}px`;
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const el = sheetRef.current;
    el.style.transition = "";
    if (!d.moved) return cycle();
    const ratio = el.getBoundingClientRect().height / window.innerHeight;
    el.style.height = "";
    setSheet(ratio < 0.3 ? "peek" : ratio < 0.68 ? "half" : "full");
  };

  const selectTab = (key) =>
    useSim.setState((s) => ({ mobileTab: key, sheet: s.sheet === "peek" ? "half" : s.sheet }));

  return (
    <section ref={sheetRef} className={`sheet sheet--${sheet}`} aria-label="Simulation controls">
      <button
        type="button"
        className="sheet-handle"
        aria-label={`Resize panel (currently ${sheet})`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span />
      </button>
      <div className="sheet-tabs" role="tablist" aria-label="Panels">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="sheet-panel"
            className={tab === t.key ? "is-active" : ""}
            onClick={() => selectTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <LaunchBar />
      <div className="sheet-body" id="sheet-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "object" && (
          <>
            <ObjectSection />
            <SavedList />
          </>
        )}
        {tab === "target" && <TargetSection />}
        {tab === "tune" && <TuneSection />}
        {tab === "results" && <ResultsSection />}
      </div>
    </section>
  );
}
