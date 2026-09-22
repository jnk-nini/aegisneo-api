// Impact Simulator — pick a real NEO, choose a point on the tactical targeting
// grid, and see a simplified educational estimate of the energy release and
// blast radii. Physics is intentionally simplified (assumed density, cube-root
// blast scaling) — see the on-page disclaimer. Not a scientific hazard model.

const API_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://127.0.0.1:8000"
    : "https://aegisneo-api.vercel.app";

// Matches the backend's API_KEY in index.py (student-project scale auth, not production-grade).
const API_KEY = "student-api-key-123";
const API_HEADERS = { "x-api-key": API_KEY };

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const surpriseBtn = document.getElementById("surpriseBtn");
const resultsList = document.getElementById("resultsList");
const targetCard = document.getElementById("targetCard");
const targetName = document.getElementById("targetName");
const targetBadge = document.getElementById("targetBadge");
const statDiameter = document.getElementById("statDiameter");
const statVelocity = document.getElementById("statVelocity");
const statMagnitude = document.getElementById("statMagnitude");
const readout = document.getElementById("readout");
const outEnergy = document.getElementById("outEnergy");
const outTnt = document.getElementById("outTnt");
const outSevere = document.getElementById("outSevere");
const outModerate = document.getElementById("outModerate");
const outCompare = document.getElementById("outCompare");
const mapHint = document.getElementById("mapHint");
const loadingState = document.getElementById("loadingState");
const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");

const state = {
    selected: null,
    target: null,      // { x, y } in CSS pixels
    defaultBatch: null, // cached for "surprise me"
};

const KM_PER_CELL = 200;
const CELL_PX = 40;
const KM_PER_PX = KM_PER_CELL / CELL_PX;

let dpr = Math.max(1, window.devicePixelRatio || 1);

// ---------------------------------------------------------------
// Canvas setup
// ---------------------------------------------------------------
function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
}
window.addEventListener("resize", resizeCanvas);

// Redraw continuously via rAF (rather than one-shot calls from event handlers)
// so the canvas is always freshly composited, not just updated in the JS-side
// bitmap between paint cycles.
function loop() {
    render();
    requestAnimationFrame(loop);
}

function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.fillStyle = "#0d0705";
    ctx.fillRect(0, 0, w, h);

    drawGrid(w, h);
    if (state.target) drawTarget(w, h);

    ctx.restore();
}

function drawGrid(w, h) {
    ctx.strokeStyle = "rgba(255,77,46,0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += CELL_PX) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
    }
    for (let y = 0; y <= h; y += CELL_PX) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
    }
    // center crosshair (reference origin)
    ctx.strokeStyle = "rgba(255,176,32,0.35)";
    ctx.beginPath();
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(169,154,140,0.6)";
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.fillText(`grid scale: 1 cell ≈ ${KM_PER_CELL} km`, 12, h - 14);
}

function drawTarget(w, h) {
    const { x, y } = state.target;

    // crosshair
    ctx.strokeStyle = "#ff4d2e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y);
    ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4d2e";
    ctx.fill();

    if (!state.selected) return;

    const impact = computeImpact(state.selected);
    const severePx = impact.severeKm / KM_PER_PX;
    const moderatePx = impact.moderateKm / KM_PER_PX;

    drawRing(x, y, moderatePx, "rgba(255,176,32,0.85)", `${fmt(impact.moderateKm)} km`);
    drawRing(x, y, severePx, "rgba(255,77,46,0.95)", `${fmt(impact.severeKm)} km`);
}

function drawRing(cx, cy, r, color, label) {
    if (r < 1) return;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.fillText(label, cx + r * 0.7, cy - r * 0.7);
}

function fmt(n) {
    if (n >= 1000) return Math.round(n).toLocaleString();
    if (n >= 10) return n.toFixed(0);
    return n.toFixed(1);
}

canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    state.target = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    mapHint.hidden = true;
    if (state.selected) updateReadout();
});

// ---------------------------------------------------------------
// Physics — simplified educational model
// ---------------------------------------------------------------
const ASSUMED_DENSITY_KG_M3 = 3000; // typical rocky NEO
const JOULES_PER_MEGATON_TNT = 4.184e15;

function computeImpact(a) {
    const radiusM = (a.estimated_diameter_km * 1000) / 2;
    const volumeM3 = (4 / 3) * Math.PI * Math.pow(radiusM, 3);
    const massKg = ASSUMED_DENSITY_KG_M3 * volumeM3;
    const velocityMs = (a.relative_velocity_km_h * 1000) / 3600;
    const energyJoules = 0.5 * massKg * Math.pow(velocityMs, 2);
    const megatons = energyJoules / JOULES_PER_MEGATON_TNT;

    // Simplified cube-root blast scaling (illustrative constants, not derived
    // from a peer-reviewed impact model).
    const severeKm = Math.min(2 * Math.cbrt(megatons), 6000);
    const moderateKm = Math.min(5 * Math.cbrt(megatons), 12000);

    return { energyJoules, megatons, severeKm, moderateKm };
}

function comparisonFor(megatons) {
    if (megatons < 0.001) return "Similar in scale to a small conventional bomb — likely to burn up or airburst with only local effects.";
    if (megatons < 1) return "In the range of the Chelyabinsk 2013 airburst (~0.5 megatons) — a bright fireball and shockwave, but sub-regional damage.";
    if (megatons < 50) return "In the range of the largest nuclear weapons ever tested — regional devastation near the impact point.";
    if (megatons < 100000) return "Comparable to the Tunguska event scaled up significantly — continent-scale fires and shockwave damage.";
    return "Chicxulub-scale or beyond — the kind of impact associated with mass extinction events.";
}

function updateReadout() {
    const impact = computeImpact(state.selected);
    readout.hidden = false;
    outEnergy.textContent = `${impact.energyJoules.toExponential(2)} J`;
    outTnt.textContent = `${fmt(impact.megatons)} megatons`;
    outSevere.textContent = `${fmt(impact.severeKm)} km`;
    outModerate.textContent = `${fmt(impact.moderateKm)} km`;
    outCompare.textContent = comparisonFor(impact.megatons);
}

// ---------------------------------------------------------------
// Search / selection
// ---------------------------------------------------------------
async function searchAsteroids(query) {
    setLoading(true);
    try {
        const response = await fetch(`${API_URL}/api/v1/asteroids?search=${encodeURIComponent(query)}`, { headers: API_HEADERS });
        const data = await response.json();
        renderResults(data.asteroids || []);
    } catch (err) {
        console.error(err);
        renderResults([]);
    } finally {
        setLoading(false);
    }
}

function renderResults(list) {
    if (list.length === 0) {
        resultsList.hidden = false;
        resultsList.innerHTML = `<div class="result-item">No matches found.</div>`;
        return;
    }
    resultsList.hidden = false;
    resultsList.innerHTML = list.slice(0, 30).map(a => `
        <div class="result-item" data-id="${escapeAttr(a.neo_reference_id)}">
            <span>${escapeHtml(a.name)}</span>
            ${a.is_potentially_hazardous ? `<span class="r-hazard">hazardous</span>` : ``}
        </div>
    `).join("");

    resultsList.querySelectorAll(".result-item[data-id]").forEach(el => {
        el.addEventListener("click", () => {
            const id = el.getAttribute("data-id");
            const asteroid = list.find(a => a.neo_reference_id === id);
            if (asteroid) selectAsteroid(asteroid);
            resultsList.hidden = true;
        });
    });
}

function selectAsteroid(a) {
    state.selected = a;
    targetCard.hidden = false;
    targetName.textContent = a.name;
    targetBadge.textContent = a.is_potentially_hazardous ? "hazardous" : "nominal";
    targetBadge.className = "badge" + (a.is_potentially_hazardous ? " hazardous" : "");
    statDiameter.textContent = `${a.estimated_diameter_km.toFixed(3)} km`;
    statVelocity.textContent = `${Math.round(a.relative_velocity_km_h).toLocaleString()} km/h`;
    statMagnitude.textContent = a.absolute_magnitude;

    if (state.target) {
        updateReadout();
    } else {
        mapHint.hidden = false;
        mapHint.textContent = "Click the grid to choose an impact point";
    }
}

async function surpriseMe() {
    setLoading(true);
    try {
        if (!state.defaultBatch) {
            const response = await fetch(`${API_URL}/api/v1/asteroids`, { headers: API_HEADERS });
            const data = await response.json();
            state.defaultBatch = data.asteroids || [];
        }
        if (state.defaultBatch.length === 0) return;
        const pick = state.defaultBatch[Math.floor(Math.random() * state.defaultBatch.length)];
        selectAsteroid(pick);
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
}

function setLoading(isLoading) {
    loadingState.hidden = !isLoading;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}
function escapeAttr(str) {
    return String(str).replace(/"/g, "&quot;");
}

searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    searchAsteroids(q);
});

surpriseBtn.addEventListener("click", surpriseMe);

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
resizeCanvas();
requestAnimationFrame(loop);
