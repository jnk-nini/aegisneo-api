// Small, calm interface effects shared by the landing page, sign-in page and hub.
// Everything here is optional polish: the pages work without it, and it all stops
// when the visitor asks for less motion (their system setting, or the toggle).
(function () {
    const root = document.documentElement;
    const KEY = "aegisneo_motion";
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");

    function stored() {
        try { return localStorage.getItem(KEY); } catch { return null; }
    }
    function enabled() {
        const saved = stored();
        return saved ? saved === "on" : !query.matches;
    }
    function apply() {
        root.dataset.motion = enabled() ? "on" : "off";
        document.querySelectorAll("[data-motion-toggle]").forEach(btn => {
            btn.setAttribute("aria-pressed", String(!enabled()));
            btn.title = enabled() ? "Turn animations off" : "Turn animations on";
            const label = btn.querySelector("[data-motion-label]");
            if (label) label.textContent = enabled() ? "Motion on" : "Motion off";
        });
        window.dispatchEvent(new CustomEvent("aegis:motion", { detail: enabled() }));
    }
    function set(on) {
        try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* not remembered */ }
        apply();
    }
    window.AegisMotion = { enabled, set };
    window.AegisFx = window.AegisFx || {};
    query.addEventListener?.("change", apply);
    document.addEventListener("click", (event) => {
        if (event.target.closest("[data-motion-toggle]")) set(!enabled());
    });
    apply();

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    function init() {
    apply();
    // --- header turns solid once the page scrolls ---
    const bar = document.querySelector(".topbar");
    if (bar) {
        const onScroll = () => bar.classList.toggle("scrolled", scrollY > 8);
        addEventListener("scroll", onScroll, { passive: true });
        onScroll();
    }

    // --- reveal on scroll: [data-reveal], optional --d (delay) ---
    const reveals = document.querySelectorAll("[data-reveal]");
    if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("in");
                io.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
        reveals.forEach(el => io.observe(el));
    } else {
        reveals.forEach(el => el.classList.add("in"));
    }

    // --- count up: [data-count="33511"] ---
    function countUp(el) {
        const target = Number(el.dataset.count);
        if (!Number.isFinite(target)) return;
        const text = n => Math.round(n).toLocaleString("en-US");
        if (!enabled()) { el.textContent = text(target); return; }
        const start = performance.now(), duration = 1100;
        (function tick(now) {
            const p = Math.min((now - start) / duration, 1);
            el.textContent = text(target * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(tick);
        })(start);
    }
    Object.assign(window.AegisFx, { countUp, bindTilt() {} });
    const counters = document.querySelectorAll("[data-count]");
    if ("IntersectionObserver" in window && counters.length) {
        const co = new IntersectionObserver((entries) => entries.forEach(entry => {
            if (entry.isIntersecting) { countUp(entry.target); co.unobserve(entry.target); }
        }), { threshold: 0.6 });
        counters.forEach(el => co.observe(el));
    }

    // --- pointer effects: only for a mouse or trackpad, never on a phone ---
    if (!fine.matches) return;

    // tilt + glare: [data-tilt]
    function bindTilt(card) {
        let frame = 0;
        card.addEventListener("pointermove", (event) => {
            if (root.dataset.motion !== "on" || frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const r = card.getBoundingClientRect();
                const px = (event.clientX - r.left) / r.width, py = (event.clientY - r.top) / r.height;
                card.style.setProperty("--rx", `${((0.5 - py) * 7).toFixed(2)}deg`);
                card.style.setProperty("--ry", `${((px - 0.5) * 9).toFixed(2)}deg`);
                card.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
                card.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
            });
        });
        card.addEventListener("pointerleave", () => {
            card.style.removeProperty("--rx"); card.style.removeProperty("--ry");
        });
    }
    window.AegisFx.bindTilt = bindTilt;
    document.querySelectorAll("[data-tilt]").forEach(bindTilt);

    // magnetic buttons: [data-magnetic]
    document.querySelectorAll("[data-magnetic]").forEach(btn => {
        btn.addEventListener("pointermove", (event) => {
            if (root.dataset.motion !== "on") return;
            const r = btn.getBoundingClientRect();
            btn.style.setProperty("--tx", `${((event.clientX - r.left - r.width / 2) * 0.12).toFixed(1)}px`);
            btn.style.setProperty("--ty", `${((event.clientY - r.top - r.height / 2) * 0.2).toFixed(1)}px`);
        });
        btn.addEventListener("pointerleave", () => { btn.style.removeProperty("--tx"); btn.style.removeProperty("--ty"); });
    });
    }
})();
