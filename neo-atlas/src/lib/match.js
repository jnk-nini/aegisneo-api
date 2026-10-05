// Star Match: the person who receives a birthday postcard adds their own
// birthday, and the two constellations are joined into one. Everything needed
// is in the constellation itself, so a match travels in a link like any other.

import { joinStars, NOUNS } from "./auto.js";
import { placeStar } from "./chart.js";
import { makeConstellation } from "./constellations.js";
import { hashString, random } from "./random.js";

const monthDay = (a) => a.close_approach_date.slice(5);
const year = (a) => Number(a.close_approach_date.slice(0, 4));

/** The last word of "The Silver Kite", if it's one of ours; otherwise one picked from `seed`. */
function nounOf(name, seed) {
  const last = String(name ?? "")
    .trim()
    .split(/\s+/)
    .pop();
  if (NOUNS.includes(last)) return last;
  return NOUNS[Math.floor(random(hashString(seed))() * NOUNS.length)];
}

const pluralNoun = (noun) => (/(x|s|ch|sh)$/.test(noun) ? `${noun}es` : `${noun}s`);

/** "The Ladder & the Kite", or "The Twin Kites" when both halves share a word. */
export function matchName(a, b) {
  return a === b ? `The Twin ${pluralNoun(a)}` : `The ${a} & the ${b}`;
}

/**
 * Joins `base` (the constellation someone sent, from one birthday) with `partner`
 * (the one made for the receiver's birthday). The sender's shape is kept exactly;
 * a bridge runs from its last star to the nearest of the receiver's, which are then
 * joined into one stroke. Null if either is missing.
 */
export function matchConstellation(base, partner) {
  if (!base || !partner) return null;
  const known = new Set(base.path);
  const theirs = partner.asteroids.filter((a) => !known.has(a.neo_reference_id));
  const nounA = nounOf(base.name, base.path.join("."));
  const nounB = nounOf(partner.name, partner.path.join("."));

  // Birthday twins: the receiver's stars are the sender's own.
  if (theirs.length === 0) {
    return makeConstellation({
      name: matchName(nounA, nounA),
      mode: "date",
      path: base.path,
      asteroids: base.asteroids,
    });
  }

  const byId = new Map(base.asteroids.map((a) => [a.neo_reference_id, a]));
  const last = placeStar(byId.get(base.path[base.path.length - 1]), "date");
  const stars = theirs
    .map((a) => placeStar(a, "date"))
    .sort((p, q) => Math.hypot(p.x - last.x, p.y - last.y) - Math.hypot(q.x - last.x, q.y - last.y));

  return makeConstellation({
    name: matchName(nounA, nounB === nounA ? NOUNS[(NOUNS.indexOf(nounA) + 1) % NOUNS.length] : nounB),
    mode: "date",
    path: [...base.path, ...joinStars(stars)],
    asteroids: [...base.asteroids, ...theirs],
  });
}

/**
 * What makes a constellation a match: stars from exactly two birthdays.
 * Returns the two dates, a playful score (it's the same every time for the same
 * stars), and the closest pair of years. Null for anything else.
 */
export function matchInfo(c) {
  if (c?.mode !== "date") return null;
  const dates = [...new Set(c.asteroids.map(monthDay))];
  if (dates.length !== 2) return null;
  // The dates in path order: the sender's half comes first.
  const first = monthDay(c.asteroids.find((a) => a.neo_reference_id === c.path[0]) ?? c.asteroids[0]);
  const [a, b] = first === dates[0] ? dates : [dates[1], dates[0]];
  const ours = c.asteroids.filter((x) => monthDay(x) === a);
  const theirs = c.asteroids.filter((x) => monthDay(x) === b);

  let pair = null;
  for (const x of ours) {
    for (const y of theirs) {
      const gap = Math.abs(year(x) - year(y));
      if (!pair || gap < pair.gap) pair = { gap, years: [year(x), year(y)] };
    }
  }
  const spark = hashString(`${a}|${b}|${c.path.join(".")}`) % 10;
  const score = Math.min(99, 70 + Math.max(0, 10 - pair.gap) * 2 + spark);
  const line =
    pair.gap === 0
      ? `Your stars passed Earth in the same year: ${pair.years[0]}!`
      : `Your closest stars passed Earth ${pair.gap} year${pair.gap === 1 ? "" : "s"} apart, in ${pair.years[0]} and ${pair.years[1]}.`;
  const short =
    pair.gap === 0
      ? `stars in the same year, ${pair.years[0]}`
      : `closest stars ${pair.gap} yr apart (${pair.years[0]} & ${pair.years[1]})`;
  return { dates: [a, b], score, pair, line, short };
}

/** Where the bridge between the two halves is: the index of its far end in the path, or -1. */
export function bridgeIndex(c) {
  const info = matchInfo(c);
  if (!info) return -1;
  const dateOf = new Map(c.asteroids.map((a) => [a.neo_reference_id, monthDay(a)]));
  return c.path.findIndex((id, i) => i > 0 && dateOf.get(c.path[i - 1]) !== dateOf.get(id));
}
