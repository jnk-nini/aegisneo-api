import { describe, expect, it } from "vitest";
import { dayAngle, dayIndex, MONTH_STARTS } from "./calendar.js";

describe("dayIndex", () => {
  it("maps dates onto a fixed 366-day ring regardless of year", () => {
    expect(dayIndex("1987-01-01")).toBe(0);
    expect(dayIndex("2024-02-29")).toBe(59);
    expect(dayIndex("1987-03-01")).toBe(60);
    expect(dayIndex("2001-03-01")).toBe(dayIndex("2000-03-01"));
    expect(dayIndex("1999-12-31")).toBe(365);
  });

  it("rejects malformed or impossible dates", () => {
    for (const bad of ["", null, "1987-13-01", "1987-04-31", "1987-1-1", "not a date"]) {
      expect(dayIndex(bad)).toBeNull();
    }
  });

  it("has a start for every month", () => {
    expect(MONTH_STARTS).toHaveLength(12);
    expect(MONTH_STARTS[11]).toBe(335);
  });
});

describe("dayAngle", () => {
  it("puts January 1 at the top and runs clockwise", () => {
    expect(dayAngle(0)).toBeCloseTo(-Math.PI / 2);
    // A quarter of the way through the ring points right (3 o'clock).
    expect(Math.cos(dayAngle(91.5))).toBeCloseTo(1);
  });
});
