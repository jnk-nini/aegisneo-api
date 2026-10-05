import { useSim } from "../store.js";
import { craterVisual } from "../scene/craterShape.js";
import { useIsMobile } from "./hooks.js";

const bump = (key) => () => useSim.setState((s) => ({ [key]: s[key] + 1 }));

const ICONS = {
  globe: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2.2 2.3 2.2 11.7 0 14M10 3c-2.2 2.3-2.2 11.7 0 14" />
    </>
  ),
  target: (
    <>
      <circle cx="10" cy="10" r="5.5" />
      <path d="M10 1.5v4M10 14.5v4M1.5 10h4M14.5 10h4" />
    </>
  ),
  crater: (
    <>
      <ellipse cx="10" cy="11" rx="7.5" ry="4" />
      <ellipse cx="10" cy="11.5" rx="4" ry="2" />
    </>
  ),
  zones: (
    <>
      <circle cx="10" cy="10" r="2" />
      <circle cx="10" cy="10" r="5" strokeDasharray="2 2" />
      <circle cx="10" cy="10" r="8" strokeDasharray="2 2" />
    </>
  ),
};

function ViewButton({ icon, label, onClick, disabled, pressed }) {
  return (
    <button
      type="button"
      className={`btn btn--small btn--glass view-btn ${pressed ? "is-on" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          {ICONS[icon]}
        </g>
      </svg>
      <span className="view-btn-label">{label}</span>
    </button>
  );
}

/** Camera shortcuts over the 3D view. "Whole globe" is always there as a way back. */
export default function ViewControls() {
  const target = useSim((s) => s.target);
  const run = useSim((s) => s.run);
  const phase = useSim((s) => s.phase);
  const mode = useSim((s) => s.mode);
  const view3d = useSim((s) => s.view3d);
  const showZoneRings = useSim((s) => s.showZoneRings);
  const isMobile = useIsMobile();
  const sheetFull = useSim((s) => s.sheet === "full");
  if (!view3d || mode !== "impact" || phase === "approach" || phase === "impact") return null;
  // With the panel pulled all the way up there's no globe to steer.
  if (isMobile && sheetFull) return null;
  const hasCrater = phase === "done" && Boolean(craterVisual(run?.result));
  return (
    <div className="view-controls" role="toolbar" aria-label="Camera">
      <ViewButton icon="globe" label="Whole globe" onClick={bump("globeRequest")} />
      <ViewButton icon="target" label="Zoom to target" disabled={!target} onClick={bump("focusRequest")} />
      {hasCrater && <ViewButton icon="crater" label="Crater" onClick={bump("craterRequest")} />}
      {run && (
        <ViewButton
          icon="zones"
          label="Damage zones"
          pressed={showZoneRings}
          onClick={() => useSim.getState().setShowZoneRings(!showZoneRings)}
        />
      )}
    </div>
  );
}
