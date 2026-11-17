// The hub: lists the three sites with what this visitor's role may do on each,
// opens them (recording the launch), and shows badges and admin figures.
if (!Session.require()) throw new Error("redirecting to the sign-in page");

const SITE_IMAGES = {
    aegisneo: "linear-gradient(180deg,rgba(5,7,13,.1),rgba(5,7,13,.6)),url('assets/nebula.jpg')",
    impactor: "url('assets/shot-impactor.jpg')",
    "neo-atlas": "url('assets/shot-atlas.jpg')",
};
const ROLE_TEXT = {
    admin: "You are an admin: the whole catalog on every site, and you can create, edit and delete asteroids in the Explorer.",
    user: "You are an Explorer: the whole catalog on every site. Your account is read only, so you cannot change data.",
    guest: "You are browsing as a guest: every site is open, with 10 featured asteroids each.",
};

const grid = document.getElementById("siteGrid");
const errorEl = document.getElementById("hubError");

document.getElementById("who").textContent = Session.loggedIn ? `@${Session.username}` : "Guest";
const rolePill = document.getElementById("rolePill");
rolePill.textContent = ROLE_LABELS[Session.role] || "Guest";
rolePill.classList.add(Session.role || "guest");
document.getElementById("greeting").textContent = Session.loggedIn ? `Welcome, @${Session.username}` : "Welcome, guest";
document.getElementById("roleText").textContent = ROLE_TEXT[Session.role] || ROLE_TEXT.guest;
document.getElementById("upsell").hidden = Session.loggedIn;
document.getElementById("logoutBtn").textContent = Session.loggedIn ? "Log out" : "Leave";
document.getElementById("logoutBtn").addEventListener("click", () => Session.logOut());

function toast(icon, title, text) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span class="ico" aria-hidden="true">${escapeHtml(icon)}</span><div><strong>${escapeHtml(title)}</strong><br><small>${escapeHtml(text)}</small></div>`;
    document.getElementById("toasts").appendChild(el);
    setTimeout(() => el.remove(), 6500);
}

function accessLabel(site) {
    const a = site.access;
    if (a.level === "none") return `<span class="access none">No access for your role</span>`;
    if (a.level === "limited") return `<span class="access limited">Limited<small>${a.item_limit} featured asteroids</small></span>`;
    return `<span class="access">Full catalog<small>${a.can_write ? "Create, edit and delete" : "Read only"}</small></span>`;
}

function renderSites(sites) {
    grid.innerHTML = sites.map(site => `
        <article class="site-card ${site.access.level === "none" ? "locked" : ""}">
            <div class="exp-media" style="background-image:${SITE_IMAGES[site.slug] || "none"}">
                <span class="tag ${escapeHtml(site.kind)}">${site.kind === "main" ? "Main site" : "Partner site"}</span>
            </div>
            <div class="site-body">
                <h3>${escapeHtml(site.name)}</h3>
                <p>${escapeHtml(site.description)}</p>
                ${accessLabel(site)}
                <button class="btn btn-primary btn-block" type="button" data-launch="${escapeHtml(site.slug)}"
                    ${site.access.level === "none" ? "disabled" : ""}>Open ${escapeHtml(site.name)}</button>
            </div>
        </article>`).join("");
}

grid.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-launch]");
    if (!button) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Opening…";
    errorEl.textContent = "";
    try {
        const response = await apiFetch(`/api/v1/sites/${encodeURIComponent(button.dataset.launch)}/launch`, { method: "POST" });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Could not open this site.");
        const launch = await response.json();
        // Badges earned by this launch are shown when the visitor comes back to the hub.
        if (launch.new_badges?.length) writeSession(NEW_BADGES_KEY, JSON.stringify(launch.new_badges));
        // The ticket travels in the URL fragment, which is never sent to a server.
        location.assign(launch.ticket ? `${launch.url}#aegis_ticket=${launch.ticket}` : launch.url);
    } catch (error) {
        errorEl.textContent = error instanceof TypeError ? "Could not reach the server." : error.message;
        button.disabled = false;
        button.textContent = label;
    }
});

function renderOverview(data) {
    document.getElementById("accountPanels").hidden = false;
    const earned = data.badges.filter(b => b.earned_at).length;
    document.getElementById("badgeSub").textContent = `${earned} of ${data.badges.length} collected.`;
    document.getElementById("badgeGrid").innerHTML = data.badges.map(b => `
        <div class="badge ${b.earned_at ? "" : "locked"}" title="${escapeHtml(b.description)}">
            <span class="ico" aria-hidden="true">${escapeHtml(b.icon)}</span>
            <b>${escapeHtml(b.name)}</b><small>${escapeHtml(b.description)}</small>
        </div>`).join("");
    document.getElementById("launchFeed").innerHTML = data.recent_launches.length
        ? data.recent_launches.map(l => `<li><span>${escapeHtml(l.site_name)}</span><time datetime="${escapeHtml(l.launched_at)}">${timeAgo(l.launched_at)}</time></li>`).join("")
        : `<li class="empty">Nothing yet. Open a site above.</li>`;
    document.getElementById("watchCount").textContent = data.watchlist_count;
}

function renderAdmin(data) {
    document.getElementById("adminPanel").hidden = false;
    const users = Object.fromEntries(data.users_by_role.map(u => [u.role, u.n]));
    const tiles = [
        ["Admins", users.admin || 0], ["Explorers", users.user || 0],
        ...data.launches_by_site.map(s => [`${s.name} launches`, `${s.total}${s.guests ? ` (${s.guests} guest)` : ""}`]),
    ];
    document.getElementById("adminStats").innerHTML = tiles.map(([k, v]) => `<div class="tile"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("");
    const rows = data.recent_changes.map(c => `<tr>
        <td><span class="act ${escapeHtml(c.action)}">${escapeHtml(c.action)}</span></td>
        <td>${escapeHtml(c.asteroid_name)}</td><td>@${escapeHtml(c.changed_by || "removed")}</td>
        <td>${timeAgo(c.changed_at)}</td></tr>`).join("");
    document.getElementById("changesTable").innerHTML = rows
        ? `<thead><tr><th>Change</th><th>Asteroid</th><th>By</th><th>When</th></tr></thead><tbody>${rows}</tbody>`
        : `<tbody><tr><td class="empty">No changes yet.</td></tr></tbody>`;
    document.getElementById("watchedFeed").innerHTML = data.most_watched.length
        ? data.most_watched.map(w => `<li><span>${escapeHtml(w.name)}</span><time>${w.watchers} watching</time></li>`).join("")
        : `<li class="empty">No one is watching anything yet.</li>`;
}

async function load() {
    try {
        const sitesResponse = await apiFetch("/api/v1/sites");
        if (!sitesResponse.ok) throw new Error("Could not load the sites.");
        renderSites((await sitesResponse.json()).sites);
        if (Session.loggedIn) {
            const overview = await apiFetch("/api/v1/me/overview");
            if (overview.ok) renderOverview(await overview.json());
            if (Session.isAdmin) {
                const admin = await apiFetch("/api/v1/admin/overview");
                if (admin.ok) renderAdmin(await admin.json());
            }
        }
        const pending = readSession(NEW_BADGES_KEY);
        if (pending) {
            writeSession(NEW_BADGES_KEY, null);
            JSON.parse(pending).forEach(b => toast(b.icon, `Badge unlocked: ${b.name}`, b.description));
        }
    } catch (error) {
        errorEl.textContent = error instanceof TypeError
            ? "Could not reach the server. Check your connection and reload."
            : error.message;
    }
}

load();
