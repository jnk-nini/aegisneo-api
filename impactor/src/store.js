import { create } from "zustand";
import { atmosphericEntrySpeed, COMPOSITIONS, simulateImpact } from "./physics/impact.js";
import { scenarioToQuery } from "./lib/share.js";

function webglAvailable() {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
const HAS_WEBGL = webglAvailable();

export const SYSTEM_REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOTION_KEY = "impactor.animate";
const ZONES_KEY = "impactor.zoneRings";

/** Honour the OS "reduce motion" setting unless the user opted back in on this site. */
function initialReducedMotion() {
  if (!SYSTEM_REDUCED_MOTION) return false;
  try {
    return localStorage.getItem(MOTION_KEY) !== "on";
  } catch {
    return true;
  }
}

/** Damage-zone rings over the impact are off unless the user turned them on. */
function initialZoneRings() {
  try {
    return localStorage.getItem(ZONES_KEY) === "on";
  } catch {
    return false;
  }
}

/** Real-data defaults for an asteroid record from the API. */
export function realParamsFor(asteroid) {
  return {
    diameterM: asteroid.estimated_diameter_km * 1000,
    velocityKms: atmosphericEntrySpeed(asteroid.relative_velocity_km_h / 3600),
  };
}

const DEFAULT_INPUTS = {
  asteroid: null, // record from the AegisNEO API
  diameterM: 100,
  velocityKms: 20,
  composition: "stony",
  angleDeg: 45,
  azimuthDeg: 90, // direction the asteroid comes from, clockwise from north
  target: null, // { lat, lon, surface, country, nearest }
};

export const useSim = create((set, get) => ({
  // --- inputs ---
  ...DEFAULT_INPUTS,

  // --- simulation ---
  run: null, // { id, result, params, target }
  phase: "idle", // idle | approach | impact | done
  paused: false,
  timeScale: 1,
  reducedMotion: initialReducedMotion(),

  // --- view ---
  mode: "impact", // impact | flyby
  view3d: HAS_WEBGL,
  webglFailed: !HAS_WEBGL,
  fallbackReason: HAS_WEBGL
    ? ""
    : "Your browser can't show the 3D globe, so you're seeing the 2D map instead.",
  focusRequest: 0, // bump to fly the camera to the target
  globeRequest: 0, // bump to fly back to the whole globe
  craterRequest: 0, // bump to fly in close to the crater of the finished run
  showZoneRings: initialZoneRings(), // outline the damage zones over the impact
  mobileTab: "object",
  sheet: "half", // peek | half | full (mobile only)
  sheetHeight: 0, // px the mobile sheet covers at the bottom of the view; 0 on desktop
  capture: null, // function returning a PNG blob of the 3D view
  globeReady: false, // the 3D globe's textures are painted and on screen
  quality: "high", // "low" on phones or slow GPUs: fewer particles, simpler shaders

  selectAsteroid(asteroid) {
    set({ asteroid, ...realParamsFor(asteroid), run: null, phase: "idle" });
  },
  resetToRealValues() {
    const { asteroid } = get();
    if (asteroid) set(realParamsFor(asteroid));
  },
  setAnimate(animate) {
    try {
      localStorage.setItem(MOTION_KEY, animate ? "on" : "off");
    } catch {
      /* preference just won't persist */
    }
    set({ reducedMotion: !animate });
  },
  setShowZoneRings(show) {
    try {
      localStorage.setItem(ZONES_KEY, show ? "on" : "off");
    } catch {
      /* preference just won't persist */
    }
    set({ showZoneRings: show });
  },
  setParam(key, value) {
    set({ [key]: value });
  },
  setTarget(target) {
    set((s) => ({
      target,
      run: s.phase === "done" ? null : s.run,
      phase: s.phase === "done" ? "idle" : s.phase,
    }));
  },

  /** Current inputs, ready for the physics model. */
  params() {
    const { diameterM, velocityKms, composition, angleDeg, target } = get();
    return {
      diameterM,
      velocityKms,
      density: COMPOSITIONS[composition].density,
      angleDeg,
      surface: target?.surface ?? "land",
    };
  },
  isHypothetical() {
    const { asteroid, diameterM, velocityKms } = get();
    if (!asteroid) return true;
    const real = realParamsFor(asteroid);
    // Composition is an assumption either way (the catalog has no density), so
    // only size and speed changes count as departing from the real data.
    return (
      Math.abs(diameterM / real.diameterM - 1) > 0.005 || Math.abs(velocityKms - real.velocityKms) > 0.01
    );
  },

  launch() {
    const s = get();
    if (!s.target) return;
    const params = s.params();
    const result = simulateImpact(params);
    // The 2D map has no animation, so it jumps straight to the results.
    const instant = s.reducedMotion || !s.view3d || s.webglFailed;
    set({
      run: {
        id: (s.run?.id ?? 0) + 1,
        result,
        params: { ...params, azimuthDeg: s.azimuthDeg, composition: s.composition },
        target: s.target,
        query: scenarioToQuery({
          asteroidId: s.asteroid?.neo_reference_id,
          diameterM: s.diameterM,
          velocityKms: s.velocityKms,
          angleDeg: s.angleDeg,
          azimuthDeg: s.azimuthDeg,
          composition: s.composition,
          target: s.target,
        }),
        asteroidName: s.asteroid?.name ?? "Custom object",
        hypothetical: s.isHypothetical(),
      },
      phase: instant ? "done" : "approach",
      paused: false,
      mode: "impact",
      sheet: instant ? "half" : "peek",
      mobileTab: instant ? "results" : s.mobileTab,
    });
  },
  clearRun() {
    set({ run: null, phase: "idle" });
  },
  /** Start over: no asteroid, no target, no run, and a clean address bar. */
  reset() {
    try {
      history.replaceState(null, "", location.pathname);
    } catch {
      /* some embedded browsers block history changes */
    }
    set((s) => ({
      ...DEFAULT_INPUTS,
      run: null,
      phase: "idle",
      paused: false,
      timeScale: 1,
      mode: "impact",
      mobileTab: "object",
      sheet: "half",
      globeRequest: s.globeRequest + 1,
    }));
  },
  setPhase(phase) {
    if (get().phase !== phase) {
      // On phones the panel stays low, so the crater is in view; results are a drag away.
      set(phase === "done" ? { phase, sheet: "peek", mobileTab: "results" } : { phase });
    }
  },
}));
