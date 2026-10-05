import { describe, expect, it } from "vitest";
import {
  exportJson,
  featuredConstellation,
  FEATURED,
  loadSaved,
  loadShared,
  makeConstellation,
  MAX_PATH,
  mergeImported,
  parseImport,
  readSaved,
  sharedId,
  shareQuery,
  sharedFromQuery,
  starCount,
  storeSaved,
} from "./constellations.js";
import { highlightCounts, listRows } from "./highlights.js";

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

function memoryStore() {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = String(v)) };
}

describe("makeConstellation", () => {
  it("keeps tap order, allows closing a loop, and drops consecutive repeats", () => {
    const c = makeConstellation({
      name: "  Kite  ",
      mode: "year",
      path: ["a", "b", "b", "c", "a"],
      asteroids: [rock("a"), rock("b"), rock("c")],
      now: 1,
    });
    expect(c.name).toBe("Kite");
    expect(c.path).toEqual(["a", "b", "c", "a"]);
    expect(starCount(c)).toBe(3);
    expect(c.asteroids.map((a) => a.neo_reference_id)).toEqual(["a", "b", "c"]);
  });

  it("drops bad records and caps the path", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `x${i}`);
    const c = makeConstellation({
      name: "",
      mode: "weird",
      path: [...ids, "bad id!"],
      asteroids: [...ids.map((id) => rock(id)), { neo_reference_id: "bad id!", name: 1 }],
    });
    expect(c.name).toBe("Untitled constellation");
    expect(c.mode).toBe("year");
    expect(c.path).toHaveLength(MAX_PATH);
  });
});

describe("share links", () => {
  it("round-trips through the URL", () => {
    const c = makeConstellation({
      name: "Birthday kite",
      mode: "date",
      path: ["a", "b", "a"],
      asteroids: [rock("a"), rock("b")],
    });
    expect(sharedFromQuery(shareQuery(c))).toEqual({
      name: "Birthday kite",
      mode: "date",
      path: ["a", "b", "a"],
    });
  });

  it("rejects missing, tiny or unsafe links", () => {
    expect(sharedFromQuery("?y=1987")).toBeNull();
    expect(sharedFromQuery("?cs=a")).toBeNull();
    expect(sharedFromQuery("?cs=a.a")).toBeNull();
    expect(sharedFromQuery("?cs=a.<script>")).toBeNull();
    expect(sharedFromQuery("?cs=a.b").name).toBe("Shared constellation");
  });
});

describe("saving and files", () => {
  const kite = makeConstellation({
    name: "Kite",
    mode: "year",
    path: ["a", "b"],
    asteroids: [rock("a"), rock("b")],
  });

  it("saves to and loads from storage", () => {
    const store = memoryStore();
    expect(storeSaved([kite], store)).toBe(true);
    expect(loadSaved(store)).toEqual([kite]);
    expect(loadSaved({ getItem: () => "not json" })).toEqual([]);
    expect(storeSaved([kite], null)).toBe(false);
  });

  it("imports an export and skips duplicates", () => {
    const imported = parseImport(exportJson([kite]));
    expect(imported).toEqual([kite]);
    expect(mergeImported([kite], imported)).toEqual({ list: [kite], added: 0 });
    expect(() => parseImport("{}")).toThrow(/isn't a NEO Atlas export/);
    expect(() => parseImport('{"app":"neo-atlas","constellations":[]}')).toThrow(/No constellations/);
  });
});

describe("featured constellations and the list", () => {
  it("joins featured stars in date order on the decades dial", () => {
    const c = featuredConstellation(FEATURED[0], [
      rock("late", { close_approach_date: "2001-01-01" }),
      rock("early", { close_approach_date: "1950-01-01" }),
    ]);
    expect(c.mode).toBe("date");
    expect(c.path).toEqual(["early", "late"]);
    expect(c.id).toBe("featured-giants");
  });

  it("filters, searches and sorts list rows", () => {
    const rows = [
      rock("1", { name: "Apophis", is_potentially_hazardous: true, miss_distance_km: 300000 }),
      rock("2", { name: "Bennu", is_potentially_hazardous: true, miss_distance_km: 900000 }),
      rock("3", { name: "Small one", estimated_diameter_km: 0.01 }),
    ];
    expect(highlightCounts(rows)).toEqual({ hazardous: 2, inside: 1, large: 0 });
    const ids = (r) => r.map((a) => a.neo_reference_id);
    expect(ids(listRows(rows, { highlight: "hazardous", query: "", sort: "closest" }))).toEqual(["1", "2"]);
    expect(ids(listRows(rows, { highlight: null, query: "ben", sort: "date" }))).toEqual(["2"]);
  });
});

describe("loading a shared link", () => {
  const shared = { name: "Kite", mode: "year", path: ["a", "b", "c", "a"] };
  const notFound = Object.assign(new Error("missing"), { status: 404 });
  const offline = Object.assign(new Error("offline"), { status: 0 });

  it("loads every star and gives the same link the same ID", async () => {
    const r = await loadShared(shared, async (id) => rock(id));
    expect(r.missing).toBe(0);
    expect(r.total).toBe(3);
    expect(r.constellation.path).toEqual(["a", "b", "c", "a"]);
    expect(r.constellation.id).toBe(sharedId(shared));
    expect(sharedId(shared)).not.toBe(sharedId({ ...shared, name: "Other" }));
  });

  it("counts stars that failed instead of quietly dropping them", async () => {
    const r = await loadShared(shared, async (id) => {
      if (id === "c") throw offline;
      return rock(id);
    });
    expect(r.missing).toBe(1);
    expect(r.retryable).toBe(true);
    expect(r.constellation.path).toEqual(["a", "b", "a"]);
  });

  it("has no constellation when under two stars load, and no retry when they aren't in the catalog", async () => {
    const r = await loadShared(shared, async (id) => {
      if (id !== "a") throw notFound;
      return rock(id);
    });
    expect(r.constellation).toBeNull();
    expect(r.missing).toBe(2);
    expect(r.retryable).toBe(false);
  });
});

describe("reading saves", () => {
  it("reads what another tab stored, and returns null when storage can't be read", () => {
    const store = memoryStore();
    const kite = makeConstellation({ name: "Kite", mode: "year", path: ["a", "b"], asteroids: [rock("a"), rock("b")] });
    storeSaved([kite], store);
    expect(readSaved(store)).toEqual([kite]);
    expect(readSaved(null)).toBeNull();
    expect(readSaved({ getItem: () => "{broken" })).toBeNull();
    expect(loadSaved({ getItem: () => "{broken" })).toEqual([]);
  });
});
