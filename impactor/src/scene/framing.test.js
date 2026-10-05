import { describe, expect, it } from "vitest";
import { simulateImpact } from "../physics/impact.js";
import { closeUpRadiusM, fireballDrawn } from "./framing.js";
import { arc, debrisReachM } from "./impactVisuals.js";

const rock = (diameterM) => simulateImpact({ diameterM, velocityKms: 19, density: 3000, angleDeg: 45 });

describe("framing small and large impacts", () => {
  it("frames an airburst around the burst, high above the ground", () => {
    const burst = rock(30);
    expect(burst.entry.regime).toBe("airburst");
    expect(closeUpRadiusM(burst)).toBeGreaterThanOrEqual(burst.burstAltitudeM * 0.9);
  });

  it("never draws the fireball too small to see, and says when it is enlarged", () => {
    const small = rock(30);
    const { radiusM, boost } = fireballDrawn(small);
    expect(radiusM).toBeGreaterThanOrEqual(closeUpRadiusM(small) * 0.16);
    expect(boost).toBeNull(); // the model gives no fireball for an airburst
    const big = fireballDrawn(rock(10000));
    expect(big.radiusM).toBeCloseTo(rock(10000).fireballRadiusM, 0);
    expect(big.boost).toBe(1);
  });

  it("throws debris farther the bigger the impact, up to most of the globe", () => {
    expect(debrisReachM(5000, 0)).toBe(8000);
    expect(debrisReachM(5000, 1)).toBeGreaterThan(debrisReachM(5000, 0.5));
    expect(debrisReachM(5000, 1)).toBeLessThan(Math.PI * 6.371e6);
    const near = arc(1000);
    expect(near.apexM).toBe(250);
    expect(near.seconds).toBeCloseTo(Math.SQRT2 * Math.sqrt(1000 / 9.81), 6);
    expect(arc(2e7).apexM).toBe(6.371e6 * 0.5);
  });
});
