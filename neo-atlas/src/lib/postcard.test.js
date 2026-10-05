import { describe, expect, it } from "vitest";
import { autoConstellation, autoName } from "./auto.js";
import {
  constellationSky,
  makeConstellation,
  MAX_POINTS,
  sharedFromQuery,
  shareQuery,
} from "./constellations.js";
import { skyFromQuery } from "./sky.js";
import {
  cardSubtitle,
  cleanFrom,
  cleanMessage,
  fileName,
  MAX_MESSAGE,
  postcardFromQuery,
  postcardQuery,
  wrapText,
} from "./postcard.js";

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

// A birthday sky: 40 asteroids on 12 May, spread over the years and distances.
const birthday = Array.from({ length: 40 }, (_, i) =>
  rock(`b${i}`, {
    close_approach_date: `${1910 + ((i * 7) % 115)}-05-12`,
    estimated_diameter_km: 0.01 + i * 0.03,
    miss_distance_km: 1e5 * (1 + ((i * 13) % 60)),
    is_potentially_hazardous: i === 39,
  }),
);

describe("the sky a constellation belongs to", () => {
  it("is its one date or one year, and null when mixed", () => {
    const date = makeConstellation({
      name: "A",
      mode: "date",
      path: ["a", "b"],
      asteroids: [rock("a"), rock("b", { close_approach_date: "2001-05-12" })],
    });
    expect(constellationSky(date)).toEqual({ mode: "date", year: null, date: "05-12" });
    const year = makeConstellation({
      name: "B",
      mode: "year",
      path: ["a", "b"],
      asteroids: [rock("a"), rock("b", { close_approach_date: "1987-11-02" })],
    });
    expect(constellationSky(year)).toEqual({ mode: "year", year: 1987, date: null });
    const mixed = makeConstellation({
      name: "C",
      mode: "date",
      path: ["a", "b"],
      asteroids: [rock("a"), rock("b", { close_approach_date: "1987-06-01" })],
    });
    expect(constellationSky(mixed)).toBeNull();
  });

  it("goes in the share link, so the page can load the rest of the sky", () => {
    const c = makeConstellation({
      name: "A",
      mode: "date",
      path: ["a", "b"],
      asteroids: [rock("a"), rock("b")],
    });
    expect(skyFromQuery(shareQuery(c)).sky).toEqual({ mode: "date", year: null, date: "05-12" });
    expect(sharedFromQuery(shareQuery(c)).path).toEqual(["a", "b"]);
  });
});

describe("autoConstellation", () => {
  it("joins the biggest asteroids into one stroke, the same way every time", () => {
    const c = autoConstellation(birthday, "date");
    const again = autoConstellation([...birthday].reverse(), "date");
    expect(c.path).toEqual(again.path);
    expect(c.name).toBe(again.name);
    const used = new Set(c.path);
    expect(used.size).toBe(7);
    expect(used.has("b39")).toBe(true); // the biggest is always the first anchor
    expect(c.path.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(c.asteroids).toHaveLength(7);
  });

  it("gives a different shape on shuffle", () => {
    const shapes = new Set(
      [0, 1, 2, 3].map((n) => autoConstellation(birthday, "date", { shuffle: n }).path.join(".")),
    );
    expect(shapes.size).toBeGreaterThan(1);
  });

  it("needs at least two asteroids", () => {
    expect(autoConstellation([rock("a")], "year")).toBeNull();
    expect(new Set(autoConstellation([rock("a"), rock("b")], "year").path).size).toBe(2);
  });

  it("names it, with a fierier word when a star is hazardous", () => {
    expect(autoName(["a", "b"], false)).toMatch(/^The [A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(autoName(["a", "b"], false)).toBe(autoName(["a", "b"], false));
    expect(["Burning", "Crimson", "Restless", "Wild", "Ember", "Iron"]).toContain(
      autoName(["x"], true).split(" ")[1],
    );
  });
});

describe("postcard text", () => {
  it("keeps a message plain, short and tidy", () => {
    expect(cleanMessage("  Happy   birthday!  ")).toBe("Happy birthday!");
    expect(cleanMessage("a\n\n\n\nb")).toBe("a\n\nb");
    expect(cleanMessage("1\n2\n3\n4\n5\n6\n7")).toBe("1\n2\n3\n4\n5");
    expect(cleanMessage("x".repeat(400))).toHaveLength(MAX_MESSAGE);
    expect(cleanMessage("hi\u202Eevil\u0007")).toBe("hievil");
    // Cutting at the limit never leaves half an emoji.
    expect(Array.from(cleanMessage("🌠".repeat(200)))).toEqual(Array(MAX_MESSAGE).fill("🌠"));
    expect(cleanFrom(" Nini \n the\tgreat ")).toBe("Nini the great");
  });

  it("wraps on words, keeps line breaks, and breaks words too long for a line", () => {
    const measure = (s) => s.length * 10;
    expect(wrapText("one two three", 80, measure)).toEqual(["one two", "three"]);
    expect(wrapText("a\nb", 80, measure)).toEqual(["a", "b"]);
    expect(wrapText("abcdefghijkl", 50, measure)).toEqual(["abcde", "fghij", "kl"]);
  });

  it("says which sky the card shows", () => {
    const date = makeConstellation({
      name: "A",
      mode: "date",
      path: ["a", "b"],
      asteroids: [rock("a"), rock("b")],
    });
    expect(cardSubtitle(date)).toBe("12 May · every year 1910–2024 · 2 asteroids");
    const year = makeConstellation({
      name: "B",
      mode: "year",
      path: ["a", "b"],
      asteroids: [rock("a"), rock("b")],
    });
    expect(cardSubtitle(year)).toBe("The sky of 1987 · 2 asteroids");
    expect(fileName({ name: "The Silver Kite!" })).toBe("neo-atlas-the-silver-kite.png");
    expect(fileName({ name: "✨" })).toBe("neo-atlas-postcard.png");
  });
});

describe("postcard links", () => {
  const c = makeConstellation({
    name: "Kite",
    mode: "date",
    path: ["a", "b"],
    asteroids: [rock("a"), rock("b")],
  });

  it("round-trip the message, sender and look alongside the constellation", () => {
    const query = postcardQuery(c, { message: "Happy birthday!\nLove", from: "Nini", theme: "dusk" });
    expect(postcardFromQuery(query)).toEqual({
      message: "Happy birthday!\nLove",
      from: "Nini",
      theme: "dusk",
    });
    expect(sharedFromQuery(query).path).toEqual(["a", "b"]);
  });

  it("aren't postcards without postcard fields, and fall back to a known look", () => {
    expect(postcardFromQuery(shareQuery(c))).toBeNull();
    expect(postcardFromQuery("?pt=<b>")).toEqual({ message: "", from: "", theme: "midnight" });
    expect(postcardFromQuery("?pm=" + encodeURIComponent("<img src=x>"))).toEqual({
      message: "<img src=x>",
      from: "",
      theme: "midnight",
    });
  });
});
