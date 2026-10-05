import { describe, expect, it } from "vitest";
import { autoConstellation } from "./auto.js";
import { makeConstellation, MAX_PATH, sharedFromQuery } from "./constellations.js";
import { cardFactLine, distanceComparison, sizeComparison, speedComparison } from "./facts.js";
import { bridgeIndex, matchConstellation, matchInfo, matchName } from "./match.js";
import {
  calendarFile,
  cardFacts,
  cardSubtitle,
  isSealed,
  nextOccurrence,
  postcardFromQuery,
  postcardQuery,
  timeUntil,
} from "./postcard.js";
import { asteroidSign } from "./sign.js";

const rock = (id, overrides = {}) => ({
  neo_reference_id: id,
  name: `(${id})`,
  estimated_diameter_km: 0.05,
  is_potentially_hazardous: false,
  close_approach_date: "1987-05-12",
  relative_velocity_km_h: 50000,
  miss_distance_km: 20000000,
  absolute_magnitude: 22,
  ...overrides,
});

const sky = (prefix, date, n = 20) =>
  Array.from({ length: n }, (_, i) =>
    rock(`${prefix}${i}`, {
      close_approach_date: `${1910 + ((i * 11) % 115)}-${date}`,
      estimated_diameter_km: 0.02 + i * 0.04,
      miss_distance_km: 2e5 * (1 + ((i * 17) % 50)),
    }),
  );

describe("fun facts", () => {
  it("compare sizes with familiar things", () => {
    expect(sizeComparison(0.012)).toBe("about as long as a bus");
    expect(sizeComparison(0.8)).toBe("as tall as 2 Eiffel Towers");
    expect(sizeComparison(0.99)).toBe("about as tall as the Burj Khalifa");
    expect(sizeComparison(0.0005)).toBe("about as tall as a person");
    expect(sizeComparison(20)).toBe("as tall as 2 Mount Everests");
  });

  it("turn speeds and distances into everyday terms", () => {
    expect(speedComparison(55700)).toBe("London to New York in 6 minutes");
    expect(speedComparison(600000)).toMatch(/seconds$/);
    expect(distanceComparison(100000)).toBe("closer than the Moon");
    expect(distanceComparison(384400 * 34.4)).toBe("34× farther than the Moon");
  });

  it("make one line for a card", () => {
    expect(cardFactLine([])).toBe("");
    expect(cardFactLine([rock("a", { miss_distance_km: 1000 })])).toMatch(/closer than the Moon!$/);
  });
});

describe("asteroid sign", () => {
  it("comes from the biggest asteroid, the same way every time", () => {
    const list = sky("s", "05-12");
    const sign = asteroidSign(list);
    expect(sign.asteroid.neo_reference_id).toBe("s19");
    expect(asteroidSign([...list].reverse())).toEqual(sign);
    expect(sign.traits).toHaveLength(3);
    expect(sign.lucky).toBeGreaterThanOrEqual(1);
    expect(sign.lucky).toBeLessThanOrEqual(99);
    expect(asteroidSign([])).toBeNull();
  });

  it("reads the sign off real numbers", () => {
    expect(asteroidSign([rock("a", { is_potentially_hazardous: true, miss_distance_km: 1e6 })]).title).toBe(
      "The Daredevil",
    );
    expect(asteroidSign([rock("a", { estimated_diameter_km: 2 })]).title).toBe("The Giant");
    expect(asteroidSign([rock("a", { miss_distance_km: 6e7 })]).title).toBe("The Hermit");
  });
});

describe("Star Match", () => {
  const ours = autoConstellation(sky("a", "05-12"), "date");
  const theirs = autoConstellation(sky("b", "10-05"), "date");

  it("keeps the sender's shape and bridges to the receiver's", () => {
    const joined = matchConstellation(ours, theirs);
    expect(joined.path.slice(0, ours.path.length)).toEqual(ours.path);
    expect(new Set(joined.path).size).toBe(14);
    expect(bridgeIndex(joined)).toBe(ours.path.length);
    expect(joined.path.length).toBeLessThanOrEqual(MAX_PATH);
    expect(joined.name).toMatch(/^The [A-Z][a-z]+ & the [A-Z][a-z]+$/);
  });

  it("scores the match the same every time, and travels in a link", () => {
    const joined = matchConstellation(ours, theirs);
    const info = matchInfo(joined);
    expect(info.dates).toEqual(["05-12", "10-05"]);
    expect(info.score).toBeGreaterThanOrEqual(70);
    expect(info.score).toBeLessThanOrEqual(99);
    expect(matchInfo(matchConstellation(ours, theirs))).toEqual(info);
    expect(cardSubtitle(joined)).toBe("12 May + 5 Oct · every year 1910–2024 · 14 asteroids");
    expect(cardFacts(joined)).toMatch(/^Cosmic match \d+%/);
    const link = postcardQuery(joined, { message: "hi", from: "A", theme: "neon" });
    expect(sharedFromQuery(link).path).toEqual(joined.path);
  });

  it("makes birthday twins out of the same sky", () => {
    const twins = matchConstellation(ours, ours);
    expect(twins.path).toEqual(ours.path);
    expect(twins.name).toMatch(/^The Twin /);
    expect(matchInfo(ours)).toBeNull();
    expect(matchName("Fox", "Fox")).toBe("The Twin Foxes");
  });
});

describe("sealed postcards", () => {
  const now = new Date(2026, 9, 5, 12, 0, 0); // 5 Oct 2026, noon, local time

  it("seal until the next birthday", () => {
    expect(nextOccurrence("10-05", now)).toBe("2026-10-05");
    expect(nextOccurrence("12-25", now)).toBe("2026-12-25");
    expect(nextOccurrence("01-02", now)).toBe("2027-01-02");
  });

  it("stay shut until the day, but never for more than a year", () => {
    expect(isSealed("2026-10-06", now)).toBe(true);
    expect(isSealed("2026-10-05", now)).toBe(false);
    expect(isSealed("2026-01-01", now)).toBe(false);
    expect(isSealed("2031-01-01", now)).toBe(false);
    expect(isSealed(null, now)).toBe(false);
    expect(timeUntil("2026-10-07", now)).toEqual({ days: 1, hours: 12, minutes: 0, seconds: 0 });
  });

  it("travel in the link, and only as a date", () => {
    const c = makeConstellation({ name: "K", mode: "date", path: ["a", "b"], asteroids: [rock("a"), rock("b")] });
    const q = postcardQuery(c, { message: "", from: "", theme: "dusk", sealed: "2026-12-25" });
    expect(postcardFromQuery(q).sealed).toBe("2026-12-25");
    expect(postcardFromQuery(`${q.replace("2026-12-25", "soon")}`).sealed).toBeNull();
  });

  it("can be put in a calendar, with the sender's text escaped", () => {
    const ics = calendarFile({ until: "2026-12-25", from: "Sam; hi, there", link: "https://x.test/?a=1" });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261225");
    expect(ics).toContain("SUMMARY:Open your NEO Atlas postcard from Sam\\; hi\\, there");
    expect(ics.split("\r\n").every((line) => !line.includes("\n"))).toBe(true);
  });
});
