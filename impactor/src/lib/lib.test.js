import { describe, expect, it } from "vitest";
import { distanceKm, latLonToVector, localFrame, subsolarPoint, vectorToLatLon } from "./geo.js";
import { queryToScenario, scenarioToQuery } from "./share.js";
import { COMPOSITIONS } from "../physics/impact.js";

describe("lat/lon ↔ globe vector", () => {
  it("round-trips points all over the globe", () => {
    for (const [lat, lon] of [
      [0, 0],
      [14.6, 120.98],
      [-33.87, 151.21],
      [64.15, -21.94],
      [-89, 179],
      [45, -179.5],
    ]) {
      const back = vectorToLatLon(latLonToVector(lat, lon));
      expect(back.lat).toBeCloseTo(lat, 6);
      expect(back.lon).toBeCloseTo(lon, 6);
    }
  });

  it("matches the texture layout: north pole is +Y, longitude −180° starts the map", () => {
    expect(latLonToVector(90, 0).y).toBeCloseTo(1, 9);
    // u = 0 on SphereGeometry sits on the −X axis.
    const v = latLonToVector(0, -180);
    expect(v.x).toBeCloseTo(-1, 9);
    expect(v.z).toBeCloseTo(0, 9);
  });

  it("builds an orthonormal east/north/up frame, even at the poles", () => {
    for (const [lat, lon] of [
      [10, 20],
      [90, 0],
      [-90, 0],
    ]) {
      const { up, east, north } = localFrame(latLonToVector(lat, lon));
      expect(up.dot(east)).toBeCloseTo(0, 9);
      expect(up.dot(north)).toBeCloseTo(0, 9);
      expect(east.dot(north)).toBeCloseTo(0, 9);
    }
  });
});

describe("great-circle distance", () => {
  it("Manila to Tokyo is about 3,000 km", () => {
    const d = distanceKm({ lat: 14.5995, lon: 120.9842 }, { lat: 35.6762, lon: 139.6503 });
    expect(d).toBeGreaterThan(2950);
    expect(d).toBeLessThan(3050);
  });
  it("is zero for the same point and symmetric", () => {
    const a = { lat: 10, lon: 20 };
    const b = { lat: -5, lon: 100 };
    expect(distanceKm(a, a)).toBeCloseTo(0, 9);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });
});

describe("sub-solar point", () => {
  it("is near the Tropic of Cancer at the June solstice, over Greenwich at noon UTC", () => {
    const { lat, lon } = subsolarPoint(new Date(Date.UTC(2026, 5, 21, 12, 0)));
    expect(lat).toBeGreaterThan(22.5);
    expect(lat).toBeLessThan(23.5);
    expect(Math.abs(lon)).toBeLessThan(1);
  });
});

describe("share links", () => {
  const scenario = {
    asteroidId: "2099942",
    diameterM: 653.9,
    velocityKms: 11.92,
    angleDeg: 45,
    azimuthDeg: 90,
    composition: "stony",
    target: { lat: 14.6, lon: 120.984 },
  };

  it("round-trips a scenario through the URL", () => {
    const back = queryToScenario(`?${scenarioToQuery(scenario)}`, COMPOSITIONS);
    expect(back).toEqual(scenario);
  });

  it("clamps or rejects hostile values instead of trusting the URL", () => {
    const back = queryToScenario("?a=../../x&d=1e99&v=-5&ang=500&c=plutonium&lat=999&lon=0", COMPOSITIONS);
    expect(back.asteroidId).toBeNull();
    expect(back.diameterM).toBe(100000);
    expect(back.velocityKms).toBe(11);
    expect(back.angleDeg).toBe(90);
    expect(back.composition).toBe("stony");
    expect(back.target.lat).toBe(90);
  });

  it("keeps the extremes of the catalog without clamping them", () => {
    const fastest = { ...scenario, diameterM: 60750, velocityKms: 76.85 };
    const back = queryToScenario(`?${scenarioToQuery(fastest)}`, COMPOSITIONS);
    expect(back.diameterM).toBe(60750);
    expect(back.velocityKms).toBe(76.85);
    const smallest = queryToScenario(`?${scenarioToQuery({ ...scenario, diameterM: 0.8 })}`, COMPOSITIONS);
    expect(smallest.diameterM).toBe(0.8);
  });

  it("ignores links without a scenario", () => {
    expect(queryToScenario("?utm_source=x", COMPOSITIONS)).toBeNull();
  });
});
