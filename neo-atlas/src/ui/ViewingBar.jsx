/**
 * Replaces the sky picker while a constellation is on the chart: a way back,
 * its name, and the ⋯ menu (`menu`) with Save, Share and the rest. Its main
 * action, the postcard, is the big button under the chart.
 *
 * `revealKey` writes the name in as the constellation draws itself.
 */
export default function ViewingBar({
  name,
  eyebrow = "Constellation",
  status,
  onExit,
  menu = null,
  revealKey = null,
}) {
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
        <span className="eyebrow">{eyebrow}</span>
        <strong key={revealKey ?? "name"} className={revealKey ? "name-reveal" : undefined}>
          {status === "loading" ? "Loading…" : name}
        </strong>
      </div>
      {menu}
    </div>
  );
}
