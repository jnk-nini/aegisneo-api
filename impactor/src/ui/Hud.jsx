import { useEffect, useMemo, useRef } from "react";
import { useSim } from "../store.js";
import { TOTAL_SECONDS, clock, isTimeLapse, simulatedSeconds } from "../scene/timeline.js";
import { craterVisual } from "../scene/craterShape.js";
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
  const shown = Boolean(run) && view3d && phase !== "idle" && mode !== "flyby";
  // Where the picture departs from true scale, say so.
  const notes = useMemo(() => {
    if (!run) return [];
    const crater = craterVisual(run.result);
    const list = [];
    if (crater && crater.kind !== "water" && crater.exaggeration > 1) {
      list.push({ text: `Crater depth ×${crater.exaggeration}`, title: "Depth exaggerated so the crater is visible" });
    }
    if (isTimeLapse(run)) {
      list.push({ text: "Time-lapse", title: "The clock speeds up as it runs; the time shown is real" });
    }
    if (crater?.kind === "water") {
      list.push({ text: "Tsunami ring illustrative", title: "The model doesn't calculate tsunami height" });
    }
    return list;
  }, [run]);
  const running = phase === "approach" || phase === "impact";

  // Tick every frame only while the animation plays; once it's over, one
  // final update is enough, so phones aren't kept busy for nothing.
  useEffect(() => {
    if (!shown) return;
    let frame;
    const tick = () => {
      if (clockRef.current) {
        const s = simulatedSeconds(Math.min(clock.t, TOTAL_SECONDS), run);
        clockRef.current.textContent = `T${s < 0 ? "−" : "+"}${formatClock(Math.abs(s))}`;
      }
      if (running) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [run, shown, running]);

  if (!shown) return null;

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
      {notes.length > 0 && (
        <p className="hud-notes">
          {notes.map((n) => (
            <span key={n.text} title={n.title}>
              {n.text}
            </span>
          ))}
        </p>
      )}
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
