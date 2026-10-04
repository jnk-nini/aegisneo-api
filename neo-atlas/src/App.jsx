import { useCallback, useEffect, useMemo, useState } from "react";
import { useSky } from "./hooks/useSky.js";
import { api } from "./lib/api.js";
import { placeStar } from "./lib/chart.js";
import { completeSky, skyFromQuery, skyTitle, skyToQuery } from "./lib/sky.js";
import DetailSheet from "./ui/DetailSheet.jsx";
import Legend from "./ui/Legend.jsx";
import SkyControls from "./ui/SkyControls.jsx";
import SkySummary from "./ui/SkySummary.jsx";
import StarChart from "./ui/StarChart.jsx";
import TabBar from "./ui/TabBar.jsx";

const TABS = [
  { id: "chart", label: "Chart" },
  { id: "list", label: "List" },
  { id: "mine", label: "Mine" },
];

/** The catalog total, for "312 asteroids of 33,511". Optional: the chart works without it. */
function useCatalogTotal() {
  const [total, setTotal] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .stats({ signal: controller.signal })
      .then((stats) => setTotal(stats.total))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return total;
}

/** The charted sky and selected asteroid, kept in the URL so a refresh or shared link opens the same view. */
function useSkyState() {
  const [state, setState] = useState(() => {
    const { sky, selected } = skyFromQuery(window.location.search);
    return { sky: completeSky(sky), selected };
  });

  useEffect(() => {
    const url = `${window.location.pathname}${skyToQuery(state.sky, state.selected)}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, [state]);

  const setSky = useCallback((sky) => setState({ sky, selected: null }), []);
  const setSelected = useCallback((selected) => setState((prev) => ({ ...prev, selected })), []);
  return { ...state, setSky, setSelected };
}

export default function App() {
  const [tab, setTab] = useState("chart");
  const { sky, selected, setSky, setSelected } = useSkyState();
  const result = useSky(sky);
  const catalogTotal = useCatalogTotal();

  const stars = useMemo(() => result.asteroids.map((a) => placeStar(a, sky.mode)), [result.asteroids, sky.mode]);
  const selectedAsteroid = result.asteroids.find((a) => a.neo_reference_id === selected) ?? null;
  const description = `Star chart of ${result.asteroids.length} asteroids that passed Earth in ${skyTitle(sky)}. Use the arrow keys to step through them.`;

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
          <div className="chart-toolbar">
            <SkyControls sky={sky} onChange={setSky} />
            <Legend mode={sky.mode} />
          </div>
          <div className="chart-area">
            <StarChart
              stars={stars}
              mode={sky.mode}
              selectedId={selected}
              onSelect={setSelected}
              description={description}
            />
          </div>
          <SkySummary sky={sky} result={result} catalogTotal={catalogTotal} />
          <DetailSheet asteroid={selectedAsteroid} onClose={() => setSelected(null)} />
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
