/** A short message above the tab bar, read out by screen readers, with an optional action. */
export default function Toast({ toast, onDismiss }) {
  return (
    <div className="toast-region" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.at}>
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toast.action.run();
                onDismiss();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
