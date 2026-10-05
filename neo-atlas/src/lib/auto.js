// "Make one for me": a constellation joined automatically from a sky's biggest
// asteroids, with a made-up name. The same sky always gives the same shape, so
// a birthday always gets its own constellation; Shuffle asks for another.

import { placeStar } from "./chart.js";
import { makeConstellation } from "./constellations.js";
import { hashString, random } from "./random.js";

const POOL = 32; // only the biggest asteroids of the sky are candidates
const MIN_GAP = 14; // dial units kept between chosen stars where possible, so the shape is readable
const DEFAULT_STARS = 7;

const CALM = [
  "Silver",
  "Wandering",
  "Sleeping",
  "Hidden",
  "Little",
  "Distant",
  "Restless",
  "Golden",
  "Quiet",
  "Swift",
  "Lonely",
  "Midnight",
  "Patient",
  "Hollow",
  "Paper",
];
// Used when one of the stars is potentially hazardous.
const FIERY = ["Burning", "Crimson", "Restless", "Wild", "Ember", "Iron"];
export const NOUNS = [
  "Kite",
  "Serpent",
  "Lantern",
  "Harp",
  "Fox",
  "Crown",
  "Heron",
  "Anchor",
  "Compass",
  "Lyre",
  "Moth",
  "Arrow",
  "Whale",
  "Bridge",
  "Key",
  "Sparrow",
  "Ladder",
  "Bell",
  "Kettle",
  "Owl",
];

const pick = (list, rand) => list[Math.floor(rand() * list.length)];

/** "The Silver Kite"; a constellation with a hazardous star gets a fierier word. */
export function autoName(ids, hazardous) {
  const rand = random(hashString(ids.join(".")));
  return `The ${pick(hazardous ? FIERY : CALM, rand)} ${pick(NOUNS, rand)}`;
}

/** Joins points with the shortest set of lines that connects them all (a minimum spanning tree). */
function spanningTree(points) {
  const n = points.length;
  const inTree = new Array(n).fill(false);
  const best = new Array(n).fill(Infinity);
  const parent = new Array(n).fill(-1);
  const children = Array.from({ length: n }, () => []);
  best[0] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u === -1 || best[i] < best[u])) u = i;
    inTree[u] = true;
    if (parent[u] !== -1) children[parent[u]].push(u);
    for (let v = 0; v < n; v++) {
      const d = Math.hypot(points[u].x - points[v].x, points[u].y - points[v].y);
      if (!inTree[v] && d < best[v]) {
        best[v] = d;
        parent[v] = u;
      }
    }
  }
  return children;
}

/**
 * Walks the tree as one pen stroke, going back over a line where it branches.
 * The deepest branch is drawn last, so the walk can simply stop there.
 */
function treeWalk(children) {
  const depth = (u) => 1 + Math.max(0, ...children[u].map(depth));
  const path = [];
  const visit = (u, last) => {
    path.push(u);
    const kids = [...children[u]].sort((a, b) => depth(a) - depth(b));
    kids.forEach((v, i) => {
      const isLast = last && i === kids.length - 1;
      visit(v, isLast);
      if (!isLast) path.push(u);
    });
  };
  visit(0, true);
  return path;
}

/** Star IDs joined into one pen stroke: the shortest lines that connect them all, starting at the first star. */
export function joinStars(stars) {
  return treeWalk(spanningTree(stars)).map((i) => stars[i].id);
}

/**
 * A constellation made from `asteroids` (one sky), or null if there are fewer than two.
 * Shuffle 0 starts from the biggest asteroid; each further shuffle starts somewhere else
 * among the biggest and joins a different number of stars.
 */
export function autoConstellation(asteroids, mode, { shuffle = 0 } = {}) {
  if (asteroids.length < 2) return null;
  const pool = [...asteroids]
    .sort(
      (a, b) =>
        b.estimated_diameter_km - a.estimated_diameter_km ||
        a.neo_reference_id.localeCompare(b.neo_reference_id),
    )
    .slice(0, POOL)
    .map((a) => placeStar(a, mode));

  const rand = random(hashString(`${pool.map((s) => s.id).join(".")}#${shuffle}`));
  const count = Math.min(pool.length, shuffle === 0 ? DEFAULT_STARS : 5 + Math.floor(rand() * 4));
  const anchor = shuffle === 0 ? pool[0] : pool[Math.floor(rand() * pool.length)];
  // The anchor and its nearest big neighbours, skipping any that crowd a star already chosen:
  // the shape stays together without collapsing into a clump.
  const near = [...pool].sort(
    (a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y),
  );
  const chosen = [];
  for (const star of near) {
    if (chosen.length === count) break;
    if (chosen.every((c) => Math.hypot(c.x - star.x, c.y - star.y) >= MIN_GAP)) chosen.push(star);
  }
  for (const star of near) {
    if (chosen.length === count) break;
    if (!chosen.includes(star)) chosen.push(star);
  }

  const path = joinStars(chosen);
  const ids = chosen.map((s) => s.id);
  return makeConstellation({
    name: autoName(
      ids,
      chosen.some((s) => s.hazardous),
    ),
    mode,
    path,
    asteroids: chosen.map((s) => s.data),
  });
}
