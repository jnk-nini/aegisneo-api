import { useId, useState } from "react";
import { formatMonthDay } from "../lib/format.js";
import Modal from "./Modal.jsx";
import SkyControls from "./SkyControls.jsx";

/**
 * On phones, the sky being charted is one pill ("Year 2024 ▾"). Tapping it opens
 * a short sheet with the Year / Birthday switch and the picker; the chart
 * behind it changes as you pick.
 */
export default function SkyPicker({ sky, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const birthday = sky.mode === "date";

  return (
    <>
      <button
        type="button"
        className="sky-pill"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={`Sky: ${birthday ? formatMonthDay(sky.date) : sky.year}. Change it`}
      >
        <span className="sky-pill-kind">{birthday ? "Birthday" : "Year"}</span>
        <span className="sky-pill-value">{birthday ? formatMonthDay(sky.date) : sky.year}</span>
        <span className="sky-pill-caret" aria-hidden="true" />
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} labelledBy={titleId} className="sheet-modal">
          <div className="sheet-body">
            <h2 id={titleId}>Which sky?</h2>
            <p className="sheet-note">A whole year, or one date (like your birthday) across every year.</p>
            <SkyControls sky={sky} onChange={onChange} />
            <button type="button" className="btn btn-solid sheet-done" onClick={() => setOpen(false)}>
              Show this sky
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
