// Landing page: shortcuts for visitors who are already in, and the live catalog size.
// Signed-in visitors get a way straight back to the hub.
if (Session.loggedIn || Session.isGuest) {
    document.getElementById("topActions").innerHTML =
        `<a class="btn btn-primary btn-sm" href="hub.html">Open the hub</a>`;
    document.getElementById("heroActions").innerHTML =
        `<a class="btn btn-primary" href="hub.html">Open the hub</a>`;
}
// "Continue as guest" links start a guest session before opening the hub.
document.querySelectorAll("[data-guest]").forEach(link => link.addEventListener("click", (event) => {
    event.preventDefault();
    Session.startGuest();
    location.assign("hub.html");
}));
// The real size of the catalog (the home endpoint is public).
fetch(`${API_URL}/`).then(r => r.ok ? r.json() : null).then(data => {
    if (!data || !data.total_tracked) return;
    const text = formatNumber(data.total_tracked);
    document.getElementById("heroCount").textContent = text;
    document.getElementById("tileCount").textContent = text;
}).catch(() => { /* keep the printed number */ });
