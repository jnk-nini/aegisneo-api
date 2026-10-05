import { useSim } from "../store.js";
import { craterVisual } from "../scene/craterShape.js";

const bump = (key) => () => useSim.setState((s) => ({ [key]: s[key] + 1 }));

/** Camera shortcuts over the 3D view. */
export default function ViewControls() {
  const target = useSim((s) => s.target);
  const run = useSim((s) => s.run);
  const phase = useSim((s) => s.phase);
  const mode = useSim((s) => s.mode);
  const view3d = useSim((s) => s.view3d);
  const showZoneRings = useSim((s) => s.showZoneRings);
  if (!view3d || mode !== "impact" || phase === "approach" || phase === "impact") return null;
  const hasCrater = phase === "done" && Boolean(craterVisual(run?.result));
  return (
    <div className="view-controls">
      <button type="button" className="btn btn--small btn--glass" onClick={bump("globeRequest")}>
        Globe view
      </button>
      <button type="button" className="btn btn--small btn--glass" disabled={!target} onClick={bump("focusRequest")}>
        Zoom to target
      </button>
      {hasCrater && (
        <button type="button" className="btn btn--small btn--glass" onClick={bump("craterRequest")}>
          Crater
        </button>
      )}
      {run && (
        <button
          type="button"
          className={`btn btn--small btn--glass ${showZoneRings ? "is-on" : ""}`}
          aria-pressed={showZoneRings}
          onClick={() => useSim.getState().setShowZoneRings(!showZoneRings)}
        >
          Damage zones
        </button>
      )}
    </div>
  );
}
