import { useSim } from "../store.js";

/** Camera shortcuts over the 3D view. */
export default function ViewControls() {
  const target = useSim((s) => s.target);
  const phase = useSim((s) => s.phase);
  const mode = useSim((s) => s.mode);
  const view3d = useSim((s) => s.view3d);
  if (!view3d || mode !== "impact" || phase === "approach" || phase === "impact") return null;
  return (
    <div className="view-controls">
      <button
        type="button"
        className="btn btn--small btn--glass"
        onClick={() => useSim.setState((s) => ({ globeRequest: s.globeRequest + 1 }))}
      >
        Globe view
      </button>
      <button
        type="button"
        className="btn btn--small btn--glass"
        disabled={!target}
        onClick={() => useSim.setState((s) => ({ focusRequest: s.focusRequest + 1 }))}
      >
        Zoom to target
      </button>
    </div>
  );
}
