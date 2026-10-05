import { useSim } from "../store.js";

export default function TopBar({ onAbout }) {
  const mode = useSim((s) => s.mode);
  const asteroid = useSim((s) => s.asteroid);
  const view3d = useSim((s) => s.view3d);
  const webglFailed = useSim((s) => s.webglFailed);
  const phase = useSim((s) => s.phase);
  const busy = phase === "approach" || phase === "impact";
  const target = useSim((s) => s.target);
  const reset = useSim((s) => s.reset);

  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Impactor home">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <circle cx="18" cy="18" r="11" fill="#1b5f93" />
          <circle cx="18" cy="18" r="11" fill="none" stroke="#7fd4ff" strokeWidth="1.5" />
          <path d="M3 3 L13 13" stroke="#ffb347" strokeWidth="3" strokeLinecap="round" />
          <circle cx="14" cy="14" r="2.6" fill="#fff4d6" />
        </svg>
        <span className="brand-text">
          <span className="brand-name">Impactor</span>
          <span className="brand-sub">powered by AegisNEO</span>
        </span>
      </a>
      <nav className="topbar-actions" aria-label="View options">
        <div className="toggle" role="radiogroup" aria-label="Mode">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "impact"}
            className={mode === "impact" ? "is-active" : ""}
            onClick={() => useSim.setState({ mode: "impact" })}
          >
            Impact
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "flyby"}
            className={mode === "flyby" ? "is-active" : ""}
            disabled={!asteroid || busy || !view3d || webglFailed}
            title={!asteroid ? "Choose an asteroid to see its real flyby" : undefined}
            onClick={() => useSim.setState({ mode: "flyby" })}
          >
            Real flyby
          </button>
        </div>
        {!webglFailed && (
          <button
            type="button"
            className="btn btn--small btn--glass"
            disabled={busy}
            onClick={() => useSim.setState((s) => ({ view3d: !s.view3d, mode: "impact" }))}
            aria-pressed={!view3d}
          >
            {view3d ? "2D map" : "3D globe"}
          </button>
        )}
        {(asteroid || target) && (
          <button
            type="button"
            className="btn btn--small btn--glass"
            onClick={reset}
            title="Clear the asteroid, target and impact and start again"
          >
            Start over
          </button>
        )}
        <button type="button" className="btn btn--small btn--glass" onClick={onAbout}>
          About
        </button>
      </nav>
    </header>
  );
}
