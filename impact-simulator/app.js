// Impact Simulator — pick a real NEO, strike anywhere on a real equirectangular
// world map, and watch an animated blast sequence (flash, shockwave, debris,
// crater) play out at the correct geographic scale. Physics is intentionally
// simplified (assumed density, cube-root blast scaling) — see the on-page
// disclaimer. Not a scientific hazard model.

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
const outCoords = document.getElementById("outCoords");
const outEnergy = document.getElementById("outEnergy");
const outTnt = document.getElementById("outTnt");
const outSevere = document.getElementById("outSevere");
const outModerate = document.getElementById("outModerate");
const outCompare = document.getElementById("outCompare");
const mapHint = document.getElementById("mapHint");
const mapWrap = document.getElementById("mapWrap");
const resetViewBtn = document.getElementById("resetViewBtn");
const loadingState = document.getElementById("loadingState");
const loadingText = document.getElementById("loadingText");
const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------
// World map geometry — matches assets/world.svg's viewBox exactly
// ---------------------------------------------------------------
const WORLD_W = 2752.77;
const WORLD_H = 1537.63;
const UNITS_PER_DEG_LON = WORLD_W / 360;
const UNITS_PER_DEG_LAT = WORLD_H / 180;
const KM_PER_DEG_LAT = 111.32;

function worldToLatLon(wx, wy) {
    return {
        lon: (wx / WORLD_W) * 360 - 180,
        lat: 90 - (wy / WORLD_H) * 180,
    };
}

function kmToWorldRadius(km, lat) {
    const latRad = (lat * Math.PI) / 180;
    const cosLat = Math.max(Math.cos(latRad), 0.08);
    const degLat = km / KM_PER_DEG_LAT;
    const degLon = km / (KM_PER_DEG_LAT * cosLat);
    return { rx: degLon * UNITS_PER_DEG_LON, ry: degLat * UNITS_PER_DEG_LAT };
}

const state = {
    selected: null,
    impact: null,      // { wx, wy, lat, lon }
    defaultBatch: null,
    sequence: null,     // active blast animation
    crater: null,       // persistent scorch mark of the last strike
    particles: [],
};

let dpr = Math.max(1, window.devicePixelRatio || 1);
let basemap = null;
let worldPaths = [];

const camera = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
let fitZoom = 1;
const MAX_ZOOM_MULT = 30000;
let flyTo = null;
let dragging = false, dragged = false, lastMouse = { x: 0, y: 0 };

// ---------------------------------------------------------------
// Load + parse the real world map, prerender it once to a bitmap
// ---------------------------------------------------------------
async function loadWorldMap() {
    const res = await fetch("assets/world.svg");
    const text = await res.text();
    const tagRe = /<path\b[^>]*>/g;
    let m;
    while ((m = tagRe.exec(text))) {
        const tag = m[0];
        const dMatch = /\sd="([^"]+)"/.exec(tag);
        if (!dMatch) continue;
        const tMatch = /\stransform="matrix\(([^)]+)\)"/.exec(tag);
        let matrix = null;
        if (tMatch) {
            const parts = tMatch[1].split(",").map(Number);
            if (parts.length === 6) matrix = parts;
        }
        try {
            worldPaths.push({ path: new Path2D(dMatch[1]), matrix });
        } catch (e) { /* skip malformed path data */ }
    }
    basemap = prerenderBasemap(worldPaths);
}

function prerenderBasemap(paths) {
    const scale = 1.6;
    const bmp = document.createElement("canvas");
    bmp.width = Math.ceil(WORLD_W * scale);
    bmp.height = Math.ceil(WORLD_H * scale);
    const bctx = bmp.getContext("2d");
    bctx.scale(scale, scale);

    bctx.fillStyle = "#241209";
    for (const { path, matrix } of paths) {
        if (matrix) {
            bctx.save();
            bctx.transform(...matrix);
            bctx.fill(path);
            bctx.restore();
        } else {
            bctx.fill(path);
        }
    }
    bctx.strokeStyle = "rgba(255,140,90,0.4)";
    bctx.lineWidth = 0.7;
    for (const { path, matrix } of paths) {
        if (matrix) {
            bctx.save();
            bctx.transform(...matrix);
            bctx.stroke(path);
            bctx.restore();
        } else {
            bctx.stroke(path);
        }
    }
    return bmp;
}

// ---------------------------------------------------------------
// Canvas sizing + camera
// ---------------------------------------------------------------
function resizeCanvas() {
    const rect = mapWrap.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    fitZoom = (rect.width * dpr) / WORLD_W;
    if (camera.zoom <= fitZoom + 0.0001 || !camera._touched) {
        camera.zoom = fitZoom;
        camera.x = WORLD_W / 2;
        camera.y = WORLD_H / 2;
    }
}
window.addEventListener("resize", resizeCanvas);

function worldToScreen(wx, wy) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    return { x: cx + (wx - camera.x) * camera.zoom, y: cy + (wy - camera.y) * camera.zoom };
}
function screenToWorld(sx, sy) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    return {
        wx: camera.x + (sx * dpr - cx) / camera.zoom,
        wy: camera.y + (sy * dpr - cy) / camera.zoom,
    };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------
let lastFrame = performance.now();

function loop(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (flyTo) applyFlyTo(now);
    updateParticles(dt);
    render(now);
    requestAnimationFrame(loop);
}

function render(time) {
    const w = canvas.width, h = canvas.height;

    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    grad.addColorStop(0, "#140b08");
    grad.addColorStop(1, "#080503");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (basemap) {
        const tl = worldToScreen(0, 0);
        const br = worldToScreen(WORLD_W, WORLD_H);
        ctx.drawImage(basemap, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }

    drawGraticule();
    if (state.crater) drawCrater(state.crater);
    if (state.impact) drawImpactMarker(time);
    drawParticles();

    ctx.font = `${11 * dpr}px 'Share Tech Mono', monospace`;
    ctx.fillStyle = "rgba(169,154,140,0.55)";
    ctx.fillText(`zoom ${(camera.zoom / fitZoom).toFixed(1)}×  ·  equirectangular projection`, 12 * dpr, h - 14 * dpr);
}

function drawGraticule() {
    ctx.strokeStyle = "rgba(255,77,46,0.08)";
    ctx.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) {
        const a = worldToScreen((lon + 180) / 360 * WORLD_W, 0);
        const b = worldToScreen((lon + 180) / 360 * WORLD_W, WORLD_H);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
        const y = (90 - lat) / 180 * WORLD_H;
        const a = worldToScreen(0, y);
        const b = worldToScreen(WORLD_W, y);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    const eq = worldToScreen(0, WORLD_H / 2);
    const eq2 = worldToScreen(WORLD_W, WORLD_H / 2);
    ctx.strokeStyle = "rgba(255,176,32,0.18)";
    ctx.beginPath(); ctx.moveTo(eq.x, eq.y); ctx.lineTo(eq2.x, eq2.y); ctx.stroke();
}

function drawImpactMarker(time) {
    const { wx, wy, lat } = state.impact;
    const s = worldToScreen(wx, wy);

    if (!state.selected) {
        drawCrosshair(s.x, s.y, "#ff4d2e", 1);
        return;
    }

    const impact = computeImpact(state.selected);
    const rad = kmToWorldRadius(impact.severeKm, lat);
    const radM = kmToWorldRadius(impact.moderateKm, lat);
    const severeR = { x: rad.rx * camera.zoom, y: rad.ry * camera.zoom };
    const moderateR = { x: radM.rx * camera.zoom, y: radM.ry * camera.zoom };

    const seq = state.sequence;
    if (seq) {
        const t = clamp((time - seq.start) / seq.severeDuration, 0, 1);
        const tMod = clamp((time - seq.start - seq.moderateDelay) / seq.moderateDuration, 0, 1);
        const easeOut = (x) => 1 - Math.pow(1 - x, 3);

        if (tMod > 0) {
            const e = easeOut(tMod);
            drawRing(s.x, s.y, moderateR.x * e, moderateR.y * e, "rgba(255,176,32,0.9)", 3 * (1 - e * 0.6), 1 - e * 0.3);
        }
        const e = easeOut(t);
        drawRing(s.x, s.y, severeR.x * e, severeR.y * e, "rgba(255,77,46,0.95)", 4 * (1 - e * 0.6), 1 - e * 0.2);

        // flash
        const flashT = clamp((time - seq.start) / seq.flashDuration, 0, 1);
        if (flashT < 1) {
            const flashR = Math.max(severeR.x, severeR.y) * 0.5 * easeOut(Math.min(flashT * 2, 1));
            const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, Math.max(flashR, 4));
            const alpha = 1 - flashT;
            g.addColorStop(0, `rgba(255,255,240,${0.95 * alpha})`);
            g.addColorStop(0.4, `rgba(255,170,80,${0.7 * alpha})`);
            g.addColorStop(1, "rgba(255,77,46,0)");
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(flashR, 4), 0, Math.PI * 2); ctx.fill();
        }

        if (t >= 1 && tMod >= 1) {
            state.sequence = null;
            state.crater = { wx, wy, lat, severeKm: impact.severeKm };
        }
    } else {
        drawRing(s.x, s.y, moderateR.x, moderateR.y, "rgba(255,176,32,0.85)", 1.5, 1);
        drawRing(s.x, s.y, severeR.x, severeR.y, "rgba(255,77,46,0.95)", 2, 1);
    }

    drawCrosshair(s.x, s.y, "#ff4d2e", (seq ? 1.4 : 1));
}

function drawRing(cx, cy, rx, ry, color, lineWidth, alpha) {
    if (rx < 0.5 && ry < 0.5) return;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * dpr;
    ctx.stroke();
    ctx.restore();
}

function drawCrosshair(x, y, color, scale) {
    const len = 12 * dpr * scale;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(x - len, y); ctx.lineTo(x + len, y);
    ctx.moveTo(x, y - len); ctx.lineTo(x, y + len);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}

function drawCrater(crater) {
    const s = worldToScreen(crater.wx, crater.wy);
    const rad = kmToWorldRadius(crater.severeKm * 0.16, crater.lat);
    const rx = Math.max(rad.rx * camera.zoom, 2);
    const ry = Math.max(rad.ry * camera.zoom, 2);
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, Math.max(rx, ry));
    g.addColorStop(0, "rgba(10,5,3,0.85)");
    g.addColorStop(0.6, "rgba(40,15,8,0.55)");
    g.addColorStop(1, "rgba(40,15,8,0)");
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(rx / Math.max(rx, ry) || 1, ry / Math.max(rx, ry) || 1);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ---------------------------------------------------------------
// Debris particles
// ---------------------------------------------------------------
function spawnParticles(wx, wy, megatons) {
    const count = Math.round(clamp(30 + Math.log10(megatons + 1) * 18, 30, 90));
    const energy = clamp(6 + Math.log10(megatons + 1) * 10, 6, 60);
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (0.4 + Math.random() * 0.6) * energy;
        state.particles.push({
            wx, wy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed * 0.6,
            life: 0.7 + Math.random() * 0.9,
            maxLife: 0.7 + Math.random() * 0.9,
            size: 1 + Math.random() * 2.2,
            hue: Math.random() < 0.5 ? "255,140,60" : "255,200,90",
        });
    }
}

function updateParticles(dt) {
    if (reduceMotion) { state.particles.length = 0; return; }
    for (const p of state.particles) {
        p.wx += p.vx * dt;
        p.wy += p.vy * dt;
        p.vx *= Math.pow(0.9, dt * 60);
        p.vy *= Math.pow(0.9, dt * 60);
        p.vy += 1.2 * dt;
        p.life -= dt;
    }
    state.particles = state.particles.filter(p => p.life > 0);
}

function drawParticles() {
    for (const p of state.particles) {
        const s = worldToScreen(p.wx, p.wy);
        const alpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.beginPath();
        ctx.arc(s.x, s.y, Math.max(p.size * camera.zoom * 0.4, 1) * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.hue},${alpha})`;
        ctx.fill();
    }
}

// ---------------------------------------------------------------
// Fly-to camera animation
// ---------------------------------------------------------------
function flyCameraTo(toX, toY, toZoom, duration) {
    flyTo = {
        fromX: camera.x, fromY: camera.y, fromZoom: camera.zoom,
        toX, toY, toZoom,
        start: performance.now(), duration: reduceMotion ? 1 : duration,
    };
    camera._touched = true;
}

function applyFlyTo(time) {
    const t = clamp((time - flyTo.start) / flyTo.duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.x = flyTo.fromX + (flyTo.toX - flyTo.fromX) * eased;
    camera.y = flyTo.fromY + (flyTo.toY - flyTo.fromY) * eased;
    camera.zoom = flyTo.fromZoom + (flyTo.toZoom - flyTo.fromZoom) * eased;
    if (t >= 1) flyTo = null;
}

// ---------------------------------------------------------------
// Pointer interaction: drag to pan, wheel/pinch to zoom, click/tap to strike
// ---------------------------------------------------------------
canvas.style.touchAction = "none";
const activePointers = new Map(); // pointerId -> {x, y}
let pinchStartDist = 0;
let pinchStartZoom = 1;

canvas.addEventListener("pointerdown", (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore: pointer already inactive */ }
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 1) {
        dragging = true;
        dragged = false;
        lastMouse = { x: e.clientX, y: e.clientY };
    } else if (activePointers.size === 2) {
        const pts = [...activePointers.values()];
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinchStartZoom = camera.zoom;
        dragged = true;
    }
});

window.addEventListener("pointermove", (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
        const pts = [...activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        if (pinchStartDist > 0) {
            const rect = canvas.getBoundingClientRect();
            const before = screenToWorld(midX - rect.left, midY - rect.top);
            camera.zoom = clamp(pinchStartZoom * (dist / pinchStartDist), fitZoom * 0.8, fitZoom * MAX_ZOOM_MULT);
            camera._touched = true;
            const after = screenToWorld(midX - rect.left, midY - rect.top);
            camera.x += before.wx - after.wx;
            camera.y += before.wy - after.wy;
        }
    } else if (dragging) {
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
        camera.x -= (dx * dpr) / camera.zoom;
        camera.y -= (dy * dpr) / camera.zoom;
        camera._touched = true;
        lastMouse = { x: e.clientX, y: e.clientY };
    }
});

function endPointer(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size === 0) {
        dragging = false;
    } else if (activePointers.size === 1) {
        const [remaining] = activePointers.values();
        dragging = true;
        dragged = true;
        lastMouse = { x: remaining.x, y: remaining.y };
    }
}
window.addEventListener("pointerup", endPointer);
window.addEventListener("pointercancel", endPointer);

canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const before = screenToWorld(mx, my);
    const factor = Math.exp(-e.deltaY * 0.001);
    camera.zoom = clamp(camera.zoom * factor, fitZoom * 0.8, fitZoom * MAX_ZOOM_MULT);
    camera._touched = true;
    const after = screenToWorld(mx, my);
    camera.x += before.wx - after.wx;
    camera.y += before.wy - after.wy;
}, { passive: false });

canvas.addEventListener("click", (e) => {
    if (dragged) return;
    const rect = canvas.getBoundingClientRect();
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const { lat, lon } = worldToLatLon(world.wx, world.wy);
    state.impact = { wx: world.wx, wy: world.wy, lat, lon };
    mapHint.hidden = true;

    if (state.selected) {
        triggerImpact();
    }
});

resetViewBtn.addEventListener("click", () => {
    flyCameraTo(WORLD_W / 2, WORLD_H / 2, fitZoom, 700);
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

// ---------------------------------------------------------------
// Strike sequence: camera fly-in + flash + shockwave + debris + shake
// ---------------------------------------------------------------
function triggerImpact() {
    const impact = computeImpact(state.selected);
    const { wx, wy, lat } = state.impact;

    const rad = kmToWorldRadius(impact.severeKm, lat);
    const targetRadiusPx = Math.min(canvas.width, canvas.height) * 0.24;
    const worldRadius = Math.max(rad.rx, rad.ry, 0.001);
    const desiredZoom = targetRadiusPx / worldRadius;
    const targetZoom = clamp(desiredZoom, fitZoom, fitZoom * MAX_ZOOM_MULT);

    flyCameraTo(wx, wy, targetZoom, reduceMotion ? 1 : 900);

    state.sequence = {
        start: performance.now() + (reduceMotion ? 0 : 250),
        flashDuration: reduceMotion ? 1 : 380,
        severeDuration: reduceMotion ? 1 : 1300,
        moderateDelay: reduceMotion ? 0 : 180,
        moderateDuration: reduceMotion ? 1 : 1700,
    };
    state.crater = null;
    state.particles = [];
    if (!reduceMotion) {
        setTimeout(() => spawnParticles(wx, wy, impact.megatons), 250);
    }

    if (!reduceMotion) {
        mapWrap.classList.remove("shake");
        void mapWrap.offsetWidth;
        mapWrap.classList.add("shake");
        setTimeout(() => mapWrap.classList.remove("shake"), 260 + 500);
    }

    updateReadout(impact);
}

function tweenNumber(el, from, to, duration, formatter) {
    if (reduceMotion) { el.textContent = formatter(to); return; }
    const start = performance.now();
    function step(now) {
        const t = clamp((now - start) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = formatter(from + (to - from) * eased);
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function fmt(n) {
    if (n >= 1000) return Math.round(n).toLocaleString();
    if (n >= 10) return n.toFixed(0);
    return n.toFixed(1);
}

function updateReadout(impact) {
    readout.hidden = false;
    const { lat, lon } = state.impact;
    outCoords.textContent = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
    outEnergy.textContent = `${impact.energyJoules.toExponential(2)} J`;
    tweenNumber(outTnt, 0, impact.megatons, 900, (v) => `${fmt(v)} megatons`);
    tweenNumber(outSevere, 0, impact.severeKm, 900, (v) => `${fmt(v)} km`);
    tweenNumber(outModerate, 0, impact.moderateKm, 900, (v) => `${fmt(v)} km`);
    outCompare.textContent = comparisonFor(impact.megatons);
}

// ---------------------------------------------------------------
// Search / selection
// ---------------------------------------------------------------
async function searchAsteroids(query) {
    setLoading(true, "scanning catalog…");
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
    state.sequence = null;
    state.crater = null;
    state.particles = [];
    targetCard.hidden = false;
    targetName.textContent = a.name;
    targetBadge.textContent = a.is_potentially_hazardous ? "hazardous" : "nominal";
    targetBadge.className = "badge" + (a.is_potentially_hazardous ? " hazardous" : "");
    statDiameter.textContent = `${a.estimated_diameter_km.toFixed(3)} km`;
    statVelocity.textContent = `${Math.round(a.relative_velocity_km_h).toLocaleString()} km/h`;
    statMagnitude.textContent = a.absolute_magnitude;

    if (state.impact) {
        triggerImpact();
    } else {
        mapHint.hidden = false;
        mapHint.textContent = "Click anywhere on the map to strike";
    }
}

async function surpriseMe() {
    setLoading(true, "fetching object…");
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

function setLoading(isLoading, text) {
    loadingState.hidden = !isLoading;
    if (text) loadingText.textContent = text;
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
setLoading(true, "loading tactical map…");
loadWorldMap().finally(() => setLoading(false));
requestAnimationFrame(loop);
