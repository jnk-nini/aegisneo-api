import { useCallback, useMemo, useRef, useState } from "react";
import { useCatalogTotal } from "./hooks/useCatalogTotal.js";
import { useDraft } from "./hooks/useDraft.js";
import { useFeatured } from "./hooks/useFeatured.js";
import { closeLayer, useHistorySync } from "./hooks/useHistorySync.js";
import { useSaved } from "./hooks/useSaved.js";
import { useSky } from "./hooks/useSky.js";
import { useToast } from "./hooks/useToast.js";
import { useViewing } from "./hooks/useViewing.js";
import { placeStar } from "./lib/chart.js";
import {
  exportJson,
  makeConstellation,
  MAX_IMPORT_BYTES,
  MAX_POINTS,
  parseImport,
  sharedFromQuery,
  shareQuery,
} from "./lib/constellations.js";
import { formatMonthDay, plural } from "./lib/format.js";
import { highlightTest } from "./lib/highlights.js";
import { completeSky, skyFromQuery, skyTitle, skyToQuery } from "./lib/sky.js";
import ChartTip from "./ui/ChartTip.jsx";
import ConfirmDialog from "./ui/ConfirmDialog.jsx";
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

const NO_ASTEROIDS = [];

function initialState() {
  const { sky, selected } = skyFromQuery(window.location.search);
  const shared = sharedFromQuery(window.location.search);
  return {
    sky: completeSky(sky),
    selected: shared ? null : selected,
    viewing: shared ? { status: "loading", pending: shared, source: "shared" } : null,
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

/** What to say about a shared link whose stars didn't all load. */
function sharedProblem(viewing) {
  const { missing, total, retryable } = viewing;
  if (viewing.status === "failed") {
    return retryable
      ? "This shared constellation couldn't be loaded from the AegisNEO API."
      : "The stars in this shared link aren't in the AegisNEO catalog.";
  }
  return retryable
    ? `${missing} of ${plural(total, "star")} couldn't be loaded, so part of the shape is missing.`
    : `${missing} of ${plural(total, "star")} in this link ${missing === 1 ? "isn't" : "aren't"} in the AegisNEO catalog.`;
}

/** What a history entry keeps of the view, so Back can return to it. */
function viewingSnapshot(viewing) {
  if (!viewing) return null;
  const { status, constellation, pending, source } = viewing;
  // Anything not fully loaded is fetched again (from the cache, usually) on the way back.
  return status === "ready" ? { status, constellation, source } : { status: "loading", pending, source };
}

export default function App() {
  const [initial] = useState(initialState);
  const [tab, setTab] = useState("chart");
  const [mineOpened, setMineOpened] = useState(false);
  const [sky, setSkyState] = useState(initial.sky);
  const [selected, setSelected] = useState(initial.selected);
  const [highlight, setHighlight] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const sheetRef = useRef(null);
  // Set once a discard is confirmed and Back is about to close the drawing, so it isn't asked twice.
  const discarding = useRef(false);

  const { viewing, setViewing, retry: retryShared } = useViewing(initial.viewing);
  const draft = useDraft(setConfirm);
  const result = useSky(sky);
  const catalogTotal = useCatalogTotal();
  const { saved, persisted, add, remove, restore, importMany } = useSaved();
  const featured = useFeatured(mineOpened);
  const { toast, show: showToast, dismiss: dismissToast, pause, resume } = useToast();

  const constellation = viewing?.constellation ?? null;
  const mode = constellation ? constellation.mode : (viewing?.pending.mode ?? sky.mode);
  const shown = constellation ? constellation.asteroids : viewing ? NO_ASTEROIDS : result.asteroids;
  const stars = useMemo(() => shown.map((a) => placeStar(a, mode)), [shown, mode]);
  const title = constellation ? constellation.name : viewing ? viewing.pending.name : skyTitle(sky);
  const isSaved = constellation ? saved.some((s) => s.id === constellation.id) : false;

  // A star picked in the address bar that isn't in this sky is dropped once the sky has loaded.
  const selectedAsteroid = shown.find((a) => a.neo_reference_id === selected) ?? null;
  const settled = viewing ? viewing.status !== "loading" : result.status !== "loading";
  const selectedId = selected && (selectedAsteroid || !settled) ? selected : null;

  // A highlight with nothing to pick out in this sky is set aside (not lost) instead of dimming every star.
  const shownHighlight = highlight && shown.some(highlightTest(highlight)) ? highlight : null;

  // ---------- Address bar and Back button ----------

  const layers = [
    viewing && "viewing",
    selectedId && !draft.drawing && "sheet",
    draft.drawing && "drawing",
  ].filter(Boolean);
  // A shared link that hasn't fully loaded is left in the address bar, so reloading tries the whole link again.
  const url = viewing ? (viewing.status === "ready" ? shareQuery(constellation) : null) : skyToQuery(sky, selectedId);
  const snapshot = useMemo(
    () => ({ selected: selectedId, viewing: viewingSnapshot(viewing) }),
    [selectedId, viewing],
  );

  const onBack = (entry) => {
    if (draft.drawing && !entry.layers.includes("drawing")) {
      if (draft.hasStars && !discarding.current) {
        draft.askDiscard(() => {
          discarding.current = true;
          window.history.back();
        });
        return false;
      }
      discarding.current = false;
      draft.stop();
    }
    setViewing(entry.viewing ?? null);
    if (!entry.viewing) setSkyState(completeSky(skyFromQuery(window.location.search).sky));
    setSelected(entry.layers.includes("sheet") ? (entry.selected ?? null) : null);
    return true;
  };

  useHistorySync({ url, layers, snapshot, onBack });

  const without = (...names) => layers.filter((l) => !names.includes(l));
  const closeSheet = () => closeLayer(layers, without("sheet"), () => setSelected(null));
  const exitViewing = () =>
    closeLayer(layers, without("viewing", "sheet"), () => {
      setViewing(null);
      setSelected(null);
    });
  const discardDraft = () => {
    discarding.current = true;
    closeLayer(layers, without("drawing"), () => {
      discarding.current = false;
      draft.stop();
    });
  };

  // ---------- Navigation ----------

  const openTab = useCallback((id) => {
    setTab(id);
    if (id === "mine") setMineOpened(true);
  }, []);

  const setSky = useCallback((next) => {
    setSkyState(next);
    setSelected(null);
  }, []);

  const backToChart = () => setTab("chart");

  // ---------- Constellations ----------

  const share = useCallback(
    async (c) => {
      const link = `${window.location.origin}${window.location.pathname}${shareQuery(c)}`;
      const touch = window.matchMedia?.("(pointer: coarse)").matches;
      if (touch && navigator.share) {
        try {
          await navigator.share({ title: `${c.name} · NEO Atlas`, url: link });
          return;
        } catch (err) {
          if (err?.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(link);
        showToast(`Link to “${c.name}” copied. Paste it anywhere to share.`);
      } catch {
        showToast("Couldn't copy the link. View the constellation and copy the address bar instead.");
      }
    },
    [showToast],
  );

  const view = (c, source) =>
    draft.guard(() => {
      draft.stop();
      setSelected(null);
      setHighlight(null);
      setViewing({ status: "ready", constellation: c, source });
      setTab("chart");
    }, backToChart);

  const startDrawing = (firstId = null) =>
    draft.guard(() => {
      setViewing(null);
      setSelected(null);
      draft.start(firstId);
      setTab("chart");
    }, backToChart);

  const onStarTap = (id) => {
    if (!draft.drawing) return id ? setSelected(id) : closeSheet();
    if (!draft.tap(id)) showToast(`A constellation can have up to ${MAX_POINTS} points. Tap Done to save it.`);
  };

  const onListSelect = (id) => {
    if (draft.drawing) return showToast("You're drawing a constellation. Tap stars on the Chart, then Done.");
    setSelected(id);
  };

  const saveDraft = (name) => {
    const c = makeConstellation({ name, mode: sky.mode, path: draft.draft, asteroids: result.asteroids });
    add(c);
    draft.stop();
    setViewing({ status: "ready", constellation: c, source: "saved" });
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
    showToast(`Exported ${plural(saved.length, "constellation")}.`);
  };

  const importFile = async (file) => {
    if (file.size > MAX_IMPORT_BYTES) return showToast("That file is too big to be a NEO Atlas export.");
    try {
      const added = importMany(parseImport(await file.text()));
      showToast(
        added === 0 ? "Those constellations are already saved here." : `Imported ${plural(added, "constellation")}.`,
      );
    } catch (err) {
      showToast(err.message);
    }
  };

  // ---------- Shared pieces of the Chart and List tabs ----------

  let shownResult = result;
  if (viewing?.status === "loading") {
    shownResult = { status: "loading", asteroids: [], matched: 0, error: null, retry: null };
  } else if (viewing?.status === "failed") {
    const retry = viewing.retryable ? retryShared : null;
    shownResult = { status: "error", asteroids: [], matched: 0, error: sharedProblem(viewing), retry };
  } else if (viewing) {
    shownResult = { status: "ready", asteroids: shown, matched: shown.length, error: null, retry: null };
  }

  const notice =
    viewing?.status === "partial"
      ? {
          text: sharedProblem(viewing),
          actionLabel: "Try again",
          onAction: viewing.retryable ? retryShared : null,
        }
      : null;

  const toolbar = viewing ? (
    <ViewingBar
      name={title}
      status={viewing.status}
      // Stars the catalog doesn't have will never load, so what did load can be saved.
      ready={viewing.status === "ready" || (viewing.status === "partial" && !viewing.retryable)}
      isSaved={isSaved}
      onSave={saveViewed}
      onShare={() => share(constellation)}
      onExit={exitViewing}
    />
  ) : (
    <SkyControls sky={sky} onChange={setSky} disabled={draft.drawing} />
  );

  // When the chart has no stars yet, the chart itself says why: still loading, or what went wrong.
  const chartStatus =
    shown.length === 0 && shownResult.status !== "ready" ? (
      <div className="chart-status" role={shownResult.status === "error" ? "alert" : "status"}>
        {shownResult.status === "loading" ? (
          <p>
            <span className="pulse" aria-hidden="true" />
            Charting {title}…
          </p>
        ) : (
          <>
            <p>{shownResult.error}</p>
            <div className="chart-status-actions">
              {shownResult.retry && (
                <button type="button" className="btn btn-small btn-solid" onClick={shownResult.retry}>
                  Try again
                </button>
              )}
              {viewing && (
                <button type="button" className="btn btn-small" onClick={exitViewing}>
                  Back to the sky
                </button>
              )}
            </div>
          </>
        )}
      </div>
    ) : null;

  const description = `Star chart of ${shown.length} asteroids${
    constellation ? ` in the constellation ${constellation.name}` : ` that passed Earth in ${title}`
  }. ${draft.drawing ? "Use the arrow keys to move between stars and Enter to add one." : "Use the arrow keys to step through them."}`;

  const sheetOpen = tab !== "mine" && !draft.drawing && selectedAsteroid !== null;

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
          {!draft.drawing && !viewing && <ChartTip />}
          <div className="chart-area">
            <StarChart
              stars={stars}
              mode={mode}
              viewKey={constellation ? `c:${constellation.id}` : sky.mode}
              selectedId={selectedId}
              onSelect={onStarTap}
              description={description}
              path={draft.drawing ? draft.draft : (constellation?.path ?? undefined)}
              highlight={highlightTest(shownHighlight)}
              drawing={draft.drawing}
              coverRef={sheetRef}
              covered={sheetOpen}
            >
              <Legend mode={mode} />
              {chartStatus}
            </StarChart>
          </div>
          {draft.drawing ? (
            <DrawBar
              key={draft.session}
              count={draft.count}
              points={draft.draft.length}
              defaultName={draftName(sky)}
              onUndo={draft.undo}
              onCancel={() => draft.cancel(discardDraft)}
              onSave={saveDraft}
            />
          ) : (
            <SkySummary
              title={title}
              result={shownResult}
              catalogTotal={viewing ? null : catalogTotal}
              highlight={shownHighlight}
              onHighlight={setHighlight}
              notice={notice}
              onMake={viewing ? null : () => startDrawing()}
              canMake={result.status === "ready"}
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
            highlight={shownHighlight}
            onHighlight={setHighlight}
            selectedId={selectedId}
            onSelect={onListSelect}
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
            drawing={draft.drawing}
            onBackToDrawing={backToChart}
            catalogTotal={catalogTotal}
          />
        </section>

        {sheetOpen && (
          <DetailSheet asteroid={selectedAsteroid} onClose={closeSheet} sheetRef={sheetRef}>
            {tab === "list" && (
              <button type="button" className="btn btn-small btn-solid" onClick={backToChart}>
                Show on chart
              </button>
            )}
            {!viewing && result.status === "ready" && (
              <button type="button" className="btn btn-small" onClick={() => startDrawing(selectedId)}>
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
        · NASA NeoWs records via Kaggle · close-approach dates simulated
      </footer>

      <Toast toast={toast} onDismiss={dismissToast} onPause={pause} onResume={resume} />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
