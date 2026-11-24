// Landing page: the globe, shortcuts for visitors who are already in, and the live catalog size.
// Signed-in visitors get a way straight back to the hub.
if (Session.loggedIn || Session.isGuest) {
    document.getElementById("heroActions").innerHTML =
        `<a class="btn btn-primary btn-lg" href="hub" data-magnetic>Open the hub <span class="arrow" aria-hidden="true">→</span></a>`;
    const actions = document.getElementById("topActions");
    actions.querySelectorAll(".btn").forEach(btn => btn.remove());
    actions.insertAdjacentHTML("beforeend", `<a class="btn btn-primary btn-sm" href="hub">Open the hub</a>`);
}
// "Continue as guest" links start a guest session before opening the hub.
document.querySelectorAll("[data-guest]").forEach(link => link.addEventListener("click", (event) => {
    event.preventDefault();
    Session.startGuest();
    location.assign("hub");
}));

AegisGlobe.mount(document.getElementById("heroGlobe"), { orbits: 3, interactive: true, speed: 0.16 });

// The real size of the catalog (the home endpoint is public).
fetch(`${API_URL}/`).then(r => r.ok ? r.json() : null).then(data => {
    if (!data || !data.total_tracked) return;
    const text = formatNumber(data.total_tracked);
    document.getElementById("heroCount").textContent = text;
    const tile = document.getElementById("tileCount");
    tile.dataset.count = data.total_tracked;
    tile.textContent = text;
}).catch(() => { /* keep the printed number */ });

// Two real asteroids floating beside the globe (guests may read the featured ones).
fetch(`${API_URL}/api/v1/asteroids/random?count=2`).then(r => r.ok ? r.json() : null).then(data => {
    const rocks = data?.asteroids;
    if (!rocks || rocks.length < 2) return;
    rocks.slice(0, 2).forEach((a, i) => {
        const suffix = i === 0 ? "A" : "B";
        const meters = a.estimated_diameter_km < 1 ? `${Math.round(a.estimated_diameter_km * 1000)} m` : `${a.estimated_diameter_km.toFixed(1)} km`;
        document.getElementById(`hudName${suffix}`).textContent = a.name.replace(/\s*\(.*\)$/, "");
        document.getElementById(`hudInfo${suffix}`).textContent = `${meters} · ${(a.relative_velocity_km_h / 3600).toFixed(1)} km/s`;
    });
}).catch(() => { /* keep the printed examples */ });

// Highlight the section being read in the top navigation.
const links = [...document.querySelectorAll(".topnav a")];
if ("IntersectionObserver" in window) {
    const seen = new IntersectionObserver((entries) => entries.forEach(entry => {
        if (entry.isIntersecting) links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === `#${entry.target.id}`));
    }), { rootMargin: "-45% 0px -50% 0px" });
    links.forEach(a => { const s = document.querySelector(a.getAttribute("href")); if (s) seen.observe(s); });
}
