// Shared by the landing page, the sign-in page, the hub and the explorer.
// Plain script (no build step): it defines Session, apiFetch and a few helpers.

const LIVE_API = "https://aegisneo-api.vercel.app";
// When the site is served by the API itself (Vercel or your own computer) it
// talks to the same origin; opened from a file it uses the live API.
const API_URL = /^(localhost|127\.0\.0\.1|aegisneo-api)/.test(location.hostname) ? location.origin : LIVE_API;

const TOKEN_KEY = "aegisneo_token";
const USER_KEY = "aegisneo_user";
const ROLE_KEY = "aegisneo_role";
const GUEST_KEY = "aegisneo_guest";
const NEW_BADGES_KEY = "aegisneo_new_badges";

// localStorage can throw (blocked, private mode, quota) or hold garbage: every read and
// write goes through these, so a storage problem never takes a whole page down.
function readLocal(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocal(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
        return true;
    } catch { return false; }
}

function readSession(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
}

function writeSession(key, value) {
    try {
        if (value === null) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, value);
    } catch { /* storage blocked: the session lasts until the page is reloaded */ }
}

// The token's own expiry time, so an expired token is dropped before any request.
function tokenExpired(token) {
    try {
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return !payload.exp || payload.exp * 1000 <= Date.now();
    } catch {
        return true;
    }
}

const Session = {
    get token() {
        const token = readSession(TOKEN_KEY);
        if (token && tokenExpired(token)) {
            this.clear();
            return null;
        }
        return token;
    },
    get username() { return readSession(USER_KEY); },
    get role() { return this.token ? readSession(ROLE_KEY) : "guest"; },
    get loggedIn() { return Boolean(this.token); },
    get isGuest() { return !this.loggedIn && Boolean(readSession(GUEST_KEY)); },
    get isAdmin() { return this.role === "admin"; },
    save({ token, username, role }) {
        writeSession(TOKEN_KEY, token);
        writeSession(USER_KEY, username);
        writeSession(ROLE_KEY, role || "user");
        writeSession(GUEST_KEY, null);
    },
    startGuest() {
        this.clear();
        writeSession(GUEST_KEY, "1");
    },
    clear() {
        [TOKEN_KEY, USER_KEY, ROLE_KEY, GUEST_KEY].forEach(key => writeSession(key, null));
    },
    // Pages behind the sign-in page: a visitor is either signed in or a guest.
    require() {
        if (this.loggedIn || this.isGuest) return true;
        location.replace("auth");
        return false;
    },
    logOut(to = "./") {
        this.clear();
        location.assign(to);
    },
};

// A request to the API with the token (if any). An expired or refused token
// sends the visitor back to the sign-in page instead of showing broken data.
async function apiFetch(path, { method = "GET", json, form, signal } = {}) {
    const headers = {};
    const token = Session.token;
    if (token) headers.Authorization = `Bearer ${token}`;
    let body;
    if (json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(json);
    } else if (form) {
        body = new URLSearchParams(form);
    }
    const response = await fetch(`${API_URL}${path}`, { method, headers, body, signal });
    if (response.status === 401 && token) {
        Session.clear();
        location.replace("auth?expired=1");
    }
    return response;
}

// Where the hub may send a visitor: an address on this site, or an https address.
// The address comes from the database, so anything else (javascript:, data:, http:) is refused.
function safeLaunchUrl(raw) {
    try {
        const url = new URL(raw, location.href);
        return url.protocol === "https:" || url.origin === location.origin ? url.href : null;
    } catch {
        return null;
    }
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

function formatNumber(n) {
    return Number(n).toLocaleString("en-US");
}

function timeAgo(iso) {
    const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    const steps = [[86400, "d"], [3600, "h"], [60, "min"]];
    for (const [size, unit] of steps) if (seconds >= size) return `${Math.floor(seconds / size)} ${unit} ago`;
    return "just now";
}

const ROLE_LABELS = { admin: "Admin", user: "Explorer", guest: "Guest" };
