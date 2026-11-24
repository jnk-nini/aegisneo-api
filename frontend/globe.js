// A dotted Earth with asteroids on tilted orbits, drawn on a plain 2D canvas (no WebGL, no
// library). It is decoration: it pauses when it is off screen, when the tab is hidden, or when
// the visitor turned motion off, and it draws a single still frame in those cases.
//
//   AegisGlobe.mount(canvas, { orbits: 3, interactive: true, speed: 0.16, trails: true })
(function () {
    const TAU = Math.PI * 2;
    let dotsPromise = null;

    function loadDots() {
        dotsPromise = dotsPromise || fetch("assets/globe-dots.json")
            .then(r => (r.ok ? r.json() : []))
            .then(flat => {
                // flat = [lat*10, lon*10, lat*10, lon*10, ...]: turn into unit vectors once.
                const n = flat.length / 2, v = new Float32Array(n * 3);
                for (let i = 0; i < n; i++) {
                    const lat = flat[2 * i] / 10 * Math.PI / 180, lon = flat[2 * i + 1] / 10 * Math.PI / 180;
                    v[3 * i] = Math.cos(lat) * Math.sin(lon);
                    v[3 * i + 1] = Math.sin(lat);
                    v[3 * i + 2] = Math.cos(lat) * Math.cos(lon);
                }
                return v;
            })
            .catch(() => new Float32Array(0));
        return dotsPromise;
    }

    const ORBITS = [
        { a: 1.32, e: 0.06, inc: 0.5, node: 0.7, speed: 0.55, size: 2.6, color: "#3ee0e8", phase: 0.3 },
        { a: 1.58, e: 0.1, inc: -0.75, node: 2.3, speed: 0.36, size: 3.6, color: "#f5a524", phase: 2.4, hazard: true },
        { a: 1.84, e: 0.12, inc: 0.18, node: 4.1, speed: 0.25, size: 2.3, color: "#cfe6ff", phase: 4.4 },
    ];

    function mount(canvas, options = {}) {
        const opt = { orbits: 3, interactive: true, speed: 0.16, trails: true, tilt: 0.42, radius: 0.26, ...options };
        const ctx = canvas.getContext("2d");
        const orbits = ORBITS.slice(0, opt.orbits);
        let dots = new Float32Array(0);
        let w = 0, h = 0, dpr = 1, R = 0, bg = null;
        let yaw = 2.2, yawVel = 0, parX = 0, parY = 0, tParX = 0, tParY = 0;
        let time = 0, last = 0, raf = 0, visible = true, dragging = false, dragX = 0, destroyed = false;
        const small = () => Math.min(w, h) < 260;

        function size() {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            dpr = Math.min(window.devicePixelRatio || 1, matchMedia("(max-width: 700px)").matches ? 1.5 : 2);
            w = rect.width; h = rect.height;
            canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
            R = Math.min(w, h) * opt.radius;
            // The globe's body (glow, sphere, rim) never changes: paint it once.
            bg = document.createElement("canvas");
            bg.width = canvas.width; bg.height = canvas.height;
            const b = bg.getContext("2d");
            b.scale(dpr, dpr);
            const cx = w / 2, cy = h / 2;
            const halo = b.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2.1);
            halo.addColorStop(0, "rgba(62,224,232,.22)"); halo.addColorStop(0.45, "rgba(62,140,232,.07)"); halo.addColorStop(1, "rgba(62,224,232,0)");
            b.fillStyle = halo; b.fillRect(0, 0, w, h);
            const body = b.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R);
            body.addColorStop(0, "rgba(40,92,170,.95)"); body.addColorStop(0.55, "rgba(12,32,72,.96)"); body.addColorStop(1, "rgba(4,10,24,.98)");
            b.fillStyle = body; b.beginPath(); b.arc(cx, cy, R, 0, TAU); b.fill();
            const rim = b.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.04);
            rim.addColorStop(0, "rgba(62,224,232,0)"); rim.addColorStop(0.8, "rgba(110,200,255,.28)"); rim.addColorStop(1, "rgba(62,224,232,0)");
            b.fillStyle = rim; b.beginPath(); b.arc(cx, cy, R * 1.04, 0, TAU); b.fill();
        }

        // view = the camera: a fixed tilt plus a little pointer parallax
        const pitch = () => opt.tilt + parY;
        function view(x, y, z) {
            const cp = Math.cos(parX), sp = Math.sin(parX);
            const x1 = x * cp + z * sp, z1 = -x * sp + z * cp;
            const ca = Math.cos(pitch()), sa = Math.sin(pitch());
            return [x1, y * ca - z1 * sa, y * sa + z1 * ca];
        }

        function orbitPoint(o, t) {
            const b = o.a * Math.sqrt(1 - o.e * o.e);
            let x = o.a * Math.cos(t) - o.a * o.e, y = 0, z = b * Math.sin(t);
            const ci = Math.cos(o.inc), si = Math.sin(o.inc);
            [y, z] = [z * si, z * ci];                       // incline about X
            const cn = Math.cos(o.node), sn = Math.sin(o.node);
            [x, z] = [x * cn + z * sn, -x * sn + z * cn];    // turn the node about Y
            return view(x, y, z);
        }

        const hidden = (p) => p[2] < 0 && Math.hypot(p[0], p[1]) < 1; // behind the globe

        function draw() {
            if (!w) return;
            const cx = w / 2, cy = h / 2;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(bg, 0, 0, w, h);

            // land dots: a glassy back hemisphere, then the lit front
            const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), ca = Math.cos(pitch()), sa = Math.sin(pitch());
            const cp = Math.cos(parX), sp = Math.sin(parX);
            const dotSize = small() ? 1.3 : Math.max(1.5, R / 95);
            ctx.fillStyle = "#7fe9ee";
            for (let pass = 0; pass < 2; pass++) {
                if (pass === 0 && small()) continue;
                for (let i = 0; i < dots.length; i += 3) {
                    const x = dots[i], y = dots[i + 1], z = dots[i + 2];
                    const x1 = x * cyaw + z * syaw, z1 = -x * syaw + z * cyaw;      // spin
                    const x2 = x1 * cp + z1 * sp, z2 = -x1 * sp + z1 * cp;          // parallax
                    const y3 = y * ca - z2 * sa, z3 = y * sa + z2 * ca;             // tilt
                    if ((pass === 0) === (z3 > 0)) continue;
                    if (pass === 0) { ctx.globalAlpha = 0.1; }
                    else {
                        const lit = Math.max(0, -x2 * 0.45 + y3 * 0.35 + z3 * 0.82);  // sunlit side is brighter
                        ctx.globalAlpha = 0.2 + 0.8 * Math.min(1, lit * 0.9 + z3 * 0.25);
                    }
                    ctx.fillRect(cx + x2 * R - dotSize / 2, cy - y3 * R - dotSize / 2, dotSize, dotSize);
                }
            }
            ctx.globalAlpha = 1;

            // orbit rings, with the part hidden behind the globe left out
            orbits.forEach((o) => {
                ctx.strokeStyle = o.hazard ? "rgba(245,165,36,.35)" : "rgba(148,186,230,.22)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                let pen = false;
                for (let k = 0; k <= 96; k++) {
                    const p = orbitPoint(o, (k / 96) * TAU);
                    const px = cx + p[0] * R, py = cy - p[1] * R;
                    if (hidden(p)) { pen = false; continue; }
                    if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
                }
                ctx.stroke();
            });

            // asteroids with a short fading tail
            orbits.forEach((o) => {
                const ang = o.phase + time * o.speed;
                const p = orbitPoint(o, ang);
                if (hidden(p)) return;
                const px = cx + p[0] * R, py = cy - p[1] * R;
                const depth = 0.85 + 0.3 * Math.max(-1, Math.min(1, p[2] / 2));
                if (opt.trails) {
                    const steps = small() ? 8 : 16;
                    for (let k = steps; k >= 1; k--) {
                        const q = orbitPoint(o, ang - k * 0.045 * Math.sign(o.speed));
                        if (hidden(q)) continue;
                        ctx.globalAlpha = (1 - k / steps) * 0.5;
                        ctx.fillStyle = o.color;
                        const r = o.size * depth * (1 - k / (steps * 1.4));
                        ctx.beginPath(); ctx.arc(cx + q[0] * R, cy - q[1] * R, Math.max(0.4, r), 0, TAU); ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                }
                const glow = ctx.createRadialGradient(px, py, 0, px, py, o.size * 5 * depth);
                glow.addColorStop(0, o.color); glow.addColorStop(0.25, o.color + "55"); glow.addColorStop(1, "rgba(0,0,0,0)");
                ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py, o.size * 5 * depth, 0, TAU); ctx.fill();
                ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px, py, o.size * 0.55 * depth, 0, TAU); ctx.fill();

                // a close pass: a thin line towards the surface
                if (o.hazard && p[2] > 0 && Math.hypot(p[0], p[1]) < 1.45) {
                    const d = Math.hypot(p[0], p[1]) || 1;
                    ctx.strokeStyle = "rgba(245,165,36,.55)"; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx + (p[0] / d) * R, cy - (p[1] / d) * R); ctx.stroke();
                    ctx.setLineDash([]);
                }
            });
        }

        function frame(now) {
            raf = 0;
            if (destroyed) return;
            const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
            time += dt;
            if (!dragging) {
                yaw += (opt.speed + yawVel) * dt;
                yawVel *= Math.pow(0.04, dt);              // a flick slows down smoothly
            }
            parX += (tParX - parX) * Math.min(1, dt * 3);
            parY += (tParY - parY) * Math.min(1, dt * 3);
            draw();
            schedule();
        }
        const running = () => visible && !document.hidden && window.AegisMotion?.enabled() !== false;
        function schedule() { if (!raf && !destroyed && running()) raf = requestAnimationFrame(frame); }
        function refresh() { last = 0; if (running()) schedule(); else draw(); }

        // --- listeners ---
        const ro = new ResizeObserver(() => { size(); draw(); });
        ro.observe(canvas);
        const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; refresh(); });
        io.observe(canvas);
        const onVis = () => refresh();
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("aegis:motion", onVis);

        const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
        const onMove = (e) => {
            if (!fine) return;
            tParX = (e.clientX / innerWidth - 0.5) * 0.35;
            tParY = (e.clientY / innerHeight - 0.5) * -0.16;
        };
        if (opt.interactive && fine) window.addEventListener("pointermove", onMove, { passive: true });
        if (opt.interactive) {
            canvas.style.touchAction = "pan-y"; // a sideways drag spins the globe; up/down still scrolls the page
            canvas.addEventListener("pointerdown", (e) => { dragging = true; dragX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.classList.add("grabbing"); });
            canvas.addEventListener("pointermove", (e) => {
                if (!dragging) return;
                const dx = e.clientX - dragX; dragX = e.clientX;
                yaw += dx * 0.009; yawVel = dx * 0.35;
                if (!raf) draw();
            });
            const end = () => { dragging = false; canvas.classList.remove("grabbing"); refresh(); };
            canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
        }

        loadDots().then((d) => { dots = d; size(); refresh(); });
        size(); draw();

        return {
            destroy() {
                destroyed = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
                document.removeEventListener("visibilitychange", onVis);
                window.removeEventListener("aegis:motion", onVis);
                window.removeEventListener("pointermove", onMove);
            },
        };
    }

    window.AegisGlobe = { mount };
})();
