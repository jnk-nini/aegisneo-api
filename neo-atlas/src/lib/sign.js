// "Your asteroid sign": a horoscope-style card made from the biggest asteroid
// that passed on a birthday. The numbers are real; the meanings are made up,
// and the card says so.

import { toLunarDistances } from "./format.js";
import { hashString, random } from "./random.js";

const SIGNS = {
  daredevil: {
    title: "The Daredevil",
    motto: "Lives for a near miss.",
    readings: [
      "You like to cut it close. This year, take the leap, just not literally.",
      "Bold moves suit you. Someone is watching you closely, and that's a compliment.",
    ],
    match: "hermit",
  },
  giant: {
    title: "The Giant",
    motto: "Big presence, bigger heart.",
    readings: [
      "People feel your gravity before they see you coming. Use it kindly.",
      "You take up space, and you should. Something big is on its way to you.",
    ],
    match: "pebble",
  },
  sprinter: {
    title: "The Sprinter",
    motto: "Always in a hurry.",
    readings: [
      "You'll get there first, as usual. Remember to look at the view on the way past.",
      "Speed is your love language. A quick message to an old friend lands well today.",
    ],
    match: "daydreamer",
  },
  friend: {
    title: "The Close Friend",
    motto: "Loves a close encounter.",
    readings: [
      "You keep your favourite people near. One of them is thinking about you right now.",
      "Your orbit brings you back to the ones who matter. Make the visit.",
    ],
    match: "wanderer",
  },
  hermit: {
    title: "The Hermit",
    motto: "Needs a little personal space.",
    readings: [
      "You see the big picture from far away. Others ask for your view; give it.",
      "Distance is your superpower. A quiet night does more for you than any party.",
    ],
    match: "daredevil",
  },
  daydreamer: {
    title: "The Daydreamer",
    motto: "Takes the scenic route.",
    readings: [
      "Slow and steady crosses the solar system too. Your timing is better than you think.",
      "You notice what others fly past. Write that idea down today.",
    ],
    match: "sprinter",
  },
  pebble: {
    title: "The Pebble",
    motto: "Small but mighty.",
    readings: [
      "Nobody sees you coming, and that's half the fun. Surprise someone this week.",
      "Size was never the point. You make a big impression anyway.",
    ],
    match: "giant",
  },
  rebel: {
    title: "The Rebel",
    motto: "Hazardous, but misunderstood.",
    readings: [
      "NASA keeps an eye on you, and honestly, so does everyone else. Own it.",
      "Rules are more like guidelines to you. Bend one, gently, today.",
    ],
    match: "friend",
  },
  wanderer: {
    title: "The Wanderer",
    motto: "Goes wherever the orbit leads.",
    readings: [
      "Not all who wander are lost, and you're definitely not. A new path opens soon.",
      "You're at home anywhere in the sky. Say yes to the unexpected plan.",
    ],
    match: "friend",
  },
};

/** Which sign an asteroid's real numbers give, checked in this order. */
function signKey(a) {
  const ld = toLunarDistances(a.miss_distance_km);
  const m = a.estimated_diameter_km * 1000;
  const kmh = a.relative_velocity_km_h;
  if (a.is_potentially_hazardous && ld < 20) return "daredevil";
  if (m >= 1000) return "giant";
  if (kmh >= 90000) return "sprinter";
  if (ld < 5) return "friend";
  if (a.is_potentially_hazardous) return "rebel";
  if (ld > 100) return "hermit";
  if (kmh < 25000) return "daydreamer";
  if (m < 40) return "pebble";
  return "wanderer";
}

/** Three traits, each read straight off one real number. */
function traits(a) {
  const ld = toLunarDistances(a.miss_distance_km);
  const m = a.estimated_diameter_km * 1000;
  const kmh = a.relative_velocity_km_h;
  const size =
    m >= 1000 ? "Big-hearted" : m < 40 ? "Small but mighty" : m < 200 ? "Perfectly pocket-sized" : "Solid as a rock";
  const speed = kmh >= 70000 ? "Always in a hurry" : kmh < 30000 ? "Takes the scenic route" : "Keeps a steady pace";
  const reach =
    ld < 1 ? "Loves a close encounter" : ld < 10 ? "Likes to stay close" : ld > 100 ? "Needs personal space" : "Friendly, from a distance";
  return [size, speed, a.is_potentially_hazardous ? "Hazardous but misunderstood" : reach];
}

/**
 * The sign of the biggest of `asteroids` (a birthday's sky), or null when there are none.
 * The same sky always gives the same sign, reading and lucky number.
 */
export function asteroidSign(asteroids) {
  if (!asteroids?.length) return null;
  const a = asteroids.reduce((best, x) =>
    x.estimated_diameter_km > best.estimated_diameter_km ||
    (x.estimated_diameter_km === best.estimated_diameter_km && x.neo_reference_id < best.neo_reference_id)
      ? x
      : best,
  );
  const key = signKey(a);
  const sign = SIGNS[key];
  const rand = random(hashString(`sign:${a.neo_reference_id}`));
  return {
    key,
    title: sign.title,
    motto: sign.motto,
    reading: sign.readings[Math.floor(rand() * sign.readings.length)],
    traits: traits(a),
    lucky: 1 + Math.floor(rand() * 99),
    match: SIGNS[sign.match].title,
    asteroid: a,
  };
}
