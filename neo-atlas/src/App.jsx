import { useCallback, useEffect, useState } from "react";
import { api } from "./lib/api.js";
import AtlasFrame from "./ui/AtlasFrame.jsx";
import CatalogStatus from "./ui/CatalogStatus.jsx";
import TabBar from "./ui/TabBar.jsx";

const TABS = [
  { id: "chart", label: "Chart" },
  { id: "list", label: "List" },
  { id: "mine", label: "Mine" },
];

function useCatalogStats() {
  const [state, setState] = useState({ status: "loading", stats: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .stats({ signal: controller.signal })
      .then((stats) => setState({ status: "ready", stats, error: null }))
      .catch((err) => {
        if (!controller.signal.aborted) setState({ status: "error", stats: null, error: err.message });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading", stats: null, error: null });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}

export default function App() {
  const [tab, setTab] = useState("chart");
  const catalog = useCatalogStats();

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="topbar">
        <h1 className="wordmark">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          NEO Atlas
        </h1>
        <p className="tagline">Near-Earth asteroids, charted like stars</p>
      </header>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <main id="main" className="stage">
        <section
          id="panel-chart"
          role="tabpanel"
          aria-labelledby="tab-chart"
          className="panel panel-chart"
          hidden={tab !== "chart"}
        >
          <div className="chart-area">
            <AtlasFrame />
          </div>
          <CatalogStatus {...catalog} onRetry={catalog.retry} />
        </section>

        <section id="panel-list" role="tabpanel" aria-labelledby="tab-list" className="panel" hidden={tab !== "list"}>
          <div className="empty-note">
            <h2>List</h2>
            <p>Pick a year or a date to list the asteroids that passed Earth then.</p>
          </div>
        </section>

        <section id="panel-mine" role="tabpanel" aria-labelledby="tab-mine" className="panel" hidden={tab !== "mine"}>
          <div className="empty-note">
            <h2>My constellations</h2>
            <p>Constellations you make are saved on this device. You haven&rsquo;t made one yet.</p>
          </div>
        </section>
      </main>

      <footer className="credit">
        Asteroid data:{" "}
        <a href="https://aegisneo-api.vercel.app/docs" target="_blank" rel="noreferrer">
          AegisNEO API
        </a>{" "}
        · NASA NeoWs close-approach records via Kaggle, 1910–2024
      </footer>
    </div>
  );
}
