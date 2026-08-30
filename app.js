const API_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://127.0.0.1:8000"
    : "";

const LUNAR_DISTANCE_KM = 384400;

const listEl = document.getElementById("asteroidList");
const statTotalEl = document.getElementById("statTotal");
const statShownEl = document.getElementById("statShown");
const searchInput = document.getElementById("searchInput");


// LOAD ALL ASTEROIDS
async function loadAsteroids() {
    showLoading();

    try {
        const response = await fetch(`${API_URL}/asteroids`);
        const data = await response.json();
        displayAsteroids(data.asteroids);
        updateStats(data.total ?? data.count, data.count);
    }

    catch (error) {
        console.error(error);
        showError();
    }
}


// SEARCH ASTEROIDS
async function searchAsteroids() {
    const query = searchInput.value.trim();
    if (!query) {
        loadAsteroids();
        return;
    }

    showLoading();

    try {
        const response =
            await fetch(`${API_URL}/asteroids?search=${encodeURIComponent(query)}`);
        const data = await response.json();
        displayAsteroids(data.asteroids);
        updateStats(null, data.count);
    }

    catch (error) {
        console.error(error);
        showError();
    }
}


// DISPLAY ASTEROIDS
function displayAsteroids(asteroids) {
    if (!asteroids || asteroids.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <p class="empty-title">No objects detected in this sector</p>
                <p class="empty-sub">Adjust your search parameters and scan again.</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = asteroids.map(asteroidCardHTML).join("");
}


// BUILD ONE CARD (template literal → innerHTML, mirrors the starter's displayCars pattern)
function asteroidCardHTML(asteroid) {
    const hazardous = asteroid.is_potentially_hazardous;
    const statusClass = hazardous ? "status-hazard" : "status-safe";
    const statusIcon = hazardous ? "assets/icon-warning.svg" : "assets/icon-safe.svg";
    const statusLabel = hazardous ? "Hazardous" : "Nominal";

    return `
        <article class="asteroid-card ${statusClass}">
            <header class="card-head">
                <h3 class="card-name">${asteroid.name}</h3>
                <span class="status-chip">
                    <img class="status-icon" src="${statusIcon}" alt="" width="14" height="14">
                    <span class="status-label">${statusLabel}</span>
                </span>
            </header>
            <p class="card-id">${asteroid.neo_reference_id}</p>
            <dl class="card-metrics">
                <div>
                    <dt>Diameter</dt>
                    <dd>${formatDiameter(asteroid.estimated_diameter_km)}</dd>
                </div>
                <div>
                    <dt>Velocity</dt>
                    <dd>${formatVelocity(asteroid.relative_velocity_km_h)}</dd>
                </div>
                <div>
                    <dt>Miss distance</dt>
                    <dd>${formatDistance(asteroid.miss_distance_km)}</dd>
                </div>
                <div>
                    <dt>Close approach</dt>
                    <dd>${formatDate(asteroid.close_approach_date)}</dd>
                </div>
            </dl>
            <button class="detail-btn" type="button" onclick="viewAsteroid('${asteroid.neo_reference_id}')">
                Full telemetry
            </button>
        </article>
    `;
}


// VIEW ONE ASTEROID (detail panel, replaces the starter's alert() popup)
async function viewAsteroid(id) {
    try {
        const response = await fetch(`${API_URL}/asteroids/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error("not found");
        const asteroid = await response.json();
        showDetailPanel(asteroid);
    }

    catch (error) {
        console.error(error);
        alert("Unable to retrieve telemetry for this object.");
    }
}


function showDetailPanel(asteroid) {
    const hazardous = asteroid.is_potentially_hazardous;
    const existing = document.querySelector(".detail-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "detail-overlay";
    overlay.innerHTML = `
        <div class="detail-panel ${hazardous ? "status-hazard" : "status-safe"}">
            <button class="detail-close" type="button" aria-label="Close">&times;</button>
            <p class="detail-eyebrow">${asteroid.neo_reference_id}</p>
            <h2 class="detail-name">${asteroid.name}</h2>
            <div class="detail-grid">
                <div><dt>Status</dt><dd>${hazardous ? "Potentially hazardous" : "Nominal / non-hazardous"}</dd></div>
                <div><dt>Estimated diameter</dt><dd>${formatDiameter(asteroid.estimated_diameter_km)}</dd></div>
                <div><dt>Relative velocity</dt><dd>${formatVelocity(asteroid.relative_velocity_km_h)}</dd></div>
                <div><dt>Miss distance</dt><dd>${formatDistance(asteroid.miss_distance_km)}</dd></div>
                <div><dt>Close approach date</dt><dd>${formatDate(asteroid.close_approach_date)}</dd></div>
                <div><dt>Absolute magnitude</dt><dd>${asteroid.absolute_magnitude?.toFixed(2) ?? "—"}</dd></div>
            </div>
        </div>
    `;
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay || e.target.classList.contains("detail-close")) {
            overlay.remove();
        }
    });
    document.body.appendChild(overlay);
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
            <p class="empty-sub">Unable to reach the AegisNEO API. Confirm the backend is running.</p>
        </div>
    `;
}

function updateStats(total, shown) {
    if (total !== null && total !== undefined) statTotalEl.textContent = total.toLocaleString();
    if (shown !== null && shown !== undefined) statShownEl.textContent = shown.toLocaleString();
}


// WIRE UP CONTROLS
document.getElementById("searchBtn").addEventListener("click", searchAsteroids);
document.getElementById("resetBtn").addEventListener("click", () => {
    searchInput.value = "";
    loadAsteroids();
});
searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchAsteroids();
});

loadAsteroids();
