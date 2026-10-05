import { useEffect, useRef, useState } from "react";
import { useSim } from "../store.js";
import { useIsMobile } from "./hooks.js";

/** Phones get one menu button instead of a row of them. */
function Menu({ items }) {
  const [open, setOpen] = useState(false);
  const root = useRef();
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className="btn btn--small btn--glass menu-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items
            .filter((i) => !i.hidden)
            .map((i) => (
              <button
                key={i.label}
                type="button"
                role={i.checked == null ? "menuitem" : "menuitemradio"}
                aria-checked={i.checked ?? undefined}
                className={i.checked ? "is-active" : ""}
                disabled={i.disabled}
                onClick={() => {
                  setOpen(false);
                  i.onClick();
                }}
              >
                {i.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export default function TopBar({ onAbout }) {
  const isMobile = useIsMobile();
  const mode = useSim((s) => s.mode);
  const asteroid = useSim((s) => s.asteroid);
  const view3d = useSim((s) => s.view3d);
  const webglFailed = useSim((s) => s.webglFailed);
  const phase = useSim((s) => s.phase);
  const busy = phase === "approach" || phase === "impact";
  const target = useSim((s) => s.target);
  const reset = useSim((s) => s.reset);
  const flybyDisabled = !asteroid || busy || !view3d || webglFailed;
  const toggleView = () => useSim.setState((s) => ({ view3d: !s.view3d, mode: "impact" }));

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
      {isMobile ? (
        <nav className="topbar-actions" aria-label="View options">
          {mode === "flyby" && (
            <button
              type="button"
              className="btn btn--small btn--glass"
              onClick={() => useSim.setState({ mode: "impact" })}
            >
              Back to impact
            </button>
          )}
          <Menu
            items={[
              {
                label: "Impact",
                checked: mode === "impact",
                onClick: () => useSim.setState({ mode: "impact" }),
              },
              {
                label: "Real flyby",
                checked: mode === "flyby",
                disabled: flybyDisabled,
                onClick: () => useSim.setState({ mode: "flyby" }),
              },
              {
                label: view3d ? "2D map" : "3D globe",
                hidden: webglFailed,
                disabled: busy,
                onClick: toggleView,
              },
              { label: "Start over", hidden: !(asteroid || target), onClick: reset },
              { label: "About", onClick: onAbout },
            ]}
          />
        </nav>
      ) : (
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
              disabled={flybyDisabled}
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
              onClick={toggleView}
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
      )}
    </header>
  );
}
