import { describe, expect, it } from "vitest";
import { simulateImpact } from "../physics/impact.js";
import { craterVisual, finalHeight, niceFactor, transientHeight, TARGET_DEPTH_RATIO } from "./craterShape.js";
import {
  debrisRange,
  damageRadii,
  ejectaReachM,
  ejectaThicknessM,
  excavationSeconds,
  flightSeconds,
  launchSpeedFor,
  severity,
  tsunamiSpeed,
} from "./impactVisuals.js";
import {
  APPROACH_SECONDS,
  TOTAL_SECONDS,
  aftermathRealSeconds,
  clockScale,
  isTimeLapse,
  playbackAt,
  simulatedSeconds,
} from "./timeline.js";

const rock = (diameterM, extra = {}) =>
  simulateImpact({ diameterM, velocityKms: 20, density: 3000, angleDeg: 45, ...extra });
const runFor = (result) => ({ params: { velocityKms: 20 }, result });

describe("impact visuals", () => {
  it("rates severity on a log scale of energy", () => {
    expect(severity(rock(100))).toBe(0);
    expect(severity(rock(1000))).toBe(0);
    expect(severity(rock(10000))).toBeGreaterThan(0.6);
    expect(severity(rock(100000))).toBe(1);
    expect(severity(null)).toBe(0);
  });

  it("follows the ejecta thickness law and its inverse", () => {
    const D = 20000;
    expect(ejectaThicknessM(2 * D, D)).toBeCloseTo(D / (112 * 8), 6);
    const reach = ejectaReachM(D, 1);
    expect(ejectaThicknessM(reach, D)).toBeCloseTo(1, 6);
    expect(ejectaThicknessM(0, D)).toBe(0);
  });

  it("uses consistent ballistic and wave speeds", () => {
    const range = 50000;
    const v = launchSpeedFor(range);
    expect((v * v) / 9.81).toBeCloseTo(range, 3);
    expect(flightSeconds(range)).toBeCloseTo((Math.SQRT2 * v) / 9.81, 6);
    expect(tsunamiSpeed()).toBeGreaterThan(185);
    expect(tsunamiSpeed()).toBeLessThan(195);
    expect(excavationSeconds(1000)).toBeCloseTo(0.8 * Math.sqrt(1000 / 9.81), 6);
  });
});

describe("ground damage radii", () => {
  it("come from the model's thermal, blast and wind ranges", () => {
    const result = rock(1000);
    const r = damageRadii(result);
    expect(r.scorch).toBe(result.thermal.find((t) => t.key === "clothing").radiusM);
    expect(r.fires).toBe(result.thermal.find((t) => t.key === "burns3").radiusM);
    expect(r.flattened).toBe(result.wind.find((w) => w.key === "trees90").radiusM);
    expect(r.lightsOut).toBe(result.blast.find((b) => b.key === "wood").radiusM);
    expect(r.wrecked).toBe(result.blast.find((b) => b.key === "masonry").radiusM);
    expect(r.fires).toBeGreaterThan(r.scorch);
  });

  it("stop heat at the fireball's horizon and skip it for airbursts", () => {
    expect(damageRadii(rock(100000)).fires).toBeLessThanOrEqual((Math.PI / 2) * 6.371e6);
    const air = damageRadii(rock(60));
    expect(air.scorch).toBe(0);
    expect(air.fires).toBe(0);
    expect(air.flattened).toBeGreaterThan(0);
  });
});

describe("crater shape", () => {
  it("has no crater for airbursts", () => {
    expect(craterVisual(rock(30))).toBeNull();
  });

  it("picks the crater type from the model", () => {
    expect(craterVisual(rock(100)).kind).toBe("simple");
    expect(craterVisual(rock(1000)).kind).toBe("complex");
    expect(craterVisual(rock(1000, { surface: "water" })).kind).toBe("water");
    expect(craterVisual(rock(100000)).peakRing).toBe(true);
    expect(craterVisual(rock(1000)).peakRing).toBe(false);
  });

  it("handles a melt province with no final crater", () => {
    const result = rock(1000);
    result.crater = { transientDiameterM: 2e6, finalDiameterM: null, depthM: null, type: "melt-province" };
    const v = craterVisual(result);
    expect(v.kind).toBe("melt");
    expect(v.radiusM).toBe(1e6);
    expect(Number.isFinite(finalHeight(0.5, v))).toBe(true);
  });

  it("matches the model's size and exaggerates flat craters to a readable depth", () => {
    const result = rock(100000);
    const v = craterVisual(result);
    expect(v.radiusM * 2).toBeCloseTo(result.crater.finalDiameterM, 0);
    expect(v.depthM).toBeCloseTo(result.crater.depthM, 6);
    const shown = (v.depthM * v.exaggeration) / (2 * v.radiusM);
    expect(shown).toBeGreaterThan(TARGET_DEPTH_RATIO / 2);
    expect(shown).toBeLessThan(TARGET_DEPTH_RATIO * 2);
    // A small simple crater is already deep enough.
    expect(craterVisual(rock(100)).exaggeration).toBe(1);
  });

  it("rounds exaggeration to readable factors", () => {
    expect(niceFactor(0.5)).toBe(1);
    expect(niceFactor(28)).toBe(30);
    expect(niceFactor(7)).toBe(5);
    expect(niceFactor(8)).toBe(10);
  });

  it("is continuous, reaches the floor and fades to zero at the patch edge", () => {
    for (const d of [100, 1000, 100000]) {
      const v = craterVisual(rock(d));
      expect(finalHeight(0, v)).toBeLessThan(0);
      expect(finalHeight(v.edgeFrac, v)).toBeCloseTo(0, 6);
      expect(finalHeight(1, v)).toBeCloseTo(v.rimM, 6);
      const step = 1e-4;
      for (let x = step; x < v.edgeFrac; x += 0.01) {
        const jump = Math.abs(finalHeight(x + step, v) - finalHeight(x, v));
        expect(jump).toBeLessThan(v.depthM * 0.05);
      }
    }
  });

  it("keeps the floor depth right for simple craters", () => {
    const v = craterVisual(rock(100));
    expect(v.rimM - finalHeight(0, v)).toBeCloseTo(v.depthM, 6);
  });

  it("grows the transient cavity from nothing", () => {
    const v = craterVisual(rock(1000));
    expect(transientHeight(0, v, 0)).toBe(0);
    expect(transientHeight(0, v, 1)).toBeCloseTo(-v.transientDepthM, 6);
    expect(transientHeight(v.edgeFrac, v, 1)).toBeCloseTo(0, 6);
  });
});

describe("aftermath clock", () => {
  it("starts at zero and ends at the blast's arrival at the outermost zone", () => {
    for (const d of [30, 100, 1000, 100000]) {
      const run = runFor(rock(d));
      expect(simulatedSeconds(APPROACH_SECONDS, run)).toBeCloseTo(0, 6);
      expect(simulatedSeconds(TOTAL_SECONDS, run) / aftermathRealSeconds(run)).toBeCloseTo(1, 6);
    }
  });

  it("only moves forward", () => {
    const run = runFor(rock(100000));
    let prev = -Infinity;
    for (let t = 0; t <= TOTAL_SECONDS; t += 0.05) {
      const s = simulatedSeconds(t, run);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it("gives crater excavation a fifth of the aftermath when it would flash by", () => {
    const run = runFor(rock(100000));
    expect(isTimeLapse(run)).toBe(true);
    const excavation = craterVisual(run.result).excavationSeconds;
    const share = (playbackAt(excavation, run) - APPROACH_SECONDS) / (TOTAL_SECONDS - APPROACH_SECONDS);
    expect(share).toBeCloseTo(0.2, 3);
  });

  it("stays linear when there is no crater or excavation already has room", () => {
    expect(clockScale(0, 100)).toBe(Infinity);
    expect(clockScale(30, 100)).toBe(Infinity);
    const run = runFor(rock(30));
    expect(isTimeLapse(run)).toBe(false);
    const mid = APPROACH_SECONDS + (TOTAL_SECONDS - APPROACH_SECONDS) / 2;
    expect(simulatedSeconds(mid, run) / aftermathRealSeconds(run)).toBeCloseTo(0.5, 6);
  });

  it("inverts playback time", () => {
    const run = runFor(rock(10000));
    for (const t of [5.5, 7, 9.3, 14]) {
      expect(playbackAt(simulatedSeconds(t, run), run)).toBeCloseTo(t, 4);
    }
  });
});

describe("debris", () => {
  it("lands most debris near the crater and only a thin tail far away", () => {
    const minM = 90000;
    const maxM = 18000000;
    const ranges = Array.from({ length: 2000 }, (_, i) => debrisRange((i + 0.5) / 2000, minM, maxM));
    const within = (m) => ranges.filter((r) => r <= m).length / ranges.length;
    expect(Math.min(...ranges)).toBeGreaterThanOrEqual(minM);
    expect(Math.max(...ranges)).toBeLessThanOrEqual(maxM);
    expect(within(minM * 3)).toBeGreaterThan(0.8);
    expect(within(minM * 30)).toBeGreaterThan(0.99);
  });

  it("puts a seabed crater under an ocean impact", () => {
    const v = craterVisual(
      simulateImpact({ diameterM: 1000, density: 3000, velocityKms: 20, angleDeg: 45, surface: "water" }),
    );
    expect(v.kind).toBe("water");
    expect(v.seafloor.radiusM).toBeGreaterThan(0);
    expect(v.seafloor.radiusM).toBeLessThan(v.radiusM * v.edgeFrac);
  });
});
