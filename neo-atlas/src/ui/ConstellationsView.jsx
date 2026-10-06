import { useRef } from "react";
import { starCount } from "../lib/constellations.js";
import ConstellationPreview from "./ConstellationPreview.jsx";
import Menu from "./Menu.jsx";

function yearsOf(c) {
  const years = c.asteroids.map((a) => Number(a.close_approach_date.slice(0, 4)));
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? String(first) : `${first}–${last}`;
}

function Card({ constellation, blurb, children }) {
  return (
    <li className="card">
      <ConstellationPreview constellation={constellation} />
      <div className="card-body">
        <h4 className="card-name">{constellation.name}</h4>
        <p className="card-meta">
          {starCount(constellation)} stars · {yearsOf(constellation)}
        </p>
        {blurb && <p className="card-blurb">{blurb}</p>}
        <div className="card-actions">{children}</div>
      </div>
    </li>
  );
}

/** The Constellations tab: make one, your saved ones, ready-made ones, and files. */
export default function ConstellationsView({
  saved,
  persisted,
  featured,
  onMake,
  onView,
  onShare,
  onPostcard,
  onDelete,
  onExport,
  onImport,
  drawing = false,
  onBackToDrawing,
  catalogTotal = null,
}) {
  const fileRef = useRef(null);

  return (
    <div className="constellations">
      <header className="mine-intro">
        <h2>Constellations</h2>
        <p>
          Join asteroids into a shape of your own — your birthday sky, a year that matters to you — then send
          it as a postcard or a link. Nothing is uploaded: your constellations stay on this device.
        </p>
        {drawing ? (
          <div className="drawing-note" role="status">
            <p>You&rsquo;re in the middle of drawing a constellation.</p>
            <button type="button" className="btn btn-solid btn-small" onClick={onBackToDrawing}>
              Back to drawing
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-solid btn-make" onClick={onMake}>
            <span aria-hidden="true">✎</span> Draw my own constellation
          </button>
        )}
      </header>

      <section aria-labelledby="saved-heading" className="shelf">
        <h3 id="saved-heading">Saved on this device</h3>
        {saved.length === 0 ? (
          <ol className="how-to">
            <li>
              <span>
                <strong>Pick a sky.</strong> On the Chart, tap the sky button to choose a year or your birthday.
              </span>
            </li>
            <li>
              <span>
                <strong>Join the stars.</strong> Tap <em>Draw my own constellation</em>, then tap stars one
                after another.
              </span>
            </li>
            <li>
              <span>
                <strong>Name it and save.</strong> It appears here, ready to view again or send as a postcard.
              </span>
            </li>
          </ol>
        ) : (
          <ul className="cards">
            {saved.map((c) => (
              <Card key={c.id} constellation={c}>
                <button type="button" className="btn btn-small btn-solid" onClick={() => onView(c, "saved")}>
                  View
                </button>
                <button type="button" className="btn btn-small" onClick={() => onPostcard(c, "saved")}>
                  Postcard
                </button>
                <Menu
                  label={`More for ${c.name}`}
                  items={[
                    { key: "share", icon: "↗", label: "Share a link", onSelect: () => onShare(c) },
                    { key: "delete", icon: "🗑", label: "Delete", onSelect: () => onDelete(c) },
                  ]}
                />
              </Card>
            ))}
          </ul>
        )}
        {!persisted && (
          <p className="warn" role="alert">
            This browser isn&rsquo;t keeping saves (private browsing?). Export a file to keep your
            constellations.
          </p>
        )}
        <div className="file-actions">
          <button type="button" className="btn btn-small" onClick={onExport} disabled={saved.length === 0}>
            Export to a file
          </button>
          <button type="button" className="btn btn-small" onClick={() => fileRef.current?.click()}>
            Import a file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onImport(file);
            }}
          />
        </div>
      </section>

      <section aria-labelledby="featured-heading" className="shelf">
        <h3 id="featured-heading">From the whole catalog</h3>
        <p className="shelf-note">
          Each one is a single sorted query to the AegisNEO API across{" "}
          {catalogTotal ? `all ${catalogTotal.toLocaleString("en-US")} asteroids` : "every asteroid"} in the
          catalog.
        </p>
        {featured.status === "loading" && (
          <p className="list-note" role="status">
            <span className="pulse" aria-hidden="true" />
            Asking the AegisNEO API…
          </p>
        )}
        {featured.status === "error" && (
          <div className="list-note" role="alert">
            <p>{featured.error}</p>
            <button type="button" className="btn btn-small" onClick={featured.retry}>
              Try again
            </button>
          </div>
        )}
        {featured.status === "ready" && featured.failed > 0 && (
          <div className="list-note" role="alert">
            <p>
              {featured.failed} of {featured.failed + featured.items.length} couldn&rsquo;t be loaded.
            </p>
            <button type="button" className="btn btn-small" onClick={featured.retry}>
              Try again
            </button>
          </div>
        )}
        {featured.status === "ready" && (
          <ul className="cards">
            {featured.items.map(({ def, constellation }) => (
              <Card key={def.key} constellation={constellation} blurb={def.blurb}>
                <button
                  type="button"
                  className="btn btn-small btn-solid"
                  onClick={() => onView(constellation, "featured")}
                >
                  View
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => onPostcard(constellation, "featured")}
                >
                  Postcard
                </button>
                <Menu
                  label={`More for ${constellation.name}`}
                  items={[{ key: "share", icon: "↗", label: "Share a link", onSelect: () => onShare(constellation) }]}
                />
              </Card>
            ))}
          </ul>
        )}
      </section>

      <p className="credit-inline">
        Asteroid data:{" "}
        <a href="https://aegisneo-api.vercel.app/docs" target="_blank" rel="noreferrer">
          AegisNEO API
        </a>{" "}
        · NASA NeoWs records via Kaggle. Sizes, speeds and miss distances are real; close-approach dates
        are simulated, because the source catalog doesn&rsquo;t include them.
      </p>
    </div>
  );
}
