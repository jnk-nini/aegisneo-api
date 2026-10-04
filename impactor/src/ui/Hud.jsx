import { useEffect, useRef } from "react";
import { useSim } from "../store.js";
import { TOTAL_SECONDS, clock, simulatedSeconds } from "../scene/timeline.js";
import { formatClock } from "../lib/format.js";

const SPEEDS = [0.25, 0.5, 1, 2, 4];

/** Simulation clock and playback controls shown over the 3D view during a run. */
export default function Hud() {
  const run = useSim((s) => s.run);
  const phase = useSim((s) => s.phase);
  const paused = useSim((s) => s.paused);
  const timeScale = useSim((s) => s.timeScale);
  const view3d = useSim((s) => s.view3d);
  const mode = useSim((s) => s.mode);
  const clockRef = useRef();

  useEffect(() => {
    if (!run) return;
    let frame;
    const tick = () => {
      if (clockRef.current) {
        const s = simulatedSeconds(Math.min(clock.t, TOTAL_SECONDS), run);
        clockRef.current.textContent = `T${s < 0 ? "−" : "+"}${formatClock(Math.abs(s))}`;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [run]);

  if (!run || !view3d || phase === "idle" || mode === "flyby") return null;
  const running = phase === "approach" || phase === "impact";

  const replay = () => {
    clock.t = 0;
    useSim.setState({ phase: "approach", paused: false, sheet: "peek" });
  };
  const skip = () => {
    clock.t = TOTAL_SECONDS;
    useSim.getState().setPhase("done");
  };

  return (
    <div className="hud" role="group" aria-label="Simulation playback">
      <div className="hud-clock">
        <span className={`hud-phase hud-phase--${phase}`}>
          {phase === "approach" ? "Approach" : phase === "impact" ? "Impact" : "Aftermath"}
        </span>
        <span ref={clockRef} className="hud-time" aria-hidden="true" />
      </div>
      {running ? (
        <div className="hud-controls">
          <button
            type="button"
            className="icon-btn"
            onClick={() => useSim.setState({ paused: !paused })}
            aria-label={paused ? "Play" : "Pause"}
          >
            {paused ? "▶" : "❚❚"}
          </button>
          <div className="speed-group" role="radiogroup" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={timeScale === s}
                className={`speed ${timeScale === s ? "is-active" : ""}`}
                onClick={() => useSim.setState({ timeScale: s })}
              >
                {s}×
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--small" onClick={skip}>
            Skip
          </button>
        </div>
      ) : (
        <div className="hud-controls">
          <button type="button" className="btn btn--small" onClick={replay}>
            Replay
          </button>
        </div>
      )}
    </div>
  );
}
