import { describe, expect, it } from "vitest";
import { angleFraction, DISTANCE_RINGS, placeStar, radiusForKm, starSize } from "./chart.js";
import { formatDate, formatDiameter, formatLD, formatMonthDay, formatSpeed, KM_PER_LD } from "./format.js";
import { DEFAULT_SKY, skyFromQuery, skySearch, skyToQuery, todayMonthDay } from "./sky.js";

const asteroid = (over = {}) => ({
  neo_reference_id: "2162117",
  name: "162117 (1998 SD15)",
  estimated_diameter_km: 0.6391,
  is_potentially_hazardous: false,
  close_approach_date: "1925-01-22",
  relative_velocity_km_h: 71745.401,
  miss_distance_km: 58143623.319,
  absolute_magnitude: 19.14,
  ...over,
});

describe("radiusForKm", () => {
  it("grows with miss distance and puts the Moon's distance on the Moon ring", () => {
    expect(radiusForKm(10000)).toBeLessThan(radiusForKm(KM_PER_LD));
    expect(radiusForKm(KM_PER_LD)).toBeLessThan(radiusForKm(5e7));
    const moonRing = DISTANCE_RINGS.find((r) => r.ld === 1);
    expect(radiusForKm(KM_PER_LD)).toBeCloseTo(moonRing.r);
  });

  it("keeps out-of-range distances inside the dial", () => {
    expect(radiusForKm(0)).toBeGreaterThan(0);
    expect(radiusForKm(1e12)).toBeLessThanOrEqual(82);
  });
});

describe("placement", () => {
  it("uses the day of the year in the year view and the year in the date view", () => {
    const jan = asteroid({ close_approach_date: "1987-01-01" });
    const jul = asteroid({ close_approach_date: "1987-07-01" });
    expect(angleFraction(jan, "year")).toBeLessThan(angleFraction(jul, "year"));
    expect(angleFraction(asteroid({ close_approach_date: "1910-05-12" }), "date")).toBeLessThan(0.01);
    expect(angleFraction(asteroid({ close_approach_date: "2024-05-12" }), "date")).toBeGreaterThan(0.99);
  });

  it("is deterministic and based only on the data", () => {
    expect(placeStar(asteroid(), "year")).toEqual(placeStar(asteroid(), "year"));
    expect(starSize(60)).toBeGreaterThan(starSize(0.001));
  });
});

describe("format", () => {
  it("formats values for people", () => {
    expect(formatLD(KM_PER_LD * 2.345)).toBe("2.3 LD");
    expect(formatLD(KM_PER_LD * 0.0567)).toBe("0.06 LD");
    expect(formatDiameter(0.0453)).toBe("45 m");
    expect(formatDiameter(1.234)).toBe("1.23 km");
    expect(formatSpeed(72000)).toBe("20.0 km/s");
    expect(formatDate("1987-05-12")).toBe("12 May 1987");
    expect(formatMonthDay("02-29")).toBe("29 Feb");
  });
});

describe("sky URL state", () => {
  it("round-trips a year and a date", () => {
    expect(skyFromQuery(skyToQuery({ mode: "year", year: 1987 }, "2162117"))).toEqual({
      sky: { mode: "year", year: 1987, date: null },
      selected: "2162117",
    });
    expect(skyFromQuery(skyToQuery({ mode: "date", date: "05-12" })).sky).toEqual({
      mode: "date",
      year: null,
      date: "05-12",
    });
  });

  it("falls back to the default for bad input", () => {
    for (const bad of ["?y=1800", "?y=abc", "?d=13-01", "?d=02-30", "?a=<script>", ""]) {
      const { sky, selected } = skyFromQuery(bad);
      expect(sky).toEqual(DEFAULT_SKY);
      expect(selected).toBeNull();
    }
  });

  it("builds the API search text", () => {
    expect(skySearch({ mode: "year", year: 1987 })).toBe("1987-");
    expect(skySearch({ mode: "date", date: "05-12" })).toBe("-05-12");
  });

  it("formats today's date", () => {
    expect(todayMonthDay(new Date(2026, 9, 4))).toBe("10-04");
  });
});
