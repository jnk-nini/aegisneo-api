/** One-line summary of the AegisNEO catalog, with loading and error states. */
export default function CatalogStatus({ status, stats, error, onRetry }) {
  if (status === "loading") {
    return (
      <p className="catalog-status" role="status">
        <span className="pulse" aria-hidden="true" /> Consulting the AegisNEO catalog…
      </p>
    );
  }

  if (status === "error") {
    return (
      <div className="catalog-status error" role="alert">
        <span>{error}</span>
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  const first = stats.close_approach_date.min.slice(0, 4);
  const last = stats.close_approach_date.max.slice(0, 4);
  return (
    <p className="catalog-status" role="status">
      <strong className="num">{stats.total.toLocaleString()}</strong> close approaches,{" "}
      <span className="num nowrap">
        {first}–{last}
      </span>{" "}
      · <strong className="num hazard-text">{stats.potentially_hazardous.toLocaleString()}</strong>{" "}
      <span className="nowrap">potentially hazardous</span>
    </p>
  );
}
