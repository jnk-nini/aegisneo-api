import { SYSTEM_REDUCED_MOTION, useSim } from "../store.js";

export default function LaunchBar() {
  const asteroid = useSim((s) => s.asteroid);
  const target = useSim((s) => s.target);
  const phase = useSim((s) => s.phase);
  const launch = useSim((s) => s.launch);
  const reducedMotion = useSim((s) => s.reducedMotion);
  const setAnimate = useSim((s) => s.setAnimate);
  const view3d = useSim((s) => s.view3d);
  const running = phase === "approach" || phase === "impact";

  const reason = !asteroid ? "Choose an asteroid first" : !target ? "Pick a target on the globe" : null;

  const onLaunch = () => {
    launch();
    // Keep the address bar in sync so reloading or copying the URL replays this scenario.
    try {
      history.replaceState(null, "", `?${useSim.getState().run.query}`);
    } catch {
      /* some embedded browsers block history changes — sharing still works from Results */
    }
  };

  return (
    <div className="launch-bar">
      <button
        type="button"
        className="btn btn--launch"
        onClick={onLaunch}
        disabled={Boolean(reason) || running}
        aria-describedby="launch-reason"
      >
        {running ? "Impact in progress…" : phase === "done" ? "Launch again" : "Launch impact"}
      </button>
      <span id="launch-reason" className="launch-reason">
        {reason ?? ""}
      </span>
      {SYSTEM_REDUCED_MOTION && view3d && (
        <label className="motion-toggle">
          <input type="checkbox" checked={!reducedMotion} onChange={(e) => setAnimate(e.target.checked)} />
          <span>
            Animate the impact <small>(your device asks for reduced motion)</small>
          </span>
        </label>
      )}
    </div>
  );
}
