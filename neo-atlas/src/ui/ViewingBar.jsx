/**
 * Replaces the year/date picker while a constellation is on the chart. Save and
 * Postcard stay off (`ready` false) while stars of a shared link are still
 * missing but could load on a retry, so it is never saved half-loaded.
 * The postcard also has the plain link to copy. Without `onPostcard` there is
 * no Postcard button (the card under the chart has one).
 */
export default function ViewingBar({ name, status, ready, isSaved, onSave, onPostcard, onExit }) {
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
        <strong>{status === "loading" ? "Loading…" : name}</strong>
      </div>
      <div className="viewing-actions">
        {!isSaved && (
          <button type="button" className="btn btn-small" onClick={onSave} disabled={!ready}>
            Save
          </button>
        )}
        {onPostcard && (
          <button type="button" className="btn btn-small btn-solid" onClick={onPostcard} disabled={!ready}>
            Postcard
          </button>
        )}
      </div>
    </div>
  );
}
