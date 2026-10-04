/** Replaces the year/date picker while a constellation is on the chart. */
export default function ViewingBar({ name, loading, isSaved, onSave, onShare, onExit }) {
  return (
    <div className="viewing-bar">
      <button
        type="button"
        className="icon-btn"
        onClick={onExit}
        aria-label="Close constellation and go back to the sky"
      >
        ‹
      </button>
      <div className="viewing-title">
        <span className="eyebrow">Constellation</span>
        <strong>{loading ? "Loading…" : name}</strong>
      </div>
      <div className="viewing-actions">
        {!isSaved && (
          <button type="button" className="btn btn-small" onClick={onSave} disabled={loading}>
            Save
          </button>
        )}
        <button type="button" className="btn btn-small btn-solid" onClick={onShare} disabled={loading}>
          Share
        </button>
      </div>
    </div>
  );
}
