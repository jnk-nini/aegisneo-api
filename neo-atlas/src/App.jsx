import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFeatured } from "./hooks/useFeatured.js";
import { useSaved } from "./hooks/useSaved.js";
import { useSky } from "./hooks/useSky.js";
import { useToast } from "./hooks/useToast.js";
import { api } from "./lib/api.js";
import { placeStar } from "./lib/chart.js";
import {
  exportJson,
  loadShared,
  makeConstellation,
  MAX_POINTS,
  parseImport,
  sharedFromQuery,
  shareQuery,
  uniqueIds,
} from "./lib/constellations.js";
import { formatMonthDay } from "./lib/format.js";
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

// Drawing this many stars or more makes Cancel ask first.
const CONFIRM_CANCEL_STARS = 3;
const NO_ASTEROIDS = [];

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

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

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

export default function App() {
  const [initial] = useState(initialState);
  const [tab, setTab] = useState("chart");
  const [mineOpened, setMineOpened] = useState(false);
  const [sky, setSkyState] = useState(initial.sky);
  const [selected, setSelected] = useState(initial.selected);
  // A constellation on the chart, or null for the plain sky:
  //   { status: "loading" | "failed", pending, source }            a shared link that hasn't loaded
  //   { status: "partial", constellation, pending, missing, ... }   a shared link with stars missing
  //   { status: "ready", constellation, source }
  const [viewing, setViewing] = useState(initial.viewing);
  // The constellation being drawn: the tap order of star IDs, or null when not drawing.
  const [draft, setDraft] = useState(null);
  const [drawSession, setDrawSession] = useState(0);
  const [highlight, setHighlight] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const sheetRef = useRef(null);

  const result = useSky(sky);
  const catalogTotal = useCatalogTotal();
  const { saved, persisted, add, remove, restore, importMany } = useSaved();
  const featured = useFeatured(mineOpened);
  const { toast, show: showToast, dismiss: dismissToast } = useToast();

  const constellation = viewing?.constellation ?? null;
  const drawing = draft !== null;
  const mode = constellation ? constellation.mode : (viewing?.pending.mode ?? sky.mode);
  const shown = constellation ? constellation.asteroids : viewing ? NO_ASTEROIDS : result.asteroids;
  const stars = useMemo(() => shown.map((a) => placeStar(a, mode)), [shown, mode]);
  const selectedAsteroid = shown.find((a) => a.neo_reference_id === selected) ?? null;
  const title = constellation ? constellation.name : viewing ? viewing.pending.name : skyTitle(sky);
  const isSaved = constellation ? saved.some((s) => s.id === constellation.id) : false;

  // The address bar always opens the same view: a constellation's share link, or the sky and selected star.
  // A shared link that hasn't fully loaded is left as it is, so reloading tries the whole link again.
  useEffect(() => {
    if (viewing && viewing.status !== "ready") return;
    const query = constellation ? shareQuery(constellation) : skyToQuery(sky, selected);
    window.history.replaceState(null, "", `${window.location.pathname}${query}`);
  }, [constellation, viewing, sky, selected]);

  // A shared link holds only asteroid IDs, so fetch each one from the API.
  const loading = viewing?.status === "loading" ? viewing : null;
  useEffect(() => {
    if (!loading) return undefined;
    const controller = new AbortController();
    const { pending, source } = loading;
    loadShared(pending, (id) => api.get(id, { signal: controller.signal })).then((r) => {
      if (controller.signal.aborted) return;
      const { constellation: c, missing, total, retryable } = r;
      if (!c) setViewing({ status: "failed", pending, source, missing, total, retryable });
      else if (missing > 0) setViewing({ status: "partial", constellation: c, pending, source, missing, total, retryable });
      else setViewing({ status: "ready", constellation: c, source });
    });
    return () => controller.abort();
  }, [loading]);

  const retryShared = useCallback(
    () => setViewing((v) => ({ status: "loading", pending: v.pending, source: v.source })),
    [],
  );

  // Leaving the page mid-drawing would lose the stars joined so far.
  const hasDraft = drawing && draft.length > 0;
  useEffect(() => {
    if (!hasDraft) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDraft]);

  /** Runs `action` now, or after asking, if it would throw away a constellation being drawn. */
  const guardDraft = useCallback(
    (action) => {
      if (!draft || draft.length === 0) return action();
      const count = uniqueIds(draft).length;
      setConfirm({
        title: "Discard your constellation?",
        body: `You've joined ${plural(count, "star")}. ${count === 1 ? "It" : "They"} will be lost.`,
        confirmLabel: "Discard",
        cancelLabel: "Keep drawing",
        onConfirm: action,
        onCancel: () => setTab("chart"),
      });
    },
    [draft],
  );

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

  const view = (c, source) =>
    guardDraft(() => {
      setDraft(null);
      setSelected(null);
      setHighlight(null);
      setViewing({ status: "ready", constellation: c, source });
      setTab("chart");
    });

  const exitViewing = useCallback(() => {
    setViewing(null);
    setSelected(null);
  }, []);

  const startDrawing = (firstId = null) =>
    guardDraft(() => {
      setViewing(null);
      setSelected(null);
      setDraft(firstId ? [firstId] : []);
      setDrawSession((n) => n + 1);
      setTab("chart");
    });

  const cancelDrawing = () => {
    const count = uniqueIds(draft).length;
    if (count < CONFIRM_CANCEL_STARS) return setDraft(null);
    setConfirm({
      title: "Discard your constellation?",
      body: `You've joined ${plural(count, "star")}. They will be lost.`,
      confirmLabel: "Discard",
      cancelLabel: "Keep drawing",
      onConfirm: () => setDraft(null),
    });
  };

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
    <SkyControls sky={sky} onChange={setSky} disabled={drawing} />
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
  }. ${drawing ? "Use the arrow keys to move between stars and Enter to add one." : "Use the arrow keys to step through them."}`;

  const sheetOpen = tab !== "mine" && !drawing && selectedAsteroid !== null;

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
              coverRef={sheetRef}
              covered={sheetOpen}
            >
              <Legend mode={mode} />
              {chartStatus}
            </StarChart>
          </div>
          {drawing ? (
            <DrawBar
              key={drawSession}
              count={uniqueIds(draft).length}
              points={draft.length}
              defaultName={draftName(sky)}
              onUndo={() => setDraft(draft.slice(0, -1))}
              onCancel={cancelDrawing}
              onSave={saveDraft}
            />
          ) : (
            <SkySummary
              title={title}
              result={shownResult}
              catalogTotal={viewing ? null : catalogTotal}
              highlight={highlight}
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
            drawing={drawing}
            onBackToDrawing={() => setTab("chart")}
            catalogTotal={catalogTotal}
          />
        </section>

        {sheetOpen && (
          <DetailSheet asteroid={selectedAsteroid} onClose={() => setSelected(null)} sheetRef={sheetRef}>
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
        · NASA NeoWs records via Kaggle · close-approach dates simulated
      </footer>

      <Toast toast={toast} onDismiss={dismissToast} />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
