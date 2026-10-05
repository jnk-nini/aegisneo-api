// Mouse, touch and keyboard navigation for the globe (see globeNav.js).
// One finger or the left button drags the ground; the wheel or a pinch zooms
// towards the pointer; two fingers moving up/down, or the right button (or
// Shift/Ctrl + drag), tilt towards the horizon and turn. Movement is smoothed
// and coasts briefly after letting go, but settles quickly.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Raycaster, Sphere, Vector2, Vector3 } from "three";
import {
  MAX_DIST,
  MIN_DIST,
  applyNav,
  blendNav,
  copyNav,
  maxTilt,
  moveNav,
  moveTowards,
  navFromCamera,
  newNav,
  radiansPerPixel,
} from "./globeNav.js";

const ZOOM_SMOOTH = 12; // 1/s: how quickly the view catches up with the wheel
const COAST_DECAY = 7; // 1/s: how quickly a flick slows down
const WHEEL_STEP = 0.0016; // log-distance per wheel pixel
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const UNIT_SPHERE = new Sphere(new Vector3(), 1);

const GlobeControls = forwardRef(function GlobeControls({ enabled = true, minDist = MIN_DIST }, ref) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const nav = useMemo(() => newNav(), []);
  const state = useRef({
    pointers: new Map(),
    velocity: new Vector2(), // screen px/s, while coasting
    zoomTo: null, // wanted distance; eased towards
    anchor: null, // surface point under the pointer while zooming
    flight: null,
    synced: false,
    lastMove: 0,
  });
  const scratch = useMemo(() => ({ ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3() }), []);

  // Take over from wherever the camera is now (after the cinematic or a jump).
  const sync = () => {
    const s = state.current;
    navFromCamera(camera, camera.userData.lookAt ?? new Vector3(), nav);
    s.zoomTo = null;
    s.anchor = null;
    s.velocity.set(0, 0);
    s.synced = true;
  };

  useImperativeHandle(ref, () => ({
    sync,
    /** Smooth flight to a nav state; `then` runs when it lands. */
    flyTo(to, ms = 1400, then) {
      if (!state.current.synced) sync();
      state.current.flight = { from: copyNav(nav), to: copyNav(to), start: performance.now(), ms, then };
      state.current.velocity.set(0, 0);
      state.current.zoomTo = null;
    },
    stop() {
      state.current.flight = null;
    },
    get nav() {
      return nav;
    },
  }));

  // Pointer → surface point, for zooming towards it.
  const surfaceAt = (clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect();
    scratch.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    scratch.ray.setFromCamera(scratch.ndc, camera);
    return scratch.ray.ray.intersectSphere(UNIT_SPHERE, scratch.hit) ? scratch.hit.clone().normalize() : null;
  };

  useEffect(() => {
    const el = gl.domElement;
    const s = state.current;
    el.style.touchAction = "none";
    if (!enabled) {
      s.pointers.clear();
      return undefined;
    }
    sync();

    const zoomBy = (factor, clientX, clientY) => {
      const from = s.zoomTo ?? nav.dist;
      s.zoomTo = Math.min(MAX_DIST, Math.max(minDist, from * factor));
      s.anchor = clientX == null ? null : surfaceAt(clientX, clientY);
      s.flight = null;
    };

    const onWheel = (e) => {
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      zoomBy(Math.exp(Math.max(-300, Math.min(300, px)) * WHEEL_STEP), e.clientX, e.clientY);
    };

    const twoFinger = () => {
      const [a, b] = [...s.pointers.values()];
      return {
        span: Math.hypot(a.x - b.x, a.y - b.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
    };

    const onDown = (e) => {
      if (e.pointerType === "mouse" && e.button > 2) return;
      s.flight = null;
      s.velocity.set(0, 0);
      s.pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        turn: e.pointerType === "mouse" && (e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey),
      });
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety */
      }
      if (s.pointers.size === 2) s.pinch = twoFinger();
    };

    const onMove = (e) => {
      const p = s.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (s.pointers.size === 1) {
        p.x = e.clientX;
        p.y = e.clientY;
        if (p.turn) {
          nav.heading -= dx * 0.005;
          nav.tilt = Math.min(maxTilt(nav.dist), Math.max(0, nav.tilt - dy * 0.004));
          return;
        }
        const k = radiansPerPixel(nav, camera, size.height);
        moveNav(nav, dy * k, -dx * k);
        // Remember the speed for a short coast after release.
        const now = performance.now();
        const dt = Math.max(1, now - s.lastMove) / 1000;
        s.lastMove = now;
        s.velocity
          .set(dx / dt, dy / dt)
          .multiplyScalar(0.5)
          .add(s.velocity.clone().multiplyScalar(0.5));
        return;
      }
      if (s.pointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const now = twoFinger();
        const before = s.pinch;
        if (before && now.span > 10 && before.span > 10) {
          nav.dist = Math.min(MAX_DIST, Math.max(minDist, nav.dist * (before.span / now.span)));
          s.zoomTo = null;
          let turn = now.angle - before.angle;
          turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
          nav.heading -= turn;
          // Both fingers moving up or down together (without pinching) tilt the view.
          const lift = now.midY - before.midY;
          if (Math.abs(lift) > Math.abs(now.span - before.span)) {
            nav.tilt = Math.min(maxTilt(nav.dist), Math.max(0, nav.tilt - lift * 0.005));
          }
        }
        s.pinch = now;
      }
    };

    const onUp = (e) => {
      if (!s.pointers.has(e.pointerId)) return;
      s.pointers.delete(e.pointerId);
      // Only coast after a real flick, not after the finger rests then lifts.
      if (s.pointers.size === 0 && performance.now() - s.lastMove > 80) s.velocity.set(0, 0);
      if (s.pointers.size < 2) s.pinch = null;
      if (s.pointers.size === 1) {
        const [rest] = s.pointers.values();
        rest.turn = false;
        s.velocity.set(0, 0);
      }
    };

    const onKey = (e) => {
      if (e.target !== el && e.target !== document.body) return;
      const k = radiansPerPixel(nav, camera, size.height) * 60;
      const keys = {
        ArrowUp: () => moveNav(nav, k, 0),
        ArrowDown: () => moveNav(nav, -k, 0),
        ArrowLeft: () => moveNav(nav, 0, -k),
        ArrowRight: () => moveNav(nav, 0, k),
        "+": () => zoomBy(0.7),
        "=": () => zoomBy(0.7),
        "-": () => zoomBy(1 / 0.7),
      };
      if (keys[e.key]) {
        e.preventDefault();
        s.flight = null;
        keys[e.key]();
      }
    };
    const noMenu = (e) => e.preventDefault();

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("contextmenu", noMenu);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("keydown", onKey);
      s.pointers.clear();
      s.synced = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, gl, camera, size.height, minDist]);

  useFrame((_, rawDt) => {
    const s = state.current;
    if (!enabled || !s.synced) return;
    const dt = Math.min(rawDt, 0.1);

    if (s.flight) {
      const f = s.flight;
      const t = Math.min(1, (performance.now() - f.start) / f.ms);
      blendNav(f.from, f.to, easeInOut(t), nav);
      if (t >= 1) {
        s.flight = null;
        f.then?.();
      }
      applyNav(nav, camera);
      return;
    }

    // Zoom eases towards the wanted distance, keeping the point under the
    // pointer in place by sliding the view towards it as it closes in.
    if (s.zoomTo != null) {
      const before = nav.dist;
      const k = 1 - Math.exp(-ZOOM_SMOOTH * dt);
      nav.dist = Math.exp(Math.log(nav.dist) + (Math.log(s.zoomTo) - Math.log(nav.dist)) * k);
      if (s.anchor) moveTowards(nav, s.anchor, 1 - nav.dist / before);
      if (Math.abs(Math.log(nav.dist / s.zoomTo)) < 0.002) {
        nav.dist = s.zoomTo;
        s.zoomTo = null;
        s.anchor = null;
      }
    }

    // Coast after a flick.
    if (s.pointers.size === 0 && s.velocity.lengthSq() > 1) {
      const k = radiansPerPixel(nav, camera, size.height);
      moveNav(nav, s.velocity.y * dt * k, -s.velocity.x * dt * k);
      s.velocity.multiplyScalar(Math.exp(-COAST_DECAY * dt));
    }

    // Zooming out levels the view, so the globe ends up centred.
    const limit = maxTilt(nav.dist);
    if (nav.tilt > limit) nav.tilt += (limit - nav.tilt) * (1 - Math.exp(-6 * dt));
    applyNav(nav, camera);
  });

  return null;
});

export default GlobeControls;
