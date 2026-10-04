import { describe, expect, it } from "vitest";
import {
  atmosphericEntrySpeed,
  blastArrivalSeconds,
  kineticEnergy,
  mercalliFor,
  pancakeIntegral,
  peakOverpressure,
  peakWindSpeed,
  recurrenceYears,
  simulateImpact,
} from "./impact.js";
import { GLOBAL_RANGE_M, zonesFor } from "./zones.js";
import { formatYears } from "../lib/format.js";

const km = (m) => m / 1000;
const radius = (list, key) => list.find((z) => z.key === key)?.radiusM ?? 0;

describe("entry speed", () => {
  it("adds Earth's escape velocity in quadrature", () => {
    expect(atmosphericEntrySpeed(0)).toBeCloseTo(11.19, 2);
    expect(atmosphericEntrySpeed(15)).toBeCloseTo(Math.sqrt(15 ** 2 + 11.19 ** 2), 6);
  });
});

describe("pancake integral", () => {
  it("matches the closed form of Collins et al. Eq. 19 at the airburst altitude", () => {
    const H = 8000;
    const L0 = 50;
    const l = 3000;
    const fp = 7;
    const zStar = 40000;
    const zb = zStar - 2 * H * Math.log(1 + (l / (2 * H)) * Math.sqrt(fp ** 2 - 1));
    const alpha = Math.sqrt(fp ** 2 - 1);
    const closedForm =
      ((l * L0 ** 2) / 24) * alpha * (8 * (3 + alpha ** 2) + 3 * alpha * (l / H) * (2 + alpha ** 2));
    expect(pancakeIntegral(zb, zStar, L0, l) / closedForm).toBeCloseTo(1, 4);
  });
});

describe("air blast", () => {
  it("gives the 1 kt surface-burst crossover pressure at 290 m", () => {
    // Eq. 54 at r1 = rx: p = px/4 · (1 + 3) = px
    expect(peakOverpressure(290, 4.184e12, 0)).toBeCloseTo(75000, 0);
  });
  it("matches the Table 4 distances for a 1 kt surface burst within ~15%", () => {
    const E = 4.184e12;
    for (const [distance, pressure] of [
      [389, 42600],
      [502, 26800],
      [1160, 6900],
    ]) {
      expect(peakOverpressure(distance, E, 0) / pressure).toBeGreaterThan(0.85);
      expect(peakOverpressure(distance, E, 0) / pressure).toBeLessThan(1.15);
    }
  });
  it("converts overpressure to wind speed (Eq. 59)", () => {
    expect(peakWindSpeed(0)).toBe(0);
    expect(peakWindSpeed(42600)).toBeGreaterThan(62);
  });
  it("assumes sound speed for arrival time", () => {
    expect(blastArrivalSeconds(330)).toBeCloseTo(1, 6);
  });
});

describe("historical events", () => {
  it("Chelyabinsk 2013: ~0.5 Mt airburst in the upper atmosphere", () => {
    const r = simulateImpact({ diameterM: 19, density: 3300, velocityKms: 19.16, angleDeg: 18.3 });
    expect(r.energy.megatons).toBeGreaterThan(0.4);
    expect(r.energy.megatons).toBeLessThan(0.65);
    expect(r.entry.regime).toBe("airburst");
    expect(km(r.entry.airburstAltitudeM)).toBeGreaterThan(15);
    expect(km(r.entry.airburstAltitudeM)).toBeLessThan(45);
    expect(r.crater).toBeNull();
    // Measured ground overpressure was a few kPa: enough to break weak panes,
    // well below the levels that collapse buildings.
    expect(r.groundZeroPressurePa).toBeGreaterThan(500);
    expect(r.groundZeroPressurePa).toBeLessThan(10000);
    expect(radius(r.blast, "wood")).toBe(0);
  });

  it("Tunguska 1908: ~10 Mt airburst a few km up, forest flattened over tens of km", () => {
    const r = simulateImpact({ diameterM: 60, density: 3000, velocityKms: 20, angleDeg: 45 });
    expect(r.energy.megatons).toBeGreaterThan(5);
    expect(r.energy.megatons).toBeLessThan(25);
    expect(r.entry.regime).toBe("airburst");
    expect(km(r.entry.airburstAltitudeM)).toBeGreaterThan(2);
    expect(km(r.entry.airburstAltitudeM)).toBeLessThan(15);
    // ~2,150 km² of forest was flattened (equivalent radius ≈ 26 km).
    expect(km(radius(r.wind, "trees90"))).toBeGreaterThan(10);
    expect(km(radius(r.wind, "trees90"))).toBeLessThan(45);
  });

  it("Meteor Crater: iron impactor makes a ~1.2 km simple crater", () => {
    const r = simulateImpact({ diameterM: 50, density: 7800, velocityKms: 17, angleDeg: 45 });
    expect(r.entry.regime).not.toBe("airburst");
    expect(r.crater.type).toBe("simple");
    expect(km(r.crater.finalDiameterM)).toBeGreaterThan(0.7);
    expect(km(r.crater.finalDiameterM)).toBeLessThan(2);
  });

  it("Chicxulub: a 10 km body makes a complex crater 100–250 km wide", () => {
    const r = simulateImpact({ diameterM: 10000, density: 2700, velocityKms: 20, angleDeg: 45 });
    expect(r.energy.megatons).toBeGreaterThan(1e7);
    expect(r.entry.regime).toBe("intact");
    expect(r.crater.type).toBe("complex");
    expect(km(r.crater.finalDiameterM)).toBeGreaterThan(100);
    expect(km(r.crater.finalDiameterM)).toBeLessThan(250);
    expect(r.seismic.magnitude).toBeGreaterThan(9.5);
    expect(r.thermal.length).toBeGreaterThan(0);
  });
});

describe("scenario behaviour", () => {
  it("small rocky bodies burn up high instead of cratering", () => {
    const r = simulateImpact({ diameterM: 5, density: 3000, velocityKms: 18, angleDeg: 45 });
    expect(r.entry.regime).toBe("airburst");
    expect(r.crater).toBeNull();
    expect(r.seismic).toBeNull();
  });

  it("ocean water slows the impactor, so the seafloor crater is smaller than on land", () => {
    const params = { diameterM: 400, density: 3000, velocityKms: 20, angleDeg: 45 };
    const land = simulateImpact(params);
    const ocean = simulateImpact({ ...params, surface: "water", waterDepthM: 3700 });
    expect(ocean.waterCrater.transientDiameterM).toBeGreaterThan(0);
    expect(ocean.crater.finalDiameterM).toBeLessThan(land.crater.finalDiameterM);
    expect(ocean.seismic.magnitude).toBeLessThan(land.seismic.magnitude);
  });

  it("energy grows with the cube of diameter and square of speed", () => {
    const base = kineticEnergy(100, 3000, 20000);
    expect(kineticEnergy(200, 3000, 20000) / base).toBeCloseTo(8, 6);
    expect(kineticEnergy(100, 3000, 40000) / base).toBeCloseTo(4, 6);
  });

  it("larger impacts are rarer", () => {
    expect(recurrenceYears(1000)).toBeGreaterThan(recurrenceYears(1));
  });

  it("maps magnitude to Mercalli intensity", () => {
    expect(mercalliFor(6.5)).toBe("VII–VIII");
    expect(mercalliFor(9.5)).toBe("XII");
  });

  it("returns blast zones ordered from strongest to weakest", () => {
    const r = simulateImpact({ diameterM: 300, density: 3000, velocityKms: 20, angleDeg: 45 });
    const radii = r.blast.map((z) => z.radiusM);
    expect([...radii].sort((a, b) => a - b)).toEqual(radii);
  });
  it("labels zones past a quarter of the globe as global instead of a range", () => {
    // Roughly Ganymed, the largest catalog object.
    const r = simulateImpact({ diameterM: 60750, density: 3000, velocityKms: 20, angleDeg: 45 });
    const zones = zonesFor(r);
    const windows = zones.find((z) => z.key === "windows");
    expect(windows.radiusM).toBeGreaterThanOrEqual(GLOBAL_RANGE_M);
    expect(windows.global).toBe(true);
    const local = zonesFor(simulateImpact({ diameterM: 100, density: 3000, velocityKms: 20, angleDeg: 45 }));
    expect(local.some((z) => z.global)).toBe(false);
  });

  it("describes recurrence longer than Earth's age without a number", () => {
    expect(formatYears(11e9)).toBe("rarer than once in Earth's 4.5-billion-year history");
    expect(formatYears(5000)).toBe("about once every 5,000 years");
  });
});
