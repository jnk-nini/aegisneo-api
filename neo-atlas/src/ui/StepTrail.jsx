const STEPS = ["Your stars", "Postcard", "Send"];

/**
 * Where you are in making a postcard: three steps, the current one lit and the
 * ones behind it ticked. `step` 4 means all three are done.
 */
export default function StepTrail({ step, className = "" }) {
  return (
    <ol
      className={`trail ${className}`}
      aria-label={step > STEPS.length ? "All 3 steps done" : `Step ${step} of 3`}
    >
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "now" : "next";
        return (
          <li
            key={label}
            className={`trail-step ${state}`}
            aria-current={state === "now" ? "step" : undefined}
          >
            <span className="trail-dot" aria-hidden="true">
              {state === "done" ? "✓" : n}
            </span>
            <span className="trail-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
