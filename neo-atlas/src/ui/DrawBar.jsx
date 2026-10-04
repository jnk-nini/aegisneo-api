import { useId, useState } from "react";
import { MAX_NAME, MIN_STARS } from "../lib/constellations.js";

function instructions(count) {
  if (count === 0) return "Tap a star to start your constellation.";
  if (count === 1) return "Now tap another star to draw a line to it.";
  return `${count} stars joined. Keep going, or tap Done.`;
}

/**
 * Shown under the chart while making a constellation: what to do next, Undo,
 * Cancel and Done. Done asks for a name, then saves.
 */
export default function DrawBar({ count, points, defaultName, onUndo, onCancel, onSave }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(defaultName);
  const inputId = useId();

  if (naming) {
    return (
      <form
        className="draw-bar"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name);
        }}
      >
        <label htmlFor={inputId} className="draw-label">
          Name your constellation
        </label>
        <input
          id={inputId}
          className="text-input"
          value={name}
          maxLength={MAX_NAME}
          autoComplete="off"
          enterKeyHint="done"
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <div className="draw-actions">
          <button type="button" className="btn btn-small btn-quiet" onClick={() => setNaming(false)}>
            Back
          </button>
          <button type="submit" className="btn btn-small btn-solid">
            Save
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="draw-bar">
      <p className="draw-label" role="status">
        <span className="draw-star" aria-hidden="true">
          ✦
        </span>{" "}
        {instructions(count)}
      </p>
      <div className="draw-actions">
        <button type="button" className="btn btn-small btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-small" onClick={onUndo} disabled={points === 0}>
          Undo
        </button>
        <button
          type="button"
          className="btn btn-small btn-solid"
          onClick={() => setNaming(true)}
          disabled={count < MIN_STARS}
        >
          Done
        </button>
      </div>
    </div>
  );
}
