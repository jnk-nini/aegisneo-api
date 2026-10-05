// Constellations: asteroids joined by lines, in the order they were tapped.
// There is no database. A constellation lives in three places only:
//   - the share link (name, dial and asteroid IDs in the URL),
//   - this device's localStorage ("My constellations"),
//   - an exported JSON file the visitor can import again.

export const MIN_STARS = 2;
export const MAX_POINTS = 24; // taps in a path; a star may be revisited to close a loop
export const MAX_NAME = 40;
// An export of hundreds of constellations is well under this; anything bigger isn't one.
export const MAX_IMPORT_BYTES = 1_000_000;

const ID = /^[A-Za-z0-9_-]{1,32}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const STORAGE_KEY = "neo-atlas:constellations:v1";
const FILE_APP = "neo-atlas";

/** Ready-made constellations, each one API query over the whole catalog. */
export const FEATURED = [
  {
    key: "giants",
    name: "The Giants",
    blurb: "The seven largest asteroids in the catalog.",
    params: { sort: "diameter", order: "desc", limit: 7 },
  },
  {
    key: "closest",
    name: "Closest Shaves",
    blurb: "The seven closest passes ever recorded here, all well inside the Moon's orbit.",
    params: { sort: "miss_distance", order: "asc", limit: 7 },
  },
  {
    key: "fastest",
    name: "Speed Demons",
    blurb: "The seven fastest flybys, relative to Earth.",
    params: { sort: "velocity", order: "desc", limit: 7 },
  },
  {
    key: "watch",
    name: "The Watch List",
    blurb: "The seven largest asteroids classed as potentially hazardous.",
    params: { hazardous: true, sort: "diameter", order: "desc", limit: 7 },
  },
];

export function cleanName(name, fallback = "Untitled constellation") {
  const clean = String(name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
  return clean || fallback;
}

/** Keeps only the fields the atlas uses, and only if they look right. Null if the record is unusable. */
export function cleanAsteroid(a) {
  if (!a || typeof a !== "object") return null;
  const numbers = [
    "estimated_diameter_km",
    "relative_velocity_km_h",
    "miss_distance_km",
    "absolute_magnitude",
  ];
  if (!ID.test(String(a.neo_reference_id ?? ""))) return null;
  if (typeof a.name !== "string" || !DATE.test(a.close_approach_date ?? "")) return null;
  if (!numbers.every((key) => Number.isFinite(a[key]))) return null;
  return {
    neo_reference_id: String(a.neo_reference_id),
    name: a.name.slice(0, 80),
    estimated_diameter_km: a.estimated_diameter_km,
    is_potentially_hazardous: a.is_potentially_hazardous === true,
    close_approach_date: a.close_approach_date,
    relative_velocity_km_h: a.relative_velocity_km_h,
    miss_distance_km: a.miss_distance_km,
    absolute_magnitude: a.absolute_magnitude,
  };
}

/** The path with consecutive repeats removed and capped, keeping only IDs that are present. */
function cleanPath(path, known) {
  const out = [];
  for (const id of path) {
    if (out.length >= MAX_POINTS) break;
    if (known.has(id) && out[out.length - 1] !== id) out.push(id);
  }
  return out;
}

export const uniqueIds = (path) => [...new Set(path)];

function newId(now) {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Builds a constellation. `path` is the tap order (it may revisit a star);
 * `asteroids` are the records for the stars on it.
 */
export function makeConstellation({ name, mode, path, asteroids, id, created, now = Date.now() }) {
  const records = new Map();
  for (const a of asteroids) {
    const clean = cleanAsteroid(a);
    if (clean) records.set(clean.neo_reference_id, clean);
  }
  const cleanedPath = cleanPath(path, records);
  const used = new Set(cleanedPath);
  return {
    id: typeof id === "string" && ID.test(id) ? id : newId(now),
    name: cleanName(name),
    mode: mode === "date" ? "date" : "year",
    path: cleanedPath,
    asteroids: [...records.values()].filter((a) => used.has(a.neo_reference_id)),
    created: Number.isFinite(created) ? created : now,
  };
}

export const starCount = (c) => uniqueIds(c.path).length;
export const isComplete = (c) => starCount(c) >= MIN_STARS;

/** Featured constellations are joined in date order, so the lines sweep around the dial. */
export function featuredConstellation(def, asteroids) {
  const sorted = [...asteroids].sort((a, b) => a.close_approach_date.localeCompare(b.close_approach_date));
  return makeConstellation({
    id: `featured-${def.key}`,
    name: def.name,
    mode: "date",
    path: sorted.map((a) => a.neo_reference_id),
    asteroids: sorted,
    created: 0,
  });
}

/**
 * The sky a constellation was drawn from: its one year, or its one date across every year.
 * Null when its stars come from more than one (the ready-made constellations).
 */
export function constellationSky(c) {
  const dates = c.asteroids.map((a) => a.close_approach_date);
  if (dates.length === 0) return null;
  if (c.mode === "date") {
    const date = dates[0].slice(5);
    return dates.every((d) => d.slice(5) === date) ? { mode: "date", year: null, date } : null;
  }
  const year = dates[0].slice(0, 4);
  return dates.every((d) => d.startsWith(year)) ? { mode: "year", year: Number(year), date: null } : null;
}

// ---------- Share links ----------

/**
 * "?cn=Name&cm=y&cs=id.id.id&y=1987" — dots, because they never need escaping in a URL.
 * The sky (y or d) lets the page load the rest of that sky behind the constellation.
 */
export function shareQuery(c) {
  const q = new URLSearchParams();
  q.set("cn", c.name);
  q.set("cm", c.mode === "date" ? "d" : "y");
  q.set("cs", c.path.join("."));
  const sky = constellationSky(c);
  if (sky?.mode === "date") q.set("d", sky.date);
  if (sky?.mode === "year") q.set("y", String(sky.year));
  return `?${q}`;
}

/** A stable ID for a shared link, so saving the same link twice doesn't make a copy. */
export function sharedId({ name, mode, path }) {
  let hash = 0;
  for (const ch of `${name}|${mode}|${path.join(".")}`) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
  return `shared-${(hash >>> 0).toString(36)}`;
}

/**
 * Fetches the asteroids of a shared link with `get(id)`. Stars that fail are
 * counted rather than quietly dropped, so the page can say so. `constellation`
 * is null when fewer than two stars loaded; `retryable` is false when every
 * failure was an asteroid the catalog doesn't have.
 */
export async function loadShared(shared, get) {
  const ids = uniqueIds(shared.path);
  const results = await Promise.allSettled(ids.map((id) => get(id)));
  const asteroids = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const failures = results.filter((r) => r.status === "rejected").map((r) => r.reason);
  const constellation = makeConstellation({ ...shared, id: sharedId(shared), asteroids });
  return {
    constellation: isComplete(constellation) ? constellation : null,
    missing: failures.length,
    total: ids.length,
    retryable: failures.some((err) => err?.status !== 404),
  };
}

/** Reads a shared constellation from a URL query. Null if there isn't a valid one. */
export function sharedFromQuery(search) {
  const q = new URLSearchParams(search);
  if (!q.has("cs")) return null;
  const path = (q.get("cs") || "").split(".").filter(Boolean);
  if (!path.every((id) => ID.test(id))) return null;
  const cleaned = cleanPath(path, new Set(path));
  if (uniqueIds(cleaned).length < MIN_STARS) return null;
  return {
    name: cleanName(q.get("cn"), "Shared constellation"),
    mode: q.get("cm") === "d" ? "date" : "year",
    path: cleaned,
  };
}

// ---------- This device ----------

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function fromJson(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && typeof c === "object" && Array.isArray(c.path) && Array.isArray(c.asteroids))
    .map((c) => makeConstellation(c))
    .filter(isComplete);
}

/** The saved list as stored right now, or null if storage can't be read. */
export function readSaved(store = storage()) {
  try {
    if (!store) return null;
    return fromJson(JSON.parse(store.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return null;
  }
}

export function loadSaved(store = storage()) {
  return readSaved(store) ?? [];
}

/** Returns false if the browser refused (private mode, storage full). */
export function storeSaved(list, store = storage()) {
  try {
    if (!store) return false;
    store.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// ---------- Export / import ----------

export function exportJson(list) {
  return JSON.stringify({ app: FILE_APP, version: 1, constellations: list }, null, 2);
}

/** Parses an exported file. Throws an Error with a readable message if it isn't one. */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a NEO Atlas export.");
  }
  if (!data || data.app !== FILE_APP || !Array.isArray(data.constellations)) {
    throw new Error("That file isn't a NEO Atlas export.");
  }
  const list = fromJson(data.constellations);
  if (list.length === 0) throw new Error("No constellations were found in that file.");
  return list;
}

/** Adds imported constellations, skipping any already saved. Returns the new list and how many were added. */
export function mergeImported(saved, imported) {
  const ids = new Set(saved.map((c) => c.id));
  const fresh = imported.filter((c) => !ids.has(c.id));
  return { list: [...fresh, ...saved], added: fresh.length };
}
