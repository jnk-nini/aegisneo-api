// Constellation Explorer — a persistent, pannable/zoomable star map of NEOs
// charted from the AegisNEO API. The API caps every response at 100 objects
// (search or default), so instead of pretending to show the full 33.5k-object
// field at once, each search "charts" its up to-100 results onto a shared,
// deduplicated map that grows across the session.

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
const emptyState = document.getElementById("emptyState");
const loadingState = document.getElementById("loadingState");
const detailPanel = document.getElementById("detailPanel");
const detailBody = document.getElementById("detailBody");
const detailClose = document.getElementById("detailClose");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
    charted: new Map(),   // neo_reference_id -> { data, wx, wy, r, hazardous }
    total: null,
    camera: { x: 0, y: 0, zoom: 1 },
    flyTo: null,          // { fromX, fromY, fromZoom, toX, toY, toZoom, start, duration }
    dragging: false,
    lastMouse: { x: 0, y: 0 },
    dragged: false,
    hoveredId: null,
    selectedId: null,
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
    const r = clamp(2.5 + Math.log10(diameterM + 1) * 2.2, 2.5, 20);

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
// Rendering
// ---------------------------------------------------------------
function render(time) {
    if (state.flyTo) applyFlyTo(time);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawOriginRings();
    drawEarthMarker();

    const margin = 40 * dpr;
    for (const point of state.charted.values()) {
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
    const isHovered = point.data.neo_reference_id === state.hoveredId;
    const isSelected = point.data.neo_reference_id === state.selectedId;
    const baseColor = point.hazardous ? "#f5426c" : "#8b7cf6";
    const glowColor = point.hazardous ? "#ff7d9b" : "#b3a7ff";

    const twinkle = reduceMotion ? 1 : 0.85 + Math.sin(time / 900 + point.wx) * 0.15;

    ctx.beginPath();
    ctx.arc(x, y, r * (isHovered || isSelected ? 1.5 : 1), 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = (isHovered || isSelected ? 16 : 8) * twinkle * dpr;
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
// Pan / zoom / hover / click
// ---------------------------------------------------------------
canvas.addEventListener("mousedown", (e) => {
    state.dragging = true;
    state.dragged = false;
    state.lastMouse = { x: e.clientX, y: e.clientY };
    canvas.classList.add("dragging");
});

window.addEventListener("mousemove", (e) => {
    if (state.dragging) {
        const dx = e.clientX - state.lastMouse.x;
        const dy = e.clientY - state.lastMouse.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) state.dragged = true;
        state.camera.x -= (dx * dpr) / (state.camera.zoom * dpr);
        state.camera.y -= (dy * dpr) / (state.camera.zoom * dpr);
        state.lastMouse = { x: e.clientX, y: e.clientY };
    } else {
        hitTestHover(e);
    }
});

window.addEventListener("mouseup", () => {
    state.dragging = false;
    canvas.classList.remove("dragging");
});

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
}

detailClose.addEventListener("click", () => {
    detailPanel.hidden = true;
    state.selectedId = null;
});

// ---------------------------------------------------------------
// Charting (data fetch + merge)
// ---------------------------------------------------------------
function chart(asteroids) {
    const fresh = [];
    for (const a of asteroids) {
        if (state.charted.has(a.neo_reference_id)) continue;
        const { wx, wy, r } = layoutFor(a);
        const point = { data: a, wx, wy, r, hazardous: a.is_potentially_hazardous };
        state.charted.set(a.neo_reference_id, point);
        fresh.push(point);
    }
    chartedCountEl.textContent = state.charted.size.toLocaleString();
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

async function init() {
    try {
        const response = await fetch(`${API_URL}/`);
        const data = await response.json();
        if (typeof data.total_tracked === "number") {
            state.total = data.total_tracked;
            totalCountEl.textContent = state.total.toLocaleString();
        }
    } catch (err) {
        console.error("Could not fetch field total:", err);
    }
    fetchAsteroids(`${API_URL}/api/v1/asteroids`);
}

init();
