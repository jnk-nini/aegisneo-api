import { describe, expect, it } from "vitest";
import { fireColor, plumeState } from "./plumeModel.js";

describe("fireball and mushroom cloud", () => {
  it("rises, spreads into a cap and cools over the aftermath", () => {
    const early = plumeState(0.2, 4);
    const late = plumeState(6, 4);
    expect(late.capY).toBeGreaterThan(early.capY);
    expect(late.capY).toBeLessThanOrEqual(4);
    expect(late.capMajor).toBeGreaterThan(early.capMajor);
    expect(early.heat).toBeGreaterThan(0.9);
    expect(late.heat).toBe(0);
  });

  it("fades in at impact and out before the run ends", () => {
    expect(plumeState(0, 4).opacity).toBe(0);
    expect(plumeState(3, 4).opacity).toBe(1);
    expect(plumeState(10, 4).opacity).toBe(0);
  });

  it("keeps the base surge just behind the blast front", () => {
    expect(plumeState(3, 4, 0.5).surge).toBeCloseTo(0.46);
    expect(plumeState(3, 4, 100).surge).toBeLessThanOrEqual(2.7);
    expect(plumeState(3, 4).surge).toBe(plumeState(3, 4, Infinity).surge);
  });

  it("colours fire from dull red to yellow-white", () => {
    const cold = fireColor(0);
    const hot = fireColor(1);
    expect(cold.y).toBeLessThan(0.1);
    expect(hot.y).toBeGreaterThan(0.8);
    expect(hot.z).toBeGreaterThan(cold.z);
    for (const t of [0, 0.3, 0.6, 1]) {
      const c = fireColor(t);
      expect(c.x).toBeGreaterThanOrEqual(c.y);
      expect(c.y).toBeGreaterThanOrEqual(c.z);
    }
  });
});
