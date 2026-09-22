// Constellation Explorer — a persistent, pannable/zoomable star map of NEOs
// charted from the AegisNEO API. The API caps every response at 100 objects
// (search or default), so instead of pretending to show the full 33.5k-object
// field at once, each search "charts" its up to-100 results onto a shared,
// deduplicated map that grows across the session. Nearby charted objects are
// auto-linked into named constellations, a timeline lets you scrub through
// real close-approach dates, and a leaderboard/compare tray lets you size
// objects up against each other.

const API_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://127.0.0.1:8000"
    : "https://aegisneo-api.vercel.app";

// Matches the backend's API_KEY in index.py (student-project scale auth, not production-grade).
const API_KEY = "student-api-key-123";
const API_HEADERS = { "x-api-key": API_KEY };

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
const viewportWrap = document.querySelector(".viewport-wrap");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const loadDefaultBtn = document.getElementById("loadDefaultBtn");
const chartedCountEl = document.getElementById("chartedCount");
const totalCountEl = document.getElementById("totalCount");
const clusterCountEl = document.getElementById("clusterCount");
const emptyState = document.getElementById("emptyState");
const loadingState = document.getElementById("loadingState");
const detailPanel = document.getElementById("detailPanel");
const detailBody = document.getElementById("detailBody");
const detailClose = document.getElementById("detailClose");
const detailCompareBtn = document.getElementById("detailCompareBtn");

const timelineBar = document.getElementById("timelineBar");
const timelinePlay = document.getElementById("timelinePlay");
const timelineRange = document.getElementById("timelineRange");
const timelineLabel = document.getElementById("timelineLabel");
const timelineReset = document.getElementById("timelineReset");

const leaderboardBtn = document.getElementById("leaderboardBtn");
const leaderboardPanel = document.getElementById("leaderboardPanel");
const leaderboardClose = document.getElementById("leaderboardClose");
const lbList = document.getElementById("lbList");
const lbTabs = document.querySelectorAll(".lb-tab");

const compareTray = document.getElementById("compareTray");
const compareTrayChips = document.getElementById("compareTrayChips");
const compareOpenBtn = document.getElementById("compareOpenBtn");
const compareClearBtn = document.getElementById("compareClearBtn");
const compareModal = document.getElementById("compareModal");
const compareModalClose = document.getElementById("compareModalClose");
const compareTable = document.getElementById("compareTable");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
    charted: new Map(),   // neo_reference_id -> { data, wx, wy, r, hazardous, dateMs }
    total: null,
    camera: { x: 0, y: 0, zoom: 1 },
    flyTo: null,
    dragging: false,
    lastMouse: { x: 0, y: 0 },
    dragged: false,
    hoveredId: null,
    selectedId: null,
    clusters: [],
    timeline: { minMs: null, maxMs: null, playheadMs: null, playing: false },
    compareIds: new Set(),
    lbCategory: "biggest",
};

let tooltipEl = null;

// ---------------------------------------------------------------
// Deterministic layout: same asteroid always lands in the same spot
// ---------------------------------------------------------------
function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295; // normalize to [0,1)
}

function layoutFor(asteroid) {
    const idHash = hashString(asteroid.neo_reference_id);
    const angle = idHash * Math.PI * 2;
    const jitter = hashString(asteroid.neo_reference_id + "jitter");

    const missDistance = Math.max(asteroid.miss_distance_km, 1);
    const ring = 90 + Math.log10(missDistance + 1) * 45 + (jitter - 0.5) * 30;

    const wx = Math.cos(angle) * ring;
    const wy = Math.sin(angle) * ring;

    const diameterM = Math.max(asteroid.estimated_diameter_km, 0.0005) * 1000;
    const r = clamp(1.4 + Math.log10(diameterM + 1) * 1.15, 1.4, 9);

    return { wx, wy, r };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ---------------------------------------------------------------
// Canvas sizing
// ---------------------------------------------------------------
let dpr = Math.max(1, window.devicePixelRatio || 1);

function resizeCanvas() {
    const rect = viewportWrap.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ---------------------------------------------------------------
// World <-> screen transforms
// ---------------------------------------------------------------
function worldToScreen(wx, wy) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    return {
        x: cx + (wx - state.camera.x) * state.camera.zoom * dpr,
        y: cy + (wy - state.camera.y) * state.camera.zoom * dpr,
    };
}

function screenToWorld(sx, sy) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    return {
        wx: state.camera.x + (sx * dpr - cx) / (state.camera.zoom * dpr),
        wy: state.camera.y + (sy * dpr - cy) / (state.camera.zoom * dpr),
    };
}

// ---------------------------------------------------------------
// Timeline: reveal state per point
// ---------------------------------------------------------------
function isRevealed(point) {
    if (state.timeline.playheadMs == null) return true;
    return point.dateMs <= state.timeline.playheadMs;
}

function updateTimelineRange() {
    let min = Infinity, max = -Infinity;
    for (const p of state.charted.values()) {
        if (p.dateMs < min) min = p.dateMs;
        if (p.dateMs > max) max = p.dateMs;
    }
    if (!isFinite(min)) return;

    const wasAtMax = state.timeline.maxMs == null || state.timeline.playheadMs >= state.timeline.maxMs - 1;
    state.timeline.minMs = min;
    state.timeline.maxMs = max;
    if (wasAtMax || state.timeline.playheadMs == null) {
        state.timeline.playheadMs = max;
    }
    timelineBar.hidden = state.charted.size === 0;
    syncTimelineUI();
}

function syncTimelineUI() {
    const { minMs, maxMs, playheadMs } = state.timeline;
    if (minMs == null) return;
    const span = Math.max(maxMs - minMs, 1);
    const pct = clamp(((playheadMs - minMs) / span) * 1000, 0, 1000);
    timelineRange.value = String(Math.round(pct));
    const d = new Date(playheadMs);
    timelineLabel.textContent = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

timelineRange.addEventListener("input", () => {
    state.timeline.playing = false;
    timelinePlay.textContent = "▶";
    const { minMs, maxMs } = state.timeline;
    if (minMs == null) return;
    const pct = Number(timelineRange.value) / 1000;
    state.timeline.playheadMs = minMs + pct * (maxMs - minMs);
    syncTimelineUI();
});

timelinePlay.addEventListener("click", () => {
    if (state.timeline.minMs == null) return;
    if (state.timeline.playheadMs >= state.timeline.maxMs - 1) {
        state.timeline.playheadMs = state.timeline.minMs;
    }
    state.timeline.playing = !state.timeline.playing;
    timelinePlay.textContent = state.timeline.playing ? "⏸" : "▶";
});

timelineReset.addEventListener("click", () => {
    state.timeline.playing = false;
    timelinePlay.textContent = "▶";
    state.timeline.playheadMs = state.timeline.maxMs;
    syncTimelineUI();
});

const PLAY_DURATION_SEC = 14;
function updateTimelinePlayback(dt) {
    if (!state.timeline.playing || state.timeline.minMs == null) return;
    const span = state.timeline.maxMs - state.timeline.minMs;
    state.timeline.playheadMs += (span / PLAY_DURATION_SEC) * dt;
    if (state.timeline.playheadMs >= state.timeline.maxMs) {
        state.timeline.playheadMs = state.timeline.maxMs;
        state.timeline.playing = false;
        timelinePlay.textContent = "▶";
    }
    syncTimelineUI();
}

// ---------------------------------------------------------------
// Constellations: cluster nearby charted points, connect with an MST,
// and give each cluster a generated name.
// ---------------------------------------------------------------
const CLUSTER_THRESHOLD = 16;
const NAME_A = ["Vel", "Drac", "Lyr", "Corv", "Aurig", "Cassi", "Hydr", "Ori", "Cygn", "Pav", "Ind", "Phoen", "Scorp", "Andro", "Pers", "Taur", "Lep", "Coron", "Sagitt", "Del"];
const NAME_B = ["is", "onis", "ae", "um", "ara", "ion", "eus", "andra", "ora", "ix"];
const NAME_C = ["Minor", "Prime", "Nova", "Ultima", "Borealis", "Australis", "Reach", "Drift", "Span", "Cluster"];

function clusterName(ids) {
    const key = ids.slice().sort().join("|");
    const h1 = hashString(key);
    const h2 = hashString(key + "b");
    const h3 = hashString(key + "c");
    const a = NAME_A[Math.floor(h1 * NAME_A.length)];
    const b = NAME_B[Math.floor(h2 * NAME_B.length)];
    const c = NAME_C[Math.floor(h3 * NAME_C.length)];
    return `${a}${b} ${c}`;
}

function computeClusters() {
    const points = [...state.charted.values()];
    const parent = new Map(points.map(p => [p.data.neo_reference_id, p.data.neo_reference_id]));
    function find(id) {
        while (parent.get(id) !== id) {
            parent.set(id, parent.get(parent.get(id)));
            id = parent.get(id);
        }
        return id;
    }
    function union(a, b) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    }

    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const dx = points[i].wx - points[j].wx;
            const dy = points[i].wy - points[j].wy;
            if (dx * dx + dy * dy <= CLUSTER_THRESHOLD * CLUSTER_THRESHOLD) {
                union(points[i].data.neo_reference_id, points[j].data.neo_reference_id);
            }
        }
    }

    const groups = new Map();
    for (const p of points) {
        const root = find(p.data.neo_reference_id);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(p);
    }

    const clusters = [];
    for (const members of groups.values()) {
        if (members.length < 3) continue;
        const ids = members.map(m => m.data.neo_reference_id);
        const edges = mst(members);
        const cx = members.reduce((s, m) => s + m.wx, 0) / members.length;
        const cy = members.reduce((s, m) => s + m.wy, 0) / members.length;
        clusters.push({ ids, members, edges, centroid: { wx: cx, wy: cy }, name: clusterName(ids) });
    }
    state.clusters = clusters;
    clusterCountEl.textContent = String(clusters.length);
}

function mst(members) {
    const n = members.length;
    const inTree = new Array(n).fill(false);
    const dist = new Array(n).fill(Infinity);
    const parent = new Array(n).fill(-1);
    dist[0] = 0;
    const edges = [];
    for (let iter = 0; iter < n; iter++) {
        let u = -1, best = Infinity;
        for (let i = 0; i < n; i++) {
            if (!inTree[i] && dist[i] < best) { best = dist[i]; u = i; }
        }
        if (u === -1) break;
        inTree[u] = true;
        if (parent[u] !== -1) edges.push([parent[u], u]);
        for (let v = 0; v < n; v++) {
            if (inTree[v]) continue;
            const dx = members[u].wx - members[v].wx;
            const dy = members[u].wy - members[v].wy;
            const d = dx * dx + dy * dy;
            if (d < dist[v]) { dist[v] = d; parent[v] = u; }
        }
    }
    return edges;
}

function drawConstellations(time) {
    for (const cluster of state.clusters) {
        const visibleIdx = new Set();
        cluster.members.forEach((m, i) => { if (isRevealed(m)) visibleIdx.add(i); });
        if (visibleIdx.size < 2) continue;

        ctx.save();
        ctx.strokeStyle = "rgba(179,167,255,0.65)";
        ctx.lineWidth = Math.max(1.4, 1.4 * dpr);
        ctx.shadowColor = "rgba(139,124,246,0.9)";
        ctx.shadowBlur = 4 * dpr;
        ctx.lineCap = "round";
        for (const [a, b] of cluster.edges) {
            if (!visibleIdx.has(a) || !visibleIdx.has(b)) continue;
            const ma = cluster.members[a], mb = cluster.members[b];
            // Only draw where the two stars have real daylight between them in
            // world space (overlap is zoom-invariant, so this must be checked
            // in world units, not screen pixels) — otherwise the line would be
            // fully hidden under the point markers at every zoom level anyway.
            const worldDist = Math.hypot(ma.wx - mb.wx, ma.wy - mb.wy);
            if (worldDist <= ma.r + mb.r + 1.5) continue;

            const pa = worldToScreen(ma.wx, ma.wy);
            const pb = worldToScreen(mb.wx, mb.wy);
            const ra = Math.max(1.2, ma.r * state.camera.zoom * dpr);
            const rb = Math.max(1.2, mb.r * state.camera.zoom * dpr);
            const dx = pb.x - pa.x, dy = pb.y - pa.y;
            const dist = Math.hypot(dx, dy) || 1;
            const ux = dx / dist, uy = dy / dist;
            ctx.beginPath();
            ctx.moveTo(pa.x + ux * ra, pa.y + uy * ra);
            ctx.lineTo(pb.x - ux * rb, pb.y - uy * rb);
            ctx.stroke();
        }
        ctx.restore();

        if (visibleIdx.size < 3) continue;
        const s = worldToScreen(cluster.centroid.wx, cluster.centroid.wy);
        const twinkle = reduceMotion ? 0.5 : 0.4 + Math.sin(time / 1400 + cluster.centroid.wx) * 0.15;
        ctx.font = `${Math.max(10, 11 * dpr)}px 'IBM Plex Mono', monospace`;
        ctx.fillStyle = `rgba(179,167,255,${clamp(twinkle, 0.2, 0.6)})`;
        ctx.textAlign = "center";
        ctx.fillText(cluster.name.toUpperCase(), s.x, s.y);
        ctx.textAlign = "left";
    }
}

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------
let lastFrame = performance.now();

function render(time) {
    const dt = Math.min((time - lastFrame) / 1000, 0.05);
    lastFrame = time;
    updateTimelinePlayback(dt);
    if (state.flyTo) applyFlyTo(time);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawOriginRings();
    drawEarthMarker();
    drawConstellations(time);

    const margin = 40 * dpr;
    for (const point of state.charted.values()) {
        if (!isRevealed(point)) continue;
        const s = worldToScreen(point.wx, point.wy);
        if (s.x < -margin || s.x > canvas.width + margin ||
            s.y < -margin || s.y > canvas.height + margin) continue;

        const screenR = Math.max(1.2, point.r * state.camera.zoom * dpr);
        drawPoint(s.x, s.y, screenR, point, time);
    }

    requestAnimationFrame(render);
}

function drawOriginRings() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.strokeStyle = "rgba(139,124,246,0.10)";
    ctx.lineWidth = 1;
    const ringsWorld = [100, 250, 500, 900];
    for (const rw of ringsWorld) {
        const screenR = rw * state.camera.zoom * dpr;
        if (screenR < 4 || screenR > Math.max(canvas.width, canvas.height)) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, screenR, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawEarthMarker() {
    const s = worldToScreen(0, 0);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = "#f4f2ff";
    ctx.shadowColor = "#8b7cf6";
    ctx.shadowBlur = 12 * dpr;
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawPoint(x, y, r, point, time) {
    const id = point.data.neo_reference_id;
    const isHovered = id === state.hoveredId;
    const isSelected = id === state.selectedId;
    const isComparing = state.compareIds.has(id);
    const baseColor = point.hazardous ? "#f5426c" : "#8b7cf6";
    const glowColor = point.hazardous ? "#ff7d9b" : "#b3a7ff";

    const bornAgo = state.timeline.playheadMs - point.dateMs;
    const isNewborn = !reduceMotion && bornAgo >= 0 && bornAgo < 900;
    const twinkle = reduceMotion ? 1 : 0.85 + Math.sin(time / 900 + point.wx) * 0.15;
    const bornScale = isNewborn ? 1 + (1 - bornAgo / 900) * 1.8 : 1;

    ctx.beginPath();
    ctx.arc(x, y, r * (isHovered || isSelected ? 1.5 : 1) * bornScale, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = (isHovered || isSelected ? 16 : (isNewborn ? 22 : 8)) * twinkle * dpr;
    ctx.globalAlpha = twinkle;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    if (isComparing) {
        ctx.beginPath();
        ctx.arc(x, y, r * 2, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffd27d";
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

requestAnimationFrame(render);

// ---------------------------------------------------------------
// Fly-to camera animation
// ---------------------------------------------------------------
function flyToBounds(points) {
    if (points.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.wx); maxX = Math.max(maxX, p.wx);
        minY = Math.min(minY, p.wy); maxY = Math.max(maxY, p.wy);
    }
    const rangeX = Math.max(maxX - minX, 40);
    const rangeY = Math.max(maxY - minY, 40);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const rect = viewportWrap.getBoundingClientRect();
    const zoomX = (rect.width * 0.7) / rangeX;
    const zoomY = (rect.height * 0.7) / rangeY;
    const targetZoom = clamp(Math.min(zoomX, zoomY), 0.15, 3);

    state.flyTo = {
        fromX: state.camera.x, fromY: state.camera.y, fromZoom: state.camera.zoom,
        toX: cx, toY: cy, toZoom: targetZoom,
        start: performance.now(), duration: reduceMotion ? 1 : 600,
    };
}

function applyFlyTo(time) {
    const f = state.flyTo;
    const t = clamp((time - f.start) / f.duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    state.camera.x = f.fromX + (f.toX - f.fromX) * eased;
    state.camera.y = f.fromY + (f.toY - f.fromY) * eased;
    state.camera.zoom = f.fromZoom + (f.toZoom - f.fromZoom) * eased;
    if (t >= 1) state.flyTo = null;
}

// ---------------------------------------------------------------
// Pan / zoom / hover / click — Pointer Events (mouse, touch, pen)
// ---------------------------------------------------------------
canvas.style.touchAction = "none";
const activePointers = new Map(); // pointerId -> {x, y}
let pinchStartDist = 0;
let pinchStartZoom = 1;

canvas.addEventListener("pointerdown", (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore: pointer already inactive */ }
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 1) {
        state.dragging = true;
        state.dragged = false;
        state.lastMouse = { x: e.clientX, y: e.clientY };
        canvas.classList.add("dragging");
    } else if (activePointers.size === 2) {
        const pts = [...activePointers.values()];
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinchStartZoom = state.camera.zoom;
        state.dragged = true;
    }
});

window.addEventListener("pointermove", (e) => {
    if (!activePointers.has(e.pointerId)) {
        if (e.pointerType !== "touch") hitTestHover(e);
        return;
    }
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
        const pts = [...activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        if (pinchStartDist > 0) {
            const rect = canvas.getBoundingClientRect();
            const before = screenToWorld(midX - rect.left, midY - rect.top);
            state.camera.zoom = clamp(pinchStartZoom * (dist / pinchStartDist), 0.08, 8);
            const after = screenToWorld(midX - rect.left, midY - rect.top);
            state.camera.x += before.wx - after.wx;
            state.camera.y += before.wy - after.wy;
        }
    } else if (state.dragging) {
        const dx = e.clientX - state.lastMouse.x;
        const dy = e.clientY - state.lastMouse.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) state.dragged = true;
        state.camera.x -= dx / state.camera.zoom;
        state.camera.y -= dy / state.camera.zoom;
        state.lastMouse = { x: e.clientX, y: e.clientY };
    } else if (e.pointerType !== "touch") {
        hitTestHover(e);
    }
});

function endPointer(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size === 0) {
        state.dragging = false;
        canvas.classList.remove("dragging");
    } else if (activePointers.size === 1) {
        const [remaining] = activePointers.values();
        state.dragging = true;
        state.dragged = true;
        state.lastMouse = { x: remaining.x, y: remaining.y };
    }
}
window.addEventListener("pointerup", endPointer);
window.addEventListener("pointercancel", endPointer);

canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const before = screenToWorld(mouseX, mouseY);

    const factor = Math.exp(-e.deltaY * 0.001);
    state.camera.zoom = clamp(state.camera.zoom * factor, 0.08, 8);

    const after = screenToWorld(mouseX, mouseY);
    state.camera.x += before.wx - after.wx;
    state.camera.y += before.wy - after.wy;
}, { passive: false });

canvas.addEventListener("click", (e) => {
    if (state.dragged) return;
    const hit = pointAtScreen(e);
    if (hit) openDetail(hit.data);
});

function hitTestHover(e) {
    const hit = pointAtScreen(e);
    state.hoveredId = hit ? hit.data.neo_reference_id : null;
    canvas.style.cursor = hit ? "pointer" : "grab";
    updateTooltip(hit, e);
}

function pointAtScreen(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left);
    const sy = (e.clientY - rect.top);
    let closest = null;
    let closestDist = Infinity;
    for (const point of state.charted.values()) {
        if (!isRevealed(point)) continue;
        const s = worldToScreen(point.wx, point.wy);
        const screenX = s.x / dpr, screenY = s.y / dpr;
        const screenR = Math.max(4, point.r * state.camera.zoom) + 3;
        const d = Math.hypot(sx - screenX, sy - screenY);
        if (d <= screenR && d < closestDist) {
            closest = point;
            closestDist = d;
        }
    }
    return closest;
}

function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.style.position = "fixed";
    tooltipEl.style.pointerEvents = "none";
    tooltipEl.style.padding = "6px 10px";
    tooltipEl.style.borderRadius = "6px";
    tooltipEl.style.background = "rgba(10,6,32,0.92)";
    tooltipEl.style.border = "1px solid rgba(139,124,246,0.35)";
    tooltipEl.style.color = "#f4f2ff";
    tooltipEl.style.fontFamily = "'IBM Plex Mono', monospace";
    tooltipEl.style.fontSize = "0.72rem";
    tooltipEl.style.zIndex = "6";
    tooltipEl.style.display = "none";
    document.body.appendChild(tooltipEl);
    return tooltipEl;
}

function updateTooltip(hit, e) {
    const el = ensureTooltip();
    if (!hit) { el.style.display = "none"; return; }
    el.style.display = "block";
    el.style.left = (e.clientX + 14) + "px";
    el.style.top = (e.clientY + 14) + "px";
    const d = hit.data;
    el.innerHTML = `<strong>${escapeHtml(d.name)}</strong><br>` +
        `${d.estimated_diameter_km.toFixed(3)} km · ${Math.round(d.relative_velocity_km_h).toLocaleString()} km/h` +
        (d.is_potentially_hazardous ? ` · <span style="color:#ff7d9b">hazardous</span>` : ``);
}

// ---------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------
function openDetail(d) {
    state.selectedId = d.neo_reference_id;
    detailPanel.hidden = false;
    detailBody.innerHTML = `
        <p class="detail-name">${escapeHtml(d.name)}</p>
        <p class="detail-id">${escapeHtml(d.neo_reference_id)}</p>
        <span class="detail-badge ${d.is_potentially_hazardous ? "hazardous" : "nominal"}">
            ${d.is_potentially_hazardous ? "hazardous" : "nominal"}
        </span>
        <div class="detail-grid">
            <div class="detail-metric">
                <div class="detail-metric-label">Diameter</div>
                <div class="detail-metric-value">${d.estimated_diameter_km.toFixed(3)} km</div>
            </div>
            <div class="detail-metric">
                <div class="detail-metric-label">Velocity</div>
                <div class="detail-metric-value">${Math.round(d.relative_velocity_km_h).toLocaleString()} km/h</div>
            </div>
            <div class="detail-metric">
                <div class="detail-metric-label">Miss distance</div>
                <div class="detail-metric-value">${Math.round(d.miss_distance_km).toLocaleString()} km</div>
            </div>
            <div class="detail-metric">
                <div class="detail-metric-label">Close approach</div>
                <div class="detail-metric-value">${escapeHtml(d.close_approach_date)}</div>
            </div>
            <div class="detail-metric">
                <div class="detail-metric-label">Abs. magnitude</div>
                <div class="detail-metric-value">${d.absolute_magnitude}</div>
            </div>
        </div>
    `;
    syncDetailCompareBtn();
}

function syncDetailCompareBtn() {
    if (!state.selectedId) return;
    const inCompare = state.compareIds.has(state.selectedId);
    detailCompareBtn.textContent = inCompare ? "✓ In compare — remove" : "+ Add to compare";
    detailCompareBtn.classList.toggle("active", inCompare);
}

detailCompareBtn.addEventListener("click", () => {
    if (!state.selectedId) return;
    toggleCompare(state.selectedId);
    syncDetailCompareBtn();
});

detailClose.addEventListener("click", () => {
    detailPanel.hidden = true;
    state.selectedId = null;
});

// ---------------------------------------------------------------
// Compare tray + modal
// ---------------------------------------------------------------
const MAX_COMPARE = 4;

function toggleCompare(id) {
    if (state.compareIds.has(id)) {
        state.compareIds.delete(id);
    } else {
        if (state.compareIds.size >= MAX_COMPARE) return;
        state.compareIds.add(id);
    }
    renderCompareTray();
}

function renderCompareTray() {
    compareTray.hidden = state.compareIds.size === 0;
    compareTrayChips.innerHTML = [...state.compareIds].map(id => {
        const p = state.charted.get(id);
        if (!p) return "";
        return `<span class="compare-chip" data-id="${escapeAttr(id)}">${escapeHtml(p.data.name)} <b>&times;</b></span>`;
    }).join("");
    compareTrayChips.querySelectorAll(".compare-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            toggleCompare(chip.getAttribute("data-id"));
            syncDetailCompareBtn();
        });
    });
    compareOpenBtn.textContent = `Compare (${state.compareIds.size})`;
}

compareClearBtn.addEventListener("click", () => {
    state.compareIds.clear();
    renderCompareTray();
    syncDetailCompareBtn();
});

compareOpenBtn.addEventListener("click", () => {
    if (state.compareIds.size === 0) return;
    const items = [...state.compareIds].map(id => state.charted.get(id)).filter(Boolean);
    const rows = [
        ["Name", p => p.data.name],
        ["Status", p => p.data.is_potentially_hazardous ? "hazardous" : "nominal"],
        ["Diameter", p => `${p.data.estimated_diameter_km.toFixed(3)} km`],
        ["Velocity", p => `${Math.round(p.data.relative_velocity_km_h).toLocaleString()} km/h`],
        ["Miss distance", p => `${Math.round(p.data.miss_distance_km).toLocaleString()} km`],
        ["Close approach", p => p.data.close_approach_date],
        ["Abs. magnitude", p => String(p.data.absolute_magnitude)],
    ];
    let html = `<table><thead><tr><th></th>${items.map(p => `<th>${escapeHtml(p.data.name)}<button class="compare-remove" data-id="${escapeAttr(p.data.neo_reference_id)}">&times;</button></th>`).join("")}</tr></thead><tbody>`;
    for (const [label, fn] of rows) {
        html += `<tr><td>${label}</td>${items.map(p => `<td class="${p.hazardous && label === "Status" ? "hz" : ""}">${escapeHtml(fn(p))}</td>`).join("")}</tr>`;
    }
    html += `</tbody></table>`;
    compareTable.innerHTML = html;
    compareTable.querySelectorAll(".compare-remove").forEach(btn => {
        btn.addEventListener("click", () => {
            toggleCompare(btn.getAttribute("data-id"));
            syncDetailCompareBtn();
            if (state.compareIds.size === 0) { compareModal.hidden = true; return; }
            compareOpenBtn.click();
        });
    });
    compareModal.hidden = false;
});

compareModalClose.addEventListener("click", () => { compareModal.hidden = true; });
compareModal.addEventListener("click", (e) => { if (e.target === compareModal) compareModal.hidden = true; });

// ---------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------
function renderLeaderboard() {
    const points = [...state.charted.values()];
    let sorted;
    if (state.lbCategory === "biggest") {
        sorted = points.slice().sort((a, b) => b.data.estimated_diameter_km - a.data.estimated_diameter_km);
    } else if (state.lbCategory === "fastest") {
        sorted = points.slice().sort((a, b) => b.data.relative_velocity_km_h - a.data.relative_velocity_km_h);
    } else if (state.lbCategory === "closest") {
        sorted = points.slice().sort((a, b) => a.data.miss_distance_km - b.data.miss_distance_km);
    } else {
        sorted = points.filter(p => p.hazardous).sort((a, b) => b.data.estimated_diameter_km - a.data.estimated_diameter_km);
    }
    sorted = sorted.slice(0, 15);

    const valueFor = (p) => {
        if (state.lbCategory === "biggest" || state.lbCategory === "hazard") return `${p.data.estimated_diameter_km.toFixed(3)} km`;
        if (state.lbCategory === "fastest") return `${Math.round(p.data.relative_velocity_km_h).toLocaleString()} km/h`;
        return `${Math.round(p.data.miss_distance_km).toLocaleString()} km`;
    };

    lbList.innerHTML = sorted.map((p, i) => `
        <li data-id="${escapeAttr(p.data.neo_reference_id)}">
            <span class="lb-rank">${i + 1}</span>
            <span class="lb-name">${escapeHtml(p.data.name)}${p.hazardous ? ` <span class="lb-hz">hazardous</span>` : ""}</span>
            <span class="lb-value">${valueFor(p)}</span>
        </li>
    `).join("") || `<li class="lb-empty">Nothing charted yet.</li>`;

    lbList.querySelectorAll("li[data-id]").forEach(li => {
        li.addEventListener("click", () => {
            const p = state.charted.get(li.getAttribute("data-id"));
            if (!p) return;
            flyToBounds([{ wx: p.wx, wy: p.wy }]);
            openDetail(p.data);
            leaderboardPanel.hidden = true;
        });
    });
}

leaderboardBtn.addEventListener("click", () => {
    renderLeaderboard();
    leaderboardPanel.hidden = false;
});
leaderboardClose.addEventListener("click", () => { leaderboardPanel.hidden = true; });
lbTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        lbTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        state.lbCategory = tab.getAttribute("data-cat");
        renderLeaderboard();
    });
});

// ---------------------------------------------------------------
// Charting (data fetch + merge)
// ---------------------------------------------------------------
function chart(asteroids) {
    const fresh = [];
    for (const a of asteroids) {
        if (state.charted.has(a.neo_reference_id)) continue;
        const { wx, wy, r } = layoutFor(a);
        const dateMs = Date.parse(a.close_approach_date);
        const point = { data: a, wx, wy, r, hazardous: a.is_potentially_hazardous, dateMs: isFinite(dateMs) ? dateMs : Date.now() };
        state.charted.set(a.neo_reference_id, point);
        fresh.push(point);
    }
    chartedCountEl.textContent = state.charted.size.toLocaleString();
    computeClusters();
    updateTimelineRange();
    return fresh;
}

async function fetchAsteroids(url) {
    setLoading(true);
    emptyState.hidden = true;
    try {
        const response = await fetch(url, { headers: API_HEADERS });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const list = data.asteroids || [];
        if (typeof data.total === "number") {
            state.total = data.total;
            totalCountEl.textContent = state.total.toLocaleString();
        }
        if (list.length === 0) {
            emptyState.hidden = false;
            return;
        }
        const fresh = chart(list);
        flyToBounds(fresh.length ? fresh.map(p => ({ wx: p.wx, wy: p.wy })) : list.map(a => layoutFor(a)));
    } catch (err) {
        emptyState.hidden = false;
        emptyState.textContent = "Could not reach the AegisNEO API. Check your connection and try again.";
        console.error(err);
    } finally {
        setLoading(false);
    }
}

function setLoading(isLoading) {
    loadingState.hidden = !isLoading;
}

searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    fetchAsteroids(`${API_URL}/api/v1/asteroids?search=${encodeURIComponent(q)}`);
});

loadDefaultBtn.addEventListener("click", () => {
    fetchAsteroids(`${API_URL}/api/v1/asteroids`);
});

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}
function escapeAttr(str) {
    return String(str).replace(/"/g, "&quot;");
}

async function init() {
    fetchAsteroids(`${API_URL}/api/v1/asteroids`);
}

init();
