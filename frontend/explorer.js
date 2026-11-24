// Session, API_URL, apiFetch and escapeHtml come from shared.js. The sign-in page
// (auth.html) and the hub (hub.html) come before this page: a visitor is either
// signed in or a guest, and what the API returns depends on their role.
function authHeaders() {
    const token = Session.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// A 401 for a signed-in visitor means the token ran out: back to the sign-in page.
function sessionEnded(response) {
    if (response.status === 401 && Session.username && !Session.token) {
        location.replace("auth?expired=1");
        return true;
    }
    return false;
}

const LUNAR_DISTANCE_KM = 384400;
const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const listEl = document.getElementById("asteroidList");
const statTotalEl = document.getElementById("statTotal");
const statShownEl = document.getElementById("statShown");
const statHazardEl = document.getElementById("statHazard");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const surpriseBtn = document.getElementById("surpriseBtn");
const factTextEl = document.getElementById("factText");
const orbitHighlightsEl = document.getElementById("orbitHighlights");
const watchlistToggle = document.getElementById("watchlistToggle");
const gameStreakEl = document.getElementById("gameStreak");
const gameBestEl = document.getElementById("gameBest");
const gamePromptEl = document.getElementById("gamePrompt");
const gameArenaEl = document.getElementById("gameArena");
const gameFeedbackEl = document.getElementById("gameFeedback");
const loadMoreWrap = document.getElementById("loadMoreWrap");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const loadMoreCount = document.getElementById("loadMoreCount");
const listStatusEl = document.getElementById("listStatus");

// APP STATE — all filtering/sorting happens here, client-side, on already-fetched data
// The API filters, sorts and pages the catalog; the page only keeps what has been loaded so far.
// (Only "My List" is filtered and sorted here, because it is a set of ids, not a query.)
const PAGE_SIZE = 100;
const state = {
    raw: [],            // the asteroids loaded so far for the current search, filters and sort
    lastList: [],       // what is on screen
    matched: 0,         // how many asteroids match, in the whole catalog this visitor may see
    hazardMatched: null,
    query: "",
    hazardFilter: "all",
    sizeFilter: "all",
    sort: "default",
    watchlistOnly: false,
    dirty: false,       // filters changed while "My List" was open: reload when it closes
    generation: 0,      // bumped on every new search, so a slow "Load more" cannot add to a newer list
    loadingMore: false,
};

const SORTS = {
    name: { sort: "name", order: "asc" },
    "diameter-desc": { sort: "diameter", order: "desc" },
    "diameter-asc": { sort: "diameter", order: "asc" },
    "velocity-desc": { sort: "velocity", order: "desc" },
    "distance-asc": { sort: "miss_distance", order: "asc" },
    "date-desc": { sort: "date", order: "desc" },
};
// Size tiers as diameter ranges in km: small is under 0.14, medium under 1, large from 1.
const SIZE_RANGES = {
    small: { max_diameter: 0.13999999 },
    medium: { min_diameter: 0.14, max_diameter: 0.99999999 },
    large: { min_diameter: 1 },
};

function listQuery({ offset = 0, limit = PAGE_SIZE, hazard = state.hazardFilter } = {}) {
    const params = new URLSearchParams({ limit, offset });
    if (state.query) params.set("search", state.query);
    if (hazard === "safe") params.set("hazardous", "false");
    if (hazard === "hazard") params.set("hazardous", "true");
    Object.entries(SIZE_RANGES[state.sizeFilter] || {}).forEach(([key, value]) => params.set(key, value));
    const sort = SORTS[state.sort];
    if (sort) { params.set("sort", sort.sort); params.set("order", sort.order); }
    return params.toString();
}

// WATCHLIST ("My List"): kept in the account for a signed-in visitor, so it follows them
// to any device; a guest has no account, so theirs stays in this browser.
const LOCAL_FAVORITES_KEY = "aegisneo_favorites";
function readLocalFavorites() {
    try {
        const saved = JSON.parse(readLocal(LOCAL_FAVORITES_KEY) || "[]");
        return Array.isArray(saved) ? saved.filter(id => typeof id === "string" && /^[0-9]{1,10}$/.test(id)) : [];
    } catch {
        return [];
    }
}
const favorites = new Set(Session.loggedIn ? [] : readLocalFavorites());

// starred objects already seen or fetched, so My List works outside the current 100-object batch
const favoriteCache = new Map();

function toggleFavorite(id) {
    const adding = !favorites.has(id);
    if (adding) {
        favorites.add(id);
        const asteroid = state.raw.find(a => a.neo_reference_id === id);
        if (asteroid) favoriteCache.set(id, asteroid);
    } else {
        favorites.delete(id);
    }
    if (Session.loggedIn) {
        apiFetch(`/api/v1/me/watchlist/${encodeURIComponent(id)}`, { method: adding ? "PUT" : "DELETE" })
            .then(r => (r.ok ? r.json() : null))
            .then(data => (data?.new_badges || []).forEach(b => showToast(b.icon, `Badge unlocked: ${b.name}`, b.description)))
            .catch(() => {});
    } else {
        writeLocal(LOCAL_FAVORITES_KEY, JSON.stringify([...favorites]));
    }
    updateWatchlistButton();
}

// On sign-in the list comes from the account. Stars a visitor saved in this browser
// before signing in are moved into the account once, then removed from the browser.
async function syncFavorites() {
    if (!Session.loggedIn) return;
    try {
        const response = await apiFetch("/api/v1/me/watchlist");
        if (!response.ok) return;
        (await response.json()).asteroids.forEach(a => { favorites.add(a.neo_reference_id); favoriteCache.set(a.neo_reference_id, a); });
        for (const id of readLocalFavorites()) {
            if (favorites.has(id)) continue;
            const put = await apiFetch(`/api/v1/me/watchlist/${encodeURIComponent(id)}`, { method: "PUT" });
            if (put.ok) favorites.add(id);
        }
        writeLocal(LOCAL_FAVORITES_KEY, null);
        updateWatchlistButton();
    } catch { /* the list stays empty until the next visit */ }
}

async function loadMissingFavorites() {
    state.raw.forEach(a => { if (favorites.has(a.neo_reference_id)) favoriteCache.set(a.neo_reference_id, a); });
    const missing = [...favorites].filter(id => !favoriteCache.has(id));
    const fetched = await Promise.all(missing.map(id =>
        fetch(`${API_URL}/api/v1/asteroids/${encodeURIComponent(id)}`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null)
    ));
    fetched.forEach(a => { if (a) favoriteCache.set(a.neo_reference_id, a); });
}

function watchlistItems() {
    const byId = new Map(state.raw.map(a => [a.neo_reference_id, a]));
    return [...favorites].map(id => byId.get(id) || favoriteCache.get(id)).filter(Boolean);
}

function updateWatchlistButton() {
    watchlistToggle.textContent = `★ My List (${favorites.size})`;
}

// PLAIN-LANGUAGE EXPLANATIONS — what each metric actually means, for non-space-nerds
const METRIC_TIPS = {
    diameter: "How wide the rock is, edge to edge. Picture the comparison line above for scale.",
    velocity: "How fast it's moving relative to Earth — most of these outrun any rocket humans have flown.",
    distance: "How close it got to Earth at its closest point. 'LD' = lunar distances (1 LD = the real Earth-Moon gap), so you can tell at a glance if it was a near-miss or nowhere close.",
    date: "The date of its closest pass — this catalog spans over a century, so some are historical.",
    magnitude: "A brightness rating astronomers use. Lower number = intrinsically brighter (usually bigger) — it's not a danger score.",
    size: "Our plain-language bucket for diameter: Small (under 140 m), Medium, or Large. 140 m is the real size NASA uses to flag an object as worth watching.",
};

function infoDot(tipKey) {
    const tip = escapeHtml(METRIC_TIPS[tipKey]);
    return `<span class="info-dot" tabindex="0" data-tip="${tip}">ⓘ</span>`;
}

let facts = ["Scanning near-Earth space…"];
let factIndex = 0;
let factTimer = null;


// LIST REQUESTS — only the latest load/search may render; starting a new one cancels the old
let listController = null;

function startListRequest() {
    if (listController) listController.abort();
    listController = new AbortController();
    return listController.signal;
}


// LOAD: the first page for the current search, filters and sort
async function fetchHazardCount(signal) {
    if (state.hazardFilter === "safe") return 0;
    if (state.hazardFilter === "hazard") return null; // the matches themselves are all hazardous
    try {
        const response = await fetch(`${API_URL}/api/v1/asteroids?${listQuery({ limit: 1, hazard: "hazard" })}`, { headers: authHeaders(), signal });
        return response.ok ? (await response.json()).matched : null;
    } catch (error) {
        if (error.name === "AbortError") throw error;
        return null;
    }
}

async function loadAsteroids() {
    const signal = startListRequest();
    const generation = ++state.generation;
    state.dirty = false;
    state.loadingMore = false;
    showLoading();

    try {
        const [response, hazardCount] = await Promise.all([
            fetch(`${API_URL}/api/v1/asteroids?${listQuery()}`, { headers: authHeaders(), signal }),
            fetchHazardCount(signal),
        ]);
        if (sessionEnded(response)) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (generation !== state.generation) return;
        state.raw = data.asteroids || [];
        state.matched = data.matched ?? state.raw.length;
        state.hazardMatched = state.hazardFilter === "hazard" ? state.matched : hazardCount;
        if (data.total !== undefined) statTotalEl.textContent = data.total.toLocaleString();
        guestTotal = data.total;
        updateAccountBar();
        applyFiltersAndSort();
        refreshFacts();
        renderOrbitHighlights();
        if (!gameState.round) newRound();
    }

    catch (error) {
        if (error.name === "AbortError") return;
        console.error(error);
        showError();
    }
}


// LOAD MORE: the next page, added below the cards already on screen
async function loadMore() {
    if (state.loadingMore || state.watchlistOnly || state.raw.length >= state.matched) return;
    const generation = state.generation;
    state.loadingMore = true;
    updateLoadMore();
    try {
        const response = await fetch(`${API_URL}/api/v1/asteroids?${listQuery({ offset: state.raw.length })}`, { headers: authHeaders() });
        if (sessionEnded(response)) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (generation !== state.generation) return; // a newer search replaced this list
        const have = new Set(state.raw.map(a => a.neo_reference_id));
        const fresh = (data.asteroids || []).filter(a => !have.has(a.neo_reference_id));
        state.raw = state.raw.concat(fresh);
        state.matched = data.matched ?? state.matched;
        state.lastList = state.raw.slice();
        appendAsteroids(fresh);
    } catch (error) {
        console.error(error);
        showToast("⚠️", "Could not load more", "Check your connection and try again.");
    } finally {
        if (generation === state.generation) {
            state.loadingMore = false;
            updateLoadMore();
        }
    }
}

function updateLoadMore() {
    const left = state.matched - state.raw.length;
    const show = !state.watchlistOnly && left > 0;
    loadMoreWrap.hidden = !show;
    if (!show) return;
    loadMoreBtn.disabled = state.loadingMore;
    loadMoreBtn.textContent = state.loadingMore ? "Loading…" : `Load ${Math.min(PAGE_SIZE, left).toLocaleString()} more`;
    loadMoreCount.textContent = `Showing ${state.raw.length.toLocaleString()} of ${state.matched.toLocaleString()} matching asteroids`;
}

function announceList(count, total) {
    listStatusEl.textContent = state.watchlistOnly
        ? `${count} asteroid${count === 1 ? "" : "s"} on your list.`
        : `Showing ${count.toLocaleString()} of ${total.toLocaleString()} matching asteroids.`;
}


// FILTER + SORT (frontend-only, per project rules — backend stays a dumb data source)
function getSizeTier(diameterKm) {
    if (diameterKm < 0.14) return "small";
    if (diameterKm < 1) return "medium";
    return "large";
}

function applyFiltersAndSort() {
    let list;
    if (state.watchlistOnly) {
        // "My List" is a set of ids, so it is filtered and sorted here.
        list = watchlistItems();
        if (state.hazardFilter === "safe") list = list.filter(a => !a.is_potentially_hazardous);
        if (state.hazardFilter === "hazard") list = list.filter(a => a.is_potentially_hazardous);
        if (state.sizeFilter !== "all") list = list.filter(a => getSizeTier(a.estimated_diameter_km) === state.sizeFilter);
        switch (state.sort) {
            case "name":
                list.sort((a, b) => a.name.localeCompare(b.name)); break;
            case "diameter-desc":
                list.sort((a, b) => b.estimated_diameter_km - a.estimated_diameter_km); break;
            case "diameter-asc":
                list.sort((a, b) => a.estimated_diameter_km - b.estimated_diameter_km); break;
            case "velocity-desc":
                list.sort((a, b) => b.relative_velocity_km_h - a.relative_velocity_km_h); break;
            case "distance-asc":
                list.sort((a, b) => a.miss_distance_km - b.miss_distance_km); break;
            case "date-desc":
                list.sort((a, b) => new Date(b.close_approach_date) - new Date(a.close_approach_date)); break;
            default: break;
        }
        updateStats(list.length, list.filter(a => a.is_potentially_hazardous).length);
        announceList(list.length, list.length);
    } else {
        list = state.raw.slice(); // already filtered and sorted by the API
        updateStats(state.matched, state.hazardMatched ?? list.filter(a => a.is_potentially_hazardous).length);
        announceList(list.length, state.matched);
    }

    state.lastList = list;
    displayAsteroids(list);
    updateLoadMore();
}

// The filters or the sort changed: ask the API again, or re-filter "My List" in place.
function refreshList() {
    if (state.watchlistOnly) {
        state.dirty = true;
        applyFiltersAndSort();
    } else {
        loadAsteroids();
    }
}


// DISPLAY ASTEROIDS
function displayAsteroids(asteroids) {
    if (!asteroids || asteroids.length === 0) {
        const message = state.watchlistOnly
            ? { title: "Your list is empty", sub: "Tap the ★ on any card to save it here." }
            : { title: "No objects detected in this sector", sub: "Adjust your filters or search parameters and scan again." };
        listEl.innerHTML = `
            <div class="empty-state">
                <p class="empty-title">${message.title}</p>
                <p class="empty-sub">${message.sub}</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = asteroids.map(asteroidCardHTML).join("");
    paintPortraits(asteroids, listEl.querySelectorAll("canvas.portrait"));
    initScrollReveal();
}

// Add cards below the ones on screen (Load more) without redrawing the rest.
function appendAsteroids(asteroids) {
    if (!asteroids.length) { updateLoadMore(); return; }
    const before = listEl.querySelectorAll(".asteroid-card").length;
    listEl.insertAdjacentHTML("beforeend", asteroids.map(asteroidCardHTML).join(""));
    const added = [...listEl.querySelectorAll(".asteroid-card")].slice(before);
    paintPortraits(asteroids, added.map(card => card.querySelector("canvas.portrait")));
    initScrollReveal();
    announceList(state.raw.length, state.matched);
    // Move keyboard focus to the first new card so a screen-reader user lands on the new results.
    added[0]?.querySelector(".detail-btn")?.focus({ preventScroll: true });
}

function paintPortraits(asteroids, canvases) {
    asteroids.forEach((asteroid, i) => {
        if (canvases[i]) drawAsteroidPortrait(canvases[i], asteroid, 96);
    });
}


// BUILD ONE CARD (template literal → innerHTML, mirrors the starter's displayCars pattern)
function asteroidCardHTML(asteroid) {
    const hazardous = asteroid.is_potentially_hazardous;
    const statusClass = hazardous ? "status-hazard" : "status-safe";
    const statusIcon = hazardous ? "assets/icon-warning.svg" : "assets/icon-safe.svg";
    const statusLabel = hazardous ? "Hazardous" : "Nominal";
    const tier = getSizeTier(asteroid.estimated_diameter_km);
    const isFav = favorites.has(asteroid.neo_reference_id);
    const id = escapeHtml(asteroid.neo_reference_id);

    return `
        <article class="asteroid-card ${statusClass}">
            <button class="fav-btn ${isFav ? "active" : ""}" type="button" data-neo="${id}" aria-label="${isFav ? "Remove from" : "Add to"} My List" aria-pressed="${isFav}">★</button>
            <div class="card-visual">
                <canvas class="portrait" data-neo="${id}" width="96" height="96" aria-hidden="true"></canvas>
                <span class="size-badge size-${tier}">${tier}</span>
            </div>
            <header class="card-head">
                <h3 class="card-name">${escapeHtml(asteroid.name)}</h3>
                <span class="status-chip">
                    <img class="status-icon" src="${statusIcon}" alt="" width="14" height="14">
                    <span class="status-label">${statusLabel}</span>
                </span>
            </header>
            <p class="card-id">${id}</p>
            <p class="card-compare">${compareSize(asteroid.estimated_diameter_km)}</p>
            <dl class="card-metrics">
                <div>
                    <dt>Diameter ${infoDot("diameter")}</dt>
                    <dd>${formatDiameter(asteroid.estimated_diameter_km)}</dd>
                </div>
                <div>
                    <dt>Velocity ${infoDot("velocity")}</dt>
                    <dd>${formatVelocity(asteroid.relative_velocity_km_h)}</dd>
                </div>
                <div>
                    <dt>Miss distance ${infoDot("distance")}</dt>
                    <dd>${formatDistance(asteroid.miss_distance_km)}</dd>
                </div>
                <div>
                    <dt>Close approach ${infoDot("date")}</dt>
                    <dd>${formatDate(asteroid.close_approach_date)}</dd>
                </div>
            </dl>
            <button class="detail-btn" type="button" data-neo="${id}">
                Full telemetry
            </button>
            ${Session.isAdmin ? `<div class="admin-row">
                <button class="admin-btn edit-btn" type="button" data-neo="${id}">✎ Edit</button>
                <button class="admin-btn del-btn" type="button" data-neo="${id}">🗑 Delete</button>
            </div>` : ""}
        </article>
    `;
}


// VIEW ONE ASTEROID (detail panel, replaces the starter's alert() popup)
async function viewAsteroid(id) {
    try {
        const response = await apiFetch(`/api/v1/asteroids/${encodeURIComponent(id)}`);
        if (!response.ok) {
            const detail = (await response.json().catch(() => ({}))).detail;
            throw new Error(response.status === 401 && typeof detail === "string" ? detail : "This object's telemetry could not be loaded.");
        }
        showDetailPanel(await response.json());
    }

    catch (error) {
        console.error(error);
        showToast("⚠️", "Telemetry unavailable", error instanceof TypeError ? "Could not reach the server." : error.message);
    }
}


function showDetailPanel(asteroid) {
    const hazardous = asteroid.is_potentially_hazardous;
    const tier = getSizeTier(asteroid.estimated_diameter_km);
    const isFav = favorites.has(asteroid.neo_reference_id);
    const opener = document.activeElement;
    closeDetailPanel({ restoreFocus: false });
    detailOpener = opener;

    const overlay = document.createElement("div");
    overlay.className = "detail-overlay";
    overlay.innerHTML = `
        <div class="detail-panel ${hazardous ? "status-hazard" : "status-safe"}" role="dialog" aria-modal="true" aria-labelledby="detailName">
            <button class="detail-close" type="button" aria-label="Close">&times;</button>
            <button class="fav-btn detail-fav ${isFav ? "active" : ""}" type="button" data-neo="${escapeHtml(asteroid.neo_reference_id)}" aria-label="${isFav ? "Remove from" : "Add to"} My List" aria-pressed="${isFav}">★</button>
            <div class="detail-top">
                <canvas class="portrait portrait-lg" width="140" height="140" aria-hidden="true"></canvas>
                <div>
                    <p class="detail-eyebrow">${escapeHtml(asteroid.neo_reference_id)}</p>
                    <h2 class="detail-name" id="detailName">${escapeHtml(asteroid.name)}</h2>
                    <span class="status-chip detail-status-chip">
                        <img class="status-icon" src="${hazardous ? "assets/icon-warning.svg" : "assets/icon-safe.svg"}" alt="" width="14" height="14">
                        <span class="status-label">${hazardous ? "Potentially hazardous" : "Nominal / non-hazardous"}</span>
                    </span>
                </div>
            </div>

            <div class="size-scale" aria-hidden="true">
                <span class="size-scale-label">Small</span>
                <div class="size-scale-track">
                    <div class="size-scale-fill size-scale-${tier}"></div>
                </div>
                <span class="size-scale-label">Large</span>
            </div>

            <p class="detail-fact">${compareSize(asteroid.estimated_diameter_km)} · ${compareSpeed(asteroid.relative_velocity_km_h)}.</p>

            <div class="detail-grid">
                <div><dt>Estimated diameter ${infoDot("diameter")}</dt><dd>${formatDiameter(asteroid.estimated_diameter_km)}</dd></div>
                <div><dt>Relative velocity ${infoDot("velocity")}</dt><dd>${formatVelocity(asteroid.relative_velocity_km_h)}</dd></div>
                <div><dt>Miss distance ${infoDot("distance")}</dt><dd>${formatDistance(asteroid.miss_distance_km)}</dd></div>
                <div><dt>Close approach date ${infoDot("date")}</dt><dd>${formatDate(asteroid.close_approach_date)}</dd></div>
                <div><dt>Absolute magnitude ${infoDot("magnitude")}</dt><dd>${asteroid.absolute_magnitude?.toFixed(2) ?? "—"}</dd></div>
                <div><dt>Size classification ${infoDot("size")}</dt><dd class="capitalize">${tier}</dd></div>
            </div>

            <button class="copy-btn" type="button">📋 Copy telemetry</button>
        </div>
    `;
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay || e.target.classList.contains("detail-close")) {
            closeDetailPanel();
            return;
        }
        const favBtn = e.target.closest(".fav-btn");
        if (favBtn) {
            toggleFavorite(favBtn.dataset.neo);
            const nowFav = favorites.has(favBtn.dataset.neo);
            if (nowFav) favoriteCache.set(asteroid.neo_reference_id, asteroid);
            favBtn.classList.toggle("active", nowFav);
            favBtn.setAttribute("aria-pressed", String(nowFav));
            return;
        }
        if (e.target.closest(".copy-btn")) {
            copyTelemetry(asteroid, e.target.closest(".copy-btn"));
        }
    });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", handleDetailKeys);
    overlay.querySelector(".detail-close").focus();

    const portrait = overlay.querySelector("canvas.portrait-lg");
    if (portrait) drawAsteroidPortrait(portrait, asteroid, 140);
}

function copyTelemetry(asteroid, btn) {
    const tier = getSizeTier(asteroid.estimated_diameter_km);
    const text = [
        `AegisNEO telemetry — ${asteroid.name} (${asteroid.neo_reference_id})`,
        `Status: ${asteroid.is_potentially_hazardous ? "Potentially hazardous" : "Nominal"}`,
        `Diameter: ${formatDiameter(asteroid.estimated_diameter_km)} (${tier}) — ${compareSize(asteroid.estimated_diameter_km)}`,
        `Velocity: ${formatVelocity(asteroid.relative_velocity_km_h)} — ${compareSpeed(asteroid.relative_velocity_km_h)}`,
        `Miss distance: ${formatDistance(asteroid.miss_distance_km)}`,
        `Close approach: ${formatDate(asteroid.close_approach_date)}`,
    ].join("\n");

    navigator.clipboard?.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = "✔ Copied";
        setTimeout(() => { btn.textContent = original; }, 1600);
    }).catch(() => {});
}

let detailOpener = null;

function closeDetailPanel({ restoreFocus = true } = {}) {
    const existing = document.querySelector(".detail-overlay");
    if (existing) existing.remove();
    document.removeEventListener("keydown", handleDetailKeys);
    if (restoreFocus && detailOpener && document.contains(detailOpener)) detailOpener.focus({ preventScroll: true });
    detailOpener = null;
}

// Keep Tab inside an open dialog (the detail panel or the editor).
function trapTab(event, container) {
    if (event.key !== "Tab") return;
    const items = [...container.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
        .filter(el => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (!container.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function handleDetailKeys(e) {
    if (e.key === "Escape") { closeDetailPanel(); return; }
    const panel = document.querySelector(".detail-panel");
    if (panel) trapTab(e, panel);
}


// PROCEDURAL ASTEROID PORTRAIT — every card gets a unique rocky sprite, deterministic
// from its own reference ID (same asteroid always renders the same way), sized off its
// real diameter tier and tinted by its real hazard status. No stock photos, no network.
function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function drawAsteroidPortrait(canvas, asteroid, size) {
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const rng = mulberry32(hashString(asteroid.neo_reference_id));
    const hazardous = asteroid.is_potentially_hazardous;
    const glow = hazardous ? "245,165,36" : "62,224,232";
    const cx = size / 2, cy = size / 2;
    const baseR = size * 0.32;

    // ambient glow
    const outerGrad = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, size * 0.5);
    outerGrad.addColorStop(0, `rgba(${glow},0.32)`);
    outerGrad.addColorStop(1, `rgba(${glow},0)`);
    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // lumpy silhouette
    const points = 14;
    const radii = [];
    for (let i = 0; i < points; i++) radii.push(baseR * (0.72 + rng() * 0.36));

    const path = () => {
        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const r = radii[i % points];
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
    };

    ctx.save();
    path();
    const rockGrad = ctx.createRadialGradient(cx - baseR * 0.3, cy - baseR * 0.3, baseR * 0.1, cx, cy, baseR * 1.3);
    rockGrad.addColorStop(0, "#4b5468");
    rockGrad.addColorStop(0.55, "#2b3140");
    rockGrad.addColorStop(1, "#14171f");
    ctx.fillStyle = rockGrad;
    ctx.fill();
    ctx.clip();

    const craterCount = 4 + Math.floor(rng() * 5);
    for (let i = 0; i < craterCount; i++) {
        const a = rng() * Math.PI * 2;
        const dist = rng() * baseR * 0.7;
        const px = cx + Math.cos(a) * dist;
        const py = cy + Math.sin(a) * dist;
        const cr = baseR * (0.08 + rng() * 0.14);
        const craterGrad = ctx.createRadialGradient(px - cr * 0.3, py - cr * 0.3, cr * 0.1, px, py, cr);
        craterGrad.addColorStop(0, "rgba(0,0,0,0.55)");
        craterGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = craterGrad;
        ctx.beginPath();
        ctx.arc(px, py, cr, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.save();
    path();
    ctx.strokeStyle = `rgba(${glow},0.55)`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
}


// RELATABLE COMPARISONS — translate raw numbers into things a non-space-nerd can picture
function phraseComparison(value, ladder, verb) {
    let best = ladder[0], bestDist = Infinity;
    for (const entry of ladder) {
        const dist = Math.abs(Math.log(value) - Math.log(entry.v));
        if (dist < bestDist) { bestDist = dist; best = entry; }
    }
    const ratio = value / best.v;
    if (ratio >= 0.75 && ratio <= 1.35) return `${verb} ${best.label}`;
    if (ratio > 1.35) return `~${formatMultiplier(ratio)}× ${verb} ${best.label}`;
    return `~${formatMultiplier(1 / ratio)}× smaller than ${best.label}`;
}

function formatMultiplier(n) {
    return n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString();
}

function compareSize(diameterKm) {
    const meters = diameterKm * 1000;
    const ladder = [
        { v: 1, label: "a refrigerator" },
        { v: 4, label: "a small car" },
        { v: 12, label: "a school bus" },
        { v: 25, label: "a blue whale" },
        { v: 50, label: "an Olympic pool" },
        { v: 93, label: "the Statue of Liberty" },
        { v: 110, label: "a football field" },
        { v: 140, label: "NASA's hazard-size threshold" },
        { v: 300, label: "the Eiffel Tower" },
        { v: 450, label: "the Empire State Building" },
        { v: 830, label: "the Burj Khalifa" },
        { v: 1000, label: "a small mountain" },
        { v: 4000, label: "Central Park's length" },
        { v: 8849, label: "Mount Everest's height" },
        { v: 10000, label: "the dinosaur-extinction impactor" },
    ];
    return phraseComparison(meters, ladder, "as wide as");
}

function compareSpeed(kmh) {
    const ladder = [
        { v: 100, label: "a car on the highway" },
        { v: 300, label: "a high-speed train" },
        { v: 900, label: "a commercial jet" },
        { v: 1235, label: "the speed of sound" },
        { v: 2200, label: "the Concorde" },
        { v: 3540, label: "the SR-71 Blackbird" },
        { v: 28000, label: "the ISS in orbit" },
        { v: 40000, label: "Earth's escape velocity" },
    ];
    return phraseComparison(kmh, ladder, "as fast as");
}


// FUN FACT TICKER — rotates real facts pulled from whatever's currently loaded
function buildFunFacts(list) {
    if (!list.length) return ["No telemetry in range — try Show All."];

    const byDiameter = [...list].sort((a, b) => b.estimated_diameter_km - a.estimated_diameter_km);
    const byVelocity = [...list].sort((a, b) => b.relative_velocity_km_h - a.relative_velocity_km_h);
    const byDistance = [...list].sort((a, b) => a.miss_distance_km - b.miss_distance_km);
    const hazardCount = list.filter(a => a.is_potentially_hazardous).length;
    const biggest = byDiameter[0];
    const fastest = byVelocity[0];
    const closest = byDistance[0];

    return [
        `${biggest.name} is the largest object in this view — ${compareSize(biggest.estimated_diameter_km)}.`,
        `${fastest.name} is moving at ${Math.round(fastest.relative_velocity_km_h).toLocaleString()} km/h — ${compareSpeed(fastest.relative_velocity_km_h)}.`,
        `${closest.name} passed within ${(closest.miss_distance_km / LUNAR_DISTANCE_KM).toFixed(1)} lunar distances of Earth.`,
        `${hazardCount} of ${list.length} objects shown are flagged potentially hazardous.`,
        `NASA flags anything wider than 140 m passing within 7.5M km as "potentially hazardous."`,
    ];
}

function refreshFacts() {
    facts = buildFunFacts(state.raw);
    factIndex = 0;
    renderFact();
    if (factTimer) clearInterval(factTimer);
    factTimer = setInterval(() => {
        if (document.hidden) return;
        factIndex = (factIndex + 1) % facts.length;
        renderFact();
    }, 5200);
}

function renderFact() {
    if (prefersReducedMotion) {
        factTextEl.textContent = facts[factIndex];
        return;
    }
    factTextEl.classList.add("fading");
    setTimeout(() => {
        factTextEl.textContent = facts[factIndex];
        factTextEl.classList.remove("fading");
    }, 220);
}


// ORBIT HIGHLIGHTS — the hero's centerpiece, now doing something: three real standouts
// from the current batch (closest / fastest / biggest), clickable straight into their telemetry.
function renderOrbitHighlights() {
    if (!orbitHighlightsEl) return;
    const list = state.raw;
    if (!list.length) {
        orbitHighlightsEl.innerHTML = `<p class="orbit-loading">No objects in range.</p>`;
        return;
    }

    const closest = [...list].sort((a, b) => a.miss_distance_km - b.miss_distance_km)[0];
    const fastest = [...list].sort((a, b) => b.relative_velocity_km_h - a.relative_velocity_km_h)[0];
    const biggest = [...list].sort((a, b) => b.estimated_diameter_km - a.estimated_diameter_km)[0];

    const items = [
        { a: closest, label: "Closest", pos: "pos-top" },
        { a: fastest, label: "Fastest", pos: "pos-right" },
        { a: biggest, label: "Biggest", pos: "pos-left" },
    ];

    orbitHighlightsEl.innerHTML = items.map(it => `
        <button class="orbit-highlight ${it.pos}" type="button" data-neo="${escapeHtml(it.a.neo_reference_id)}" title="${escapeHtml(it.a.name)}">
            <canvas class="portrait" width="34" height="34" aria-hidden="true"></canvas>
            <span class="orbit-highlight-label">${it.label}</span>
        </button>
    `).join("");

    const buttons = orbitHighlightsEl.querySelectorAll(".orbit-highlight");
    items.forEach((it, i) => {
        const canvas = buttons[i].querySelector("canvas.portrait");
        drawAsteroidPortrait(canvas, it.a, 34);
        buttons[i].addEventListener("click", () => viewAsteroid(it.a.neo_reference_id));
    });
}


// COSMIC GUESSER — a lightweight, data-driven mini-game. No fabricated data: every round
// pits two real, already-fetched asteroids against each other on a real field.
const GAME_DIMENSIONS = [
    { key: "estimated_diameter_km", prompt: "Which one is BIGGER?", higherWins: true, format: formatDiameter },
    { key: "relative_velocity_km_h", prompt: "Which one is FASTER?", higherWins: true, format: formatVelocity },
    { key: "miss_distance_km", prompt: "Which one came CLOSER to Earth?", higherWins: false, format: formatDistance },
];

const gameState = {
    streak: 0,
    best: Number(readLocal("aegisneo_best_streak")) || 0,
    round: null,
};

// The game draws from its own random pool, so a search or filter that matches few
// asteroids (or none) does not stop it.
let gamePool = [];
let roundsSincePool = 0;

async function refillGamePool() {
    roundsSincePool = 0;
    try {
        const response = await apiFetch("/api/v1/asteroids/random?count=20");
        if (response.ok) gamePool = (await response.json()).asteroids || [];
    } catch { /* the list on screen is used instead */ }
}

async function newRound() {
    if (!gameArenaEl) return;
    if (!gamePool.length || roundsSincePool >= 8) await refillGamePool();
    roundsSincePool++;
    const pool = gamePool.length >= 2 ? gamePool : state.raw;
    if (pool.length < 2) {
        gameArenaEl.innerHTML = `<p class="game-empty">Not enough asteroids to play right now.</p>`;
        return;
    }

    const dim = GAME_DIMENSIONS[Math.floor(Math.random() * GAME_DIMENSIONS.length)];
    let a, b, tries = 0;
    do {
        a = pool[Math.floor(Math.random() * pool.length)];
        b = pool[Math.floor(Math.random() * pool.length)];
        tries++;
    } while (tries < 30 && (a.neo_reference_id === b.neo_reference_id || a[dim.key] === b[dim.key]));

    gameState.round = { dim, a, b, answered: false };
    gamePromptEl.textContent = dim.prompt;
    gameFeedbackEl.textContent = "";
    gameFeedbackEl.className = "game-feedback";
    gameStreakEl.textContent = gameState.streak;
    gameBestEl.textContent = gameState.best;
    renderGameArena();
}

function renderGameArena() {
    const { a, b } = gameState.round;
    gameArenaEl.innerHTML = `
        <button class="game-pick" type="button" data-side="0">
            <canvas class="portrait" width="72" height="72" aria-hidden="true"></canvas>
            <span class="game-pick-name">${escapeHtml(a.name)}</span>
            <span class="game-pick-value" data-value></span>
        </button>
        <span class="game-vs">VS</span>
        <button class="game-pick" type="button" data-side="1">
            <canvas class="portrait" width="72" height="72" aria-hidden="true"></canvas>
            <span class="game-pick-name">${escapeHtml(b.name)}</span>
            <span class="game-pick-value" data-value></span>
        </button>
    `;
    const canvases = gameArenaEl.querySelectorAll("canvas.portrait");
    drawAsteroidPortrait(canvases[0], a, 72);
    drawAsteroidPortrait(canvases[1], b, 72);
    gameArenaEl.querySelectorAll(".game-pick").forEach(btn => {
        btn.addEventListener("click", onGamePick);
    });
}

function onGamePick(e) {
    const round = gameState.round;
    if (!round || round.answered) return;
    round.answered = true;

    const side = Number(e.currentTarget.dataset.side);
    const objs = [round.a, round.b];
    const dim = round.dim;
    const pickedVal = objs[side][dim.key];
    const bestVal = dim.higherWins ? Math.max(round.a[dim.key], round.b[dim.key]) : Math.min(round.a[dim.key], round.b[dim.key]);
    const correct = pickedVal === bestVal;

    gameArenaEl.querySelectorAll(".game-pick").forEach((btn, i) => {
        const obj = objs[i];
        btn.querySelector("[data-value]").textContent = dim.format(obj[dim.key]);
        btn.classList.add(obj[dim.key] === bestVal ? "correct" : "incorrect");
        btn.disabled = true;
    });

    if (correct) {
        gameState.streak++;
        gameState.best = Math.max(gameState.best, gameState.streak);
        writeLocal("aegisneo_best_streak", String(gameState.best));
        gameFeedbackEl.textContent = "Correct! Nice instinct.";
        gameFeedbackEl.className = "game-feedback game-feedback-good";
        const rect = e.currentTarget.getBoundingClientRect();
        spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else {
        gameState.streak = 0;
        gameFeedbackEl.textContent = "Not quite — streak reset. Another round?";
        gameFeedbackEl.className = "game-feedback game-feedback-bad";
    }
    gameStreakEl.textContent = gameState.streak;
    gameBestEl.textContent = gameState.best;

    setTimeout(newRound, 1900);
}


// FORMATTERS — raw numeric metrics → human-readable telemetry
function formatDiameter(km) {
    if (km < 1) return `${km.toFixed(3)} km (≈${Math.round(km * 1000)} m)`;
    return `${km.toFixed(2)} km`;
}

function formatVelocity(kmh) {
    const kms = kmh / 3600;
    return `${Math.round(kmh).toLocaleString()} km/h (≈${kms.toFixed(1)} km/s)`;
}

function formatDistance(km) {
    const lunar = km / LUNAR_DISTANCE_KM;
    return `${Math.round(km).toLocaleString()} km (≈${lunar.toFixed(1)} LD)`;
}

function formatDate(isoDate) {
    const d = new Date(isoDate + "T00:00:00");
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}


// SCROLL REVEAL — cards fade/rise into place as they enter the viewport
function initScrollReveal() {
    if (prefersReducedMotion || !("IntersectionObserver" in window)) return;

    const cards = listEl.querySelectorAll(".asteroid-card");
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("in-view");
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    cards.forEach(card => {
        card.classList.add("pre-reveal");
        obs.observe(card);
    });
}


// STATE HELPERS
function showLoading() {
    listEl.innerHTML = `
        <div class="loading-state">
            <div class="radar" aria-hidden="true"></div>
            <p>Scanning near-Earth space…</p>
        </div>
    `;
}

function showError() {
    listEl.innerHTML = `
        <div class="empty-state">
            <p class="empty-title">Telemetry link lost</p>
            <p class="empty-sub">We could not reach the AegisNEO API. Check your connection, then try again.</p>
            <button class="retry-btn cta" type="button">Try again</button>
        </div>
    `;
}

function animateNumber(el, target) {
    if (target === null || target === undefined) return;
    if (prefersReducedMotion) { el.textContent = target.toLocaleString(); return; }

    const start = Number(el.textContent.replace(/[^\d.-]/g, "")) || 0;
    const startTime = performance.now();
    const duration = 650;

    function tick(now) {
        const p = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(start + (target - start) * eased).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function updateStats(shown, hazardCount) {
    animateNumber(statShownEl, shown);
    animateNumber(statHazardEl, hazardCount);
}


// FILTER CHIPS + SORT
document.querySelectorAll(".chip").forEach(btn => {
    btn.addEventListener("click", () => {
        const group = btn.dataset.filter;
        document.querySelectorAll(`.chip[data-filter="${group}"]`).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        if (group === "hazard") state.hazardFilter = btn.dataset.value;
        if (group === "size") state.sizeFilter = btn.dataset.value;
        refreshList();
    });
});

sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    refreshList();
});

watchlistToggle.addEventListener("click", async () => {
    state.watchlistOnly = !state.watchlistOnly;
    watchlistToggle.classList.toggle("active", state.watchlistOnly);
    watchlistToggle.setAttribute("aria-pressed", String(state.watchlistOnly));
    if (state.watchlistOnly) {
        showLoading();
        await loadMissingFavorites();
        applyFiltersAndSort();
    } else if (state.dirty) {
        loadAsteroids(); // the filters changed while the list was open
    } else {
        applyFiltersAndSort();
    }
});

loadMoreBtn.addEventListener("click", loadMore);

listEl.addEventListener("click", (e) => {
    if (e.target.closest(".retry-btn")) { loadAsteroids(); return; }
    const detailBtn = e.target.closest(".detail-btn");
    if (detailBtn) {
        viewAsteroid(detailBtn.dataset.neo);
        return;
    }
    const editBtn = e.target.closest(".edit-btn");
    if (editBtn) {
        openEditor(state.raw.find(a => a.neo_reference_id === editBtn.dataset.neo));
        return;
    }
    const delBtn = e.target.closest(".del-btn");
    if (delBtn) {
        deleteAsteroid(delBtn.dataset.neo);
        return;
    }
    const favBtn = e.target.closest(".fav-btn");
    if (!favBtn) return;
    toggleFavorite(favBtn.dataset.neo);
    const nowFav = favorites.has(favBtn.dataset.neo);
    favBtn.classList.toggle("active", nowFav);
    favBtn.setAttribute("aria-pressed", String(nowFav));
    favBtn.setAttribute("aria-label", (nowFav ? "Remove from" : "Add to") + " My List");
    if (state.watchlistOnly && !nowFav) applyFiltersAndSort();
});

updateWatchlistButton();


// SURPRISE ME — jump straight to a random object's full telemetry, from the whole visible catalog
surpriseBtn.addEventListener("click", async (e) => {
    spawnBurst(e.clientX, e.clientY);
    let pick = null;
    try {
        const response = await apiFetch("/api/v1/asteroids/random?count=1");
        if (response.ok) pick = (await response.json()).asteroids?.[0] || null;
    } catch { /* fall back to what is loaded */ }
    if (!pick) {
        const pool = state.lastList.length ? state.lastList : state.raw;
        pick = pool[Math.floor(Math.random() * pool.length)];
    }
    if (pick) viewAsteroid(pick.neo_reference_id);
});


// CARD TILT + SPOTLIGHT (micro-interaction)
listEl.addEventListener("mousemove", (e) => {
    if (prefersReducedMotion) return;
    const card = e.target.closest(".asteroid-card");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    card.style.setProperty("--tiltX", ((py - 0.5) * -8).toFixed(2) + "deg");
    card.style.setProperty("--tiltY", ((px - 0.5) * 8).toFixed(2) + "deg");
    card.style.setProperty("--glowX", (px * 100).toFixed(1) + "%");
    card.style.setProperty("--glowY", (py * 100).toFixed(1) + "%");
});

listEl.addEventListener("mouseout", (e) => {
    const card = e.target.closest(".asteroid-card");
    if (!card || card.contains(e.relatedTarget)) return;
    card.style.removeProperty("--tiltX");
    card.style.removeProperty("--tiltY");
});


// BUTTON RIPPLE (micro-interaction, all buttons)
document.addEventListener("click", (e) => {
    if (prefersReducedMotion) return;
    const btn = e.target.closest("button");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
    ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
});


// SHOOTING STARS — occasional diagonal streaks, varied in size/color/speed; the rare
// big "meteor" leaves a little particle flare where it burns out.
const METEOR_COLORS = ["238,242,249", "238,242,249", "238,242,249", "62,224,232", "245,165,36"];

function spawnShootingStar() {
    if (prefersReducedMotion) return;
    const isMeteor = Math.random() < 0.18;
    const color = METEOR_COLORS[Math.floor(Math.random() * METEOR_COLORS.length)];
    const top = Math.random() * 50;
    const left = Math.random() * 70;
    const dur = (isMeteor ? 1.5 : 0.9) + Math.random() * 0.9;
    const dist = isMeteor ? 620 : 300 + Math.random() * 160;

    const el = document.createElement("div");
    el.className = "shooting-star" + (isMeteor ? " meteor" : "");
    el.style.top = top + "%";
    el.style.left = left + "%";
    el.style.setProperty("--dur", dur.toFixed(2) + "s");
    el.style.setProperty("--dist", dist + "px");
    el.style.setProperty("--star-color", `rgba(${color}, 0.95)`);
    document.body.appendChild(el);

    el.addEventListener("animationend", () => {
        if (isMeteor) {
            const rect = el.getBoundingClientRect();
            spawnBurst(rect.left, rect.top);
        }
        el.remove();
    });
}

if (!prefersReducedMotion) {
    setInterval(() => { if (!document.hidden && Math.random() < 0.75) spawnShootingStar(); }, 2600);

    // subtle parallax on the starfield — depth without anything moving far
    const starsLayer = document.querySelector(".stars");
    let parallaxTicking = false;
    window.addEventListener("mousemove", (e) => {
        if (parallaxTicking) return;
        parallaxTicking = true;
        requestAnimationFrame(() => {
            const dx = (e.clientX / innerWidth - 0.5) * 12;
            const dy = (e.clientY / innerHeight - 0.5) * 12;
            if (starsLayer) starsLayer.style.transform = `translate(${dx}px, ${dy}px)`;
            parallaxTicking = false;
        });
    });
}


// CURSOR PARTICLE TRAIL + SURPRISE-ME BURST
const fxCanvas = document.getElementById("fxCanvas");
const fxCtx = fxCanvas.getContext("2d");
let particles = [];

function resizeFx() {
    fxCanvas.width = innerWidth;
    fxCanvas.height = innerHeight;
}
resizeFx();
window.addEventListener("resize", resizeFx);

function spawnBurst(x, y) {
    if (prefersReducedMotion) return;
    for (let i = 0; i < 24; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3.5;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life: 1, decay: 0.02 + Math.random() * 0.015,
            r: 2 + Math.random() * 2,
            color: Math.random() < 0.5 ? "245,165,36" : "62,224,232",
        });
    }
}

if (!prefersReducedMotion) {
    if (matchMedia("(pointer: fine)").matches) {
        let lastMove = 0;
        window.addEventListener("mousemove", (e) => {
            const now = performance.now();
            if (now - lastMove < 16) return;
            lastMove = now;
            particles.push({
                x: e.clientX, y: e.clientY, vx: 0, vy: 0,
                life: 1, decay: 0.045, r: 2.4, color: "62,224,232",
            });
            if (particles.length > 220) particles.splice(0, particles.length - 220);
        });
    }

    let fxDirty = false;
    (function renderParticles() {
        if (!particles.length) {
            // Nothing to draw: clear once, then just wait for the next particle.
            if (fxDirty) { fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height); fxDirty = false; }
            requestAnimationFrame(renderParticles);
            return;
        }
        fxDirty = true;
        fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
        particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= p.decay; });
        particles = particles.filter(p => p.life > 0);
        particles.forEach(p => {
            fxCtx.beginPath();
            fxCtx.arc(p.x, p.y, Math.max(p.r * p.life, 0), 0, Math.PI * 2);
            fxCtx.fillStyle = `rgba(${p.color},${Math.max(p.life, 0) * 0.7})`;
            fxCtx.fill();
        });
        requestAnimationFrame(renderParticles);
    })();
}


// WIRE UP SEARCH (button/enter click immediately, typing debounces)
let searchDebounce = null;

function runSearch() {
    state.query = searchInput.value.trim();
    loadAsteroids();
}

document.getElementById("searchBtn").addEventListener("click", () => {
    clearTimeout(searchDebounce);
    runSearch();
});

document.getElementById("resetBtn").addEventListener("click", () => {
    clearTimeout(searchDebounce);
    searchInput.value = "";
    runSearch();
});

searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        clearTimeout(searchDebounce);
        runSearch();
    }
});

searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        const q = searchInput.value.trim();
        if (q.length === 0 || q.length >= 2) runSearch();
    }, 350);
});


// TOASTS
function showToast(icon, title, text) {
    let box = document.getElementById("toastBox");
    if (!box) {
        box = document.createElement("div");
        box.id = "toastBox";
        box.className = "toast-box";
        box.setAttribute("aria-live", "polite");
        document.body.appendChild(box);
    }
    const el = document.createElement("div");
    el.className = "toast-item";
    el.innerHTML = `<span aria-hidden="true">${escapeHtml(icon)}</span><div><strong>${escapeHtml(title)}</strong><br><small>${escapeHtml(text || "")}</small></div>`;
    box.appendChild(el);
    setTimeout(() => el.remove(), 5000);
}


// ACCOUNT BAR: who is signed in, the way back to the hub, log out
const accountLabel = document.getElementById("accountLabel");
const accountBtn = document.getElementById("accountBtn");
const guestBanner = document.getElementById("guestBanner");
let guestTotal = null;

function updateAccountBar() {
    if (Session.loggedIn) {
        accountLabel.textContent = `Signed in as ${Session.username} (${Session.role})`;
        accountBtn.textContent = "Log out";
        guestBanner.hidden = true;
    } else {
        accountLabel.textContent = "Guest view";
        accountBtn.textContent = "Sign in";
        guestBanner.hidden = false;
        guestBanner.querySelector("span").textContent =
            `You are a guest: ${guestTotal ?? 10} featured asteroids are shown. Create a free account to see the whole catalog.`;
    }
}

accountBtn.addEventListener("click", () => {
    if (Session.loggedIn) Session.logOut();
    else location.assign("auth");
});


// ADMIN: create, edit and delete (the API refuses everyone else with 403)
const editor = document.getElementById("editorOverlay");
const editorForm = document.getElementById("editorForm");
const editorError = document.getElementById("editorError");
let editingId = null;

const EDITOR_FIELDS = [
    "neo_reference_id", "name", "estimated_diameter_km", "close_approach_date",
    "relative_velocity_km_h", "miss_distance_km", "absolute_magnitude",
];

let editorOpener = null;

function openEditor(asteroid) {
    editorOpener = document.activeElement;
    editingId = asteroid ? asteroid.neo_reference_id : null;
    document.getElementById("editorTitle").textContent = asteroid ? `Edit ${asteroid.name}` : "New asteroid";
    EDITOR_FIELDS.forEach(field => { editorForm.elements[field].value = asteroid ? asteroid[field] : ""; });
    editorForm.elements.neo_reference_id.disabled = Boolean(asteroid);
    editorForm.elements.is_potentially_hazardous.checked = Boolean(asteroid?.is_potentially_hazardous);
    editorForm.elements.is_featured.checked = Boolean(asteroid?.is_featured);
    editorError.textContent = "";
    editor.hidden = false;
    editorForm.elements[asteroid ? "name" : "neo_reference_id"].focus();
}

function closeEditor() {
    editor.hidden = true;
    if (editorOpener && document.contains(editorOpener)) editorOpener.focus({ preventScroll: true });
    editorOpener = null;
}

function editorProblem(detail) {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]) return `Check "${detail[0].loc.at(-1)}": ${detail[0].msg}`;
    return "The asteroid could not be saved.";
}

editorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const number = name => Number(editorForm.elements[name].value);
    const body = {
        name: editorForm.elements.name.value.trim(),
        estimated_diameter_km: number("estimated_diameter_km"),
        is_potentially_hazardous: editorForm.elements.is_potentially_hazardous.checked,
        close_approach_date: editorForm.elements.close_approach_date.value,
        relative_velocity_km_h: number("relative_velocity_km_h"),
        miss_distance_km: number("miss_distance_km"),
        absolute_magnitude: number("absolute_magnitude"),
        is_featured: editorForm.elements.is_featured.checked,
    };
    if (!editingId) body.neo_reference_id = editorForm.elements.neo_reference_id.value.trim();
    const submitBtn = editorForm.querySelector("[type=submit]");
    submitBtn.disabled = true;
    editorError.textContent = "";
    try {
        const response = await apiFetch(
            editingId ? `/api/v1/asteroids/${encodeURIComponent(editingId)}` : "/api/v1/asteroids",
            { method: editingId ? "PATCH" : "POST", json: body });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(editorProblem(data.detail));
        closeEditor();
        showToast("✔", editingId ? "Asteroid updated" : "Asteroid created", data.name);
        await loadAsteroids();
    } catch (error) {
        editorError.textContent = error instanceof TypeError ? "Could not reach the server." : error.message;
    } finally {
        submitBtn.disabled = false;
    }
});

document.getElementById("editorCancel").addEventListener("click", closeEditor);
editor.addEventListener("click", (event) => { if (event.target === editor) closeEditor(); });
document.addEventListener("keydown", (event) => {
    if (editor.hidden) return;
    if (event.key === "Escape") closeEditor();
    else trapTab(event, editorForm);
});

async function deleteAsteroid(id) {
    const asteroid = state.raw.find(a => a.neo_reference_id === id);
    if (!confirm(`Delete ${asteroid ? asteroid.name : id}? This removes it from the catalog and from every watchlist.`)) return;
    try {
        const response = await apiFetch(`/api/v1/asteroids/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Could not delete.");
        favorites.delete(id);
        updateWatchlistButton();
        showToast("🗑", "Asteroid deleted", asteroid ? asteroid.name : id);
        await loadAsteroids();
    } catch (error) {
        showToast("⚠️", "Not deleted", error.message);
    }
}

const newBtn = document.getElementById("newBtn");
newBtn.hidden = !Session.isAdmin;
newBtn.addEventListener("click", () => openEditor(null));


// START: only a signed-in visitor or a guest gets here (otherwise: the sign-in page)
(async function start() {
    if (!Session.require()) return;
    updateAccountBar();
    await syncFavorites();
    await loadAsteroids();
    if (new URLSearchParams(location.search).get("list")) watchlistToggle.click();
})();
