import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeatured } from "./hooks/useFeatured.js";
import { useSaved } from "./hooks/useSaved.js";
import { useSky } from "./hooks/useSky.js";
import { useToast } from "./hooks/useToast.js";
import { api } from "./lib/api.js";
import { placeStar } from "./lib/chart.js";
import {
  exportJson,
  isComplete,
  makeConstellation,
  MAX_POINTS,
  parseImport,
  sharedFromQuery,
  shareQuery,
  starCount,
  uniqueIds,
} from "./lib/constellations.js";
import { formatMonthDay } from "./lib/format.js";
import { highlightTest } from "./lib/highlights.js";
import { completeSky, skyFromQuery, skyTitle, skyToQuery } from "./lib/sky.js";
import ChartTip from "./ui/ChartTip.jsx";
import ConstellationsView from "./ui/ConstellationsView.jsx";
import DetailSheet from "./ui/DetailSheet.jsx";
import DrawBar from "./ui/DrawBar.jsx";
import Legend from "./ui/Legend.jsx";
import ListView from "./ui/ListView.jsx";
import SkyControls from "./ui/SkyControls.jsx";
import SkySummary from "./ui/SkySummary.jsx";
import StarChart from "./ui/StarChart.jsx";
import TabBar from "./ui/TabBar.jsx";
import Toast from "./ui/Toast.jsx";
import ViewingBar from "./ui/ViewingBar.jsx";

const TABS = [
  { id: "chart", label: "Chart" },
  { id: "list", label: "List" },
  { id: "mine", label: "Constellations" },
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

function initialState() {
  const { sky, selected } = skyFromQuery(window.location.search);
  const shared = sharedFromQuery(window.location.search);
  return {
    sky: completeSky(sky),
    selected: shared ? null : selected,
    viewing: shared ? { pending: shared, source: "shared" } : null,
  };
}

function draftName(sky) {
  return sky.mode === "date"
    ? `My ${formatMonthDay(sky.date)} constellation`
    : `My ${sky.year} constellation`;
}

function downloadJson(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [initial] = useState(initialState);
  const [tab, setTab] = useState("chart");
  const [mineOpened, setMineOpened] = useState(false);
  const [sky, setSkyState] = useState(initial.sky);
  const [selected, setSelected] = useState(initial.selected);
  // A constellation on the chart: { constellation, source } once loaded, or { pending } while a shared link loads.
  const [viewing, setViewing] = useState(initial.viewing);
  // The constellation being drawn: the tap order of star IDs, or null when not drawing.
  const [draft, setDraft] = useState(null);
  const [drawSession, setDrawSession] = useState(0);
  const [highlight, setHighlight] = useState(null);

  const result = useSky(sky);
  const catalogTotal = useCatalogTotal();
  const { saved, persisted, add, remove, restore, importMany } = useSaved();
  const featured = useFeatured(mineOpened);
  const { toast, show: showToast, dismiss: dismissToast } = useToast();

  const constellation = viewing?.constellation ?? null;
  const drawing = draft !== null;
  const mode = constellation ? constellation.mode : sky.mode;
  const shown = constellation ? constellation.asteroids : result.asteroids;
  const stars = useMemo(() => shown.map((a) => placeStar(a, mode)), [shown, mode]);
  const selectedAsteroid = shown.find((a) => a.neo_reference_id === selected) ?? null;
  const title = constellation ? constellation.name : skyTitle(sky);
  const isSaved = constellation ? saved.some((s) => s.id === constellation.id) : false;

  // The address bar always opens the same view: a constellation's share link, or the sky and selected star.
  useEffect(() => {
    if (viewing?.pending) return;
    const query = constellation ? shareQuery(constellation) : skyToQuery(sky, selected);
    window.history.replaceState(null, "", `${window.location.pathname}${query}`);
  }, [constellation, viewing, sky, selected]);

  // A shared link holds only asteroid IDs, so fetch each one from the API.
  const pending = viewing?.pending ?? null;
  useEffect(() => {
    if (!pending) return undefined;
    const controller = new AbortController();
    Promise.allSettled(uniqueIds(pending.path).map((id) => api.get(id, { signal: controller.signal }))).then(
      (results) => {
        if (controller.signal.aborted) return;
        const asteroids = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
        const c = makeConstellation({ ...pending, asteroids });
        if (isComplete(c)) {
          setViewing({ constellation: c, source: "shared" });
        } else {
          setViewing(null);
          showToast("That shared constellation couldn't be loaded from the AegisNEO API.");
        }
      },
    );
    return () => controller.abort();
  }, [pending, showToast]);

  const openTab = useCallback((id) => {
    setTab(id);
    if (id === "mine") setMineOpened(true);
  }, []);

  const setSky = useCallback((next) => {
    setSkyState(next);
    setSelected(null);
  }, []);

  // ---------- Constellations ----------

  const share = useCallback(
    async (c) => {
      const url = `${window.location.origin}${window.location.pathname}${shareQuery(c)}`;
      const touch = window.matchMedia?.("(pointer: coarse)").matches;
      if (touch && navigator.share) {
        try {
          await navigator.share({ title: `${c.name} · NEO Atlas`, url });
          return;
        } catch (err) {
          if (err?.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        showToast(`Link to “${c.name}” copied. Paste it anywhere to share.`);
      } catch {
        showToast("Couldn't copy the link. View the constellation and copy the address bar instead.");
      }
    },
    [showToast],
  );

  const view = useCallback((c, source) => {
    setDraft(null);
    setSelected(null);
    setHighlight(null);
    setViewing({ constellation: c, source });
    setTab("chart");
  }, []);

  const exitViewing = useCallback(() => {
    setViewing(null);
    setSelected(null);
  }, []);

  const startDrawing = useCallback((firstId = null) => {
    setViewing(null);
    setSelected(null);
    setDraft(firstId ? [firstId] : []);
    setDrawSession((n) => n + 1);
    setTab("chart");
  }, []);

  const onStarTap = (id) => {
    if (!drawing) return setSelected(id);
    if (!id || draft[draft.length - 1] === id) return;
    if (draft.length >= MAX_POINTS) {
      showToast(`A constellation can have up to ${MAX_POINTS} points. Tap Done to save it.`);
      return;
    }
    setDraft([...draft, id]);
  };

  const saveDraft = (name) => {
    const c = makeConstellation({ name, mode: sky.mode, path: draft, asteroids: result.asteroids });
    add(c);
    setDraft(null);
    setViewing({ constellation: c, source: "saved" });
    showToast(`Saved “${c.name}” to Constellations.`, { label: "Share", run: () => share(c) });
  };

  const saveViewed = () => {
    add(constellation);
    showToast(`Saved “${constellation.name}” to Constellations.`);
  };

  const deleteSaved = (c) => {
    const index = saved.findIndex((s) => s.id === c.id);
    remove(c.id);
    showToast(`Deleted “${c.name}”.`, { label: "Undo", run: () => restore(c, index) });
  };

  const exportSaved = () => {
    downloadJson(exportJson(saved), "neo-atlas-constellations.json");
    showToast(`Exported ${saved.length} constellation${saved.length === 1 ? "" : "s"}.`);
  };

  const importFile = async (file) => {
    try {
      const added = importMany(parseImport(await file.text()));
      showToast(
        added === 0
          ? "Those constellations are already saved here."
          : `Imported ${added} constellation${added === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      showToast(err.message);
    }
  };

  // ---------- Shared pieces of the Chart and List tabs ----------

  const shownResult = constellation
    ? { status: "ready", asteroids: shown, matched: shown.length, error: null, retry: null }
    : viewing?.pending
      ? { status: "loading", asteroids: [], matched: 0, error: null, retry: null }
      : result;

  const toolbar = viewing ? (
    <ViewingBar
      name={constellation?.name}
      loading={!constellation}
      isSaved={isSaved}
      onSave={saveViewed}
      onShare={() => share(constellation)}
      onExit={exitViewing}
    />
  ) : (
    <SkyControls sky={sky} onChange={setSky} disabled={drawing} />
  );

  const description = `Star chart of ${shown.length} asteroids${
    constellation ? ` in the constellation ${constellation.name}` : ` that passed Earth in ${title}`
  }. ${drawing ? "Use the arrow keys to move between stars and Enter to add one." : "Use the arrow keys to step through them."}`;

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

      <TabBar tabs={TABS} active={tab} onChange={openTab} />

      <main id="main" className="stage">
        <section
          id="panel-chart"
          role="tabpanel"
          aria-labelledby="tab-chart"
          className="panel panel-chart"
          hidden={tab !== "chart"}
        >
          <div className="chart-toolbar">{toolbar}</div>
          {!drawing && !viewing && <ChartTip />}
          <div className="chart-area">
            <StarChart
              stars={stars}
              mode={mode}
              viewKey={constellation ? `c:${constellation.id}` : sky.mode}
              selectedId={selected}
              onSelect={onStarTap}
              description={description}
              path={drawing ? draft : (constellation?.path ?? undefined)}
              highlight={highlightTest(highlight)}
              drawing={drawing}
            >
              <Legend mode={mode} />
              {!drawing && !viewing && (
                <button
                  type="button"
                  className="btn btn-solid btn-make chart-make"
                  onClick={() => startDrawing()}
                  disabled={result.status !== "ready"}
                >
                  <span aria-hidden="true">✦</span> Make a constellation
                </button>
              )}
            </StarChart>
          </div>
          {drawing ? (
            <DrawBar
              key={drawSession}
              count={uniqueIds(draft).length}
              points={draft.length}
              defaultName={draftName(sky)}
              onUndo={() => setDraft(draft.slice(0, -1))}
              onCancel={() => setDraft(null)}
              onSave={saveDraft}
            />
          ) : (
            <SkySummary
              title={constellation ? `${constellation.name} · ${starCount(constellation)} stars` : title}
              result={shownResult}
              catalogTotal={constellation ? null : catalogTotal}
              highlight={highlight}
              onHighlight={setHighlight}
            />
          )}
        </section>

        <section
          id="panel-list"
          role="tabpanel"
          aria-labelledby="tab-list"
          className="panel panel-list"
          hidden={tab !== "list"}
        >
          <ListView
            toolbar={toolbar}
            title={title}
            result={shownResult}
            highlight={highlight}
            onHighlight={setHighlight}
            selectedId={selected}
            onSelect={setSelected}
          />
        </section>

        <section
          id="panel-mine"
          role="tabpanel"
          aria-labelledby="tab-mine"
          className="panel panel-mine"
          hidden={tab !== "mine"}
        >
          <ConstellationsView
            saved={saved}
            persisted={persisted}
            featured={featured}
            onMake={() => startDrawing()}
            onView={view}
            onShare={share}
            onDelete={deleteSaved}
            onExport={exportSaved}
            onImport={importFile}
          />
        </section>

        {tab !== "mine" && !drawing && (
          <DetailSheet asteroid={selectedAsteroid} onClose={() => setSelected(null)}>
            {tab === "list" && (
              <button type="button" className="btn btn-small btn-solid" onClick={() => setTab("chart")}>
                Show on chart
              </button>
            )}
            {!viewing && result.status === "ready" && (
              <button type="button" className="btn btn-small" onClick={() => startDrawing(selected)}>
                <span aria-hidden="true">✦</span> Start a constellation here
              </button>
            )}
          </DetailSheet>
        )}
      </main>

      <footer className="credit">
        Asteroid data:{" "}
        <a href="https://aegisneo-api.vercel.app/docs" target="_blank" rel="noreferrer">
          AegisNEO API
        </a>{" "}
        · NASA NeoWs close-approach records via Kaggle, 1910–2024
      </footer>

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
