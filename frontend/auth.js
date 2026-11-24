// Sign-in page: log in, create an account, or continue as a guest. All three end at the hub.
const form = document.getElementById("authForm");
const title = document.getElementById("authTitle");
const sub = document.getElementById("authSub");
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const username = document.getElementById("username");
const password = document.getElementById("password");
const confirmField = document.getElementById("confirmField");
const confirmInput = document.getElementById("confirm");
const errorEl = document.getElementById("authError");
const submit = document.getElementById("authSubmit");
const userHint = document.getElementById("userHint");
const passHint = document.getElementById("passHint");
const strengthEl = document.getElementById("strength");
let signingUp = false;

// A rough guide while choosing a password: length and variety, nothing is sent anywhere.
function strengthOf(value) {
    if (value.length < 8) return value ? 1 : 0;
    let level = 2 + (value.length >= 12) + (/[a-z]/.test(value) && /[A-Z0-9\W]/.test(value) && value.length >= 10);
    return Math.min(4, level);
}
password.addEventListener("input", () => { strengthEl.dataset.level = String(strengthOf(password.value)); });
AegisGlobe.mount(document.getElementById("authGlobe"), { orbits: 2, interactive: false, speed: 0.1, trails: false, radius: 0.3 });

const params = new URLSearchParams(location.search);
if (params.get("expired")) document.getElementById("expiredNote").hidden = false;

// Already signed in: go straight on instead of asking again.
if (Session.loggedIn) location.replace("hub");

function setMode(on) {
    signingUp = on;
    tabLogin.setAttribute("aria-selected", String(!on));
    tabSignup.setAttribute("aria-selected", String(on));
    tabLogin.tabIndex = on ? -1 : 0;
    tabSignup.tabIndex = on ? 0 : -1;
    title.textContent = on ? "Create your account" : "Welcome back";
    sub.textContent = on ? "Free, and it takes a few seconds. You will be an Explorer." : "Sign in to open the hub.";
    submit.textContent = on ? "Create account" : "Sign in";
    password.autocomplete = on ? "new-password" : "current-password";
    confirmField.hidden = !on;
    userHint.hidden = passHint.hidden = !on;
    strengthEl.hidden = !on;
    document.getElementById("tabs").dataset.mode = on ? "signup" : "login";
    confirmInput.required = on;
    errorEl.textContent = "";
}

// Arrow keys move between the two tabs, as the tabs pattern expects.
[tabLogin, tabSignup].forEach(tab => tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab === tabLogin ? tabSignup : tabLogin;
    next.focus();
    setMode(next === tabSignup);
}));

tabLogin.addEventListener("click", () => setMode(false));
tabSignup.addEventListener("click", () => setMode(true));
setMode(params.get("mode") === "signup");

document.getElementById("pwToggle").addEventListener("click", (event) => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    event.currentTarget.textContent = show ? "Hide" : "Show";
    event.currentTarget.setAttribute("aria-pressed", String(show));
});

[username, password, confirmInput].forEach(input => input.addEventListener("input", () => { errorEl.textContent = ""; }));

function signUpProblem(detail) {
    const field = Array.isArray(detail) ? detail[0]?.loc?.at(-1) : null;
    if (field === "username") return "Use 3 to 30 characters: lowercase letters, numbers and _.";
    if (field === "password") return "The password must be 8 to 72 characters.";
    return "Please check the username and password.";
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = username.value.trim().toLowerCase();
    if (!name || !password.value) {
        errorEl.textContent = "Enter your username and password.";
        return;
    }
    if (signingUp && password.value !== confirmInput.value) {
        errorEl.textContent = "The two passwords do not match.";
        confirmInput.focus();
        return;
    }
    submit.disabled = true;
    errorEl.textContent = "";
    try {
        const response = signingUp
            ? await fetch(`${API_URL}/api/v1/auth/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: name, password: password.value }),
            })
            : await fetch(`${API_URL}/api/v1/auth/login`, {
                method: "POST",
                body: new URLSearchParams({ username: name, password: password.value }),
            });
        if (signingUp && response.status === 409) throw new Error("This username is already taken.");
        if (signingUp && response.status === 422) throw new Error(signUpProblem((await response.json()).detail));
        if (response.status === 429) {
            const wait = Math.max(1, Math.ceil(Number(response.headers.get("Retry-After")) / 60)) || 5;
            throw new Error(`Too many attempts. Please wait about ${wait} minute${wait === 1 ? "" : "s"} and try again.`);
        }
        if (!signingUp && response.status === 401) throw new Error("Incorrect username or password.");
        if (!response.ok) throw new Error(`${signingUp ? "Sign-up" : "Sign-in"} is not available right now. Please try again later.`);
        const data = await response.json();
        Session.save({ token: data.access_token, username: name, role: data.role });
        location.assign("hub");
    } catch (error) {
        errorEl.textContent = error instanceof TypeError
            ? "Could not reach the server. Check your connection and try again."
            : error.message;
        submit.disabled = false;
    }
});

document.getElementById("guestBtn").addEventListener("click", () => {
    Session.startGuest();
    location.assign("hub");
});
