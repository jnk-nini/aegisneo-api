import { useEffect, useId, useRef } from "react";

/**
 * A yes/no question in a modal <dialog>, which keeps focus inside and closes on
 * Escape. `request` is { title, body, confirmLabel, cancelLabel, onConfirm, onCancel } or null.
 */
export default function ConfirmDialog({ request, onClose }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  const answer = (confirmed) => {
    onClose();
    if (confirmed) request?.onConfirm();
    else request?.onCancel?.();
  };

  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault(); // Escape: answer "no" through the same path
        answer(false);
      }}
      onClick={(e) => e.target === ref.current && answer(false)} // a tap on the backdrop
    >
      {request && (
        <div className="confirm-body">
          <h2 id={titleId}>{request.title}</h2>
          {request.body && <p>{request.body}</p>}
          <div className="confirm-actions">
            <button type="button" className="btn btn-small" onClick={() => answer(false)} autoFocus>
              {request.cancelLabel ?? "Cancel"}
            </button>
            <button type="button" className="btn btn-small btn-solid" onClick={() => answer(true)}>
              {request.confirmLabel ?? "OK"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
