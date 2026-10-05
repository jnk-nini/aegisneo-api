// Postcards: a constellation drawn on a 1080×1350 card, with a short message.
// Nothing is uploaded. The picture is drawn on the visitor's device, and the
// message travels in the link, like the rest of a shared constellation.

import { dialSegments, DISTANCE_RINGS, FIRST_YEAR, fractionToAngle, LAST_YEAR, placeStar } from "./chart.js";
import { cleanName, constellationSky, shareQuery, starCount } from "./constellations.js";
import { cardFactLine } from "./facts.js";
import { formatDiameter, formatMonthDay, plural } from "./format.js";
import { bridgeIndex, matchInfo } from "./match.js";
import { hashString, random } from "./random.js";

export const CARD_W = 1080;
export const CARD_H = 1350;
export const MAX_MESSAGE = 160;
export const MAX_FROM = 30;
const MAX_MESSAGE_LINES = 5;

export const THEMES = {
  midnight: {
    label: "Midnight",
    bg: ["#16224d", "#0b1430", "#060b1d"],
    rule: "rgba(201, 164, 92, 0.8)",
    ruleSoft: "rgba(201, 164, 92, 0.3)",
    text: "#efe4c8",
    muted: "#b9b199",
    accent: "#e2c27f",
    line: "#e2c27f",
    line2: "#9cc7ec",
    star: "#f4ead2",
    hazard: "#ef7b5f",
    earth: "#9cc7ec",
    glow: 1,
  },
  dusk: {
    label: "Dusk",
    bg: ["#57294f", "#2e1634", "#150a1b"],
    rule: "rgba(246, 184, 142, 0.8)",
    ruleSoft: "rgba(246, 184, 142, 0.3)",
    text: "#fbe9dc",
    muted: "#d6b6aa",
    accent: "#f7c391",
    line: "#ffd3a8",
    line2: "#a9d4f5",
    star: "#fff3e9",
    hazard: "#ff8070",
    earth: "#a9d4f5",
    glow: 1,
  },
  neon: {
    label: "Neon",
    bg: ["#3a0d6b", "#1a0538", "#08011c"],
    rule: "rgba(255, 79, 216, 0.85)",
    ruleSoft: "rgba(255, 79, 216, 0.32)",
    text: "#fdf0ff",
    muted: "#d4b3ea",
    accent: "#7ff9ff",
    line: "#ff5ade",
    line2: "#7ff9ff",
    star: "#ffffff",
    hazard: "#ffb347",
    earth: "#7ff9ff",
    glow: 1.9,
  },
  aurora: {
    label: "Aurora",
    bg: ["#10424d", "#0a2232", "#040c17"],
    rule: "rgba(125, 255, 196, 0.75)",
    ruleSoft: "rgba(125, 255, 196, 0.26)",
    text: "#eafff6",
    muted: "#a9cdc3",
    accent: "#7dffc4",
    line: "#a4ffd8",
    line2: "#d4b6ff",
    star: "#f4fffb",
    hazard: "#ff8f7a",
    earth: "#9cc7ec",
    glow: 1.3,
    aurora: true,
  },
  bubblegum: {
    label: "Bubblegum",
    bg: ["#fff0f7", "#ffd6ea", "#f6b3d4"],
    rule: "rgba(122, 32, 84, 0.7)",
    ruleSoft: "rgba(122, 32, 84, 0.24)",
    text: "#4a1236",
    muted: "#7e4a66",
    accent: "#c2185b",
    line: "#d6337f",
    line2: "#3a6fd8",
    star: "#4a1236",
    hazard: "#e0442b",
    earth: "#3a6fd8",
    glow: 0.4,
  },
  parchment: {
    label: "Parchment",
    bg: ["#f8f0dc", "#efe4c8", "#d9c8a3"],
    rule: "rgba(27, 42, 85, 0.75)",
    ruleSoft: "rgba(27, 42, 85, 0.25)",
    text: "#1b2a55",
    muted: "#5a5866",
    accent: "#8a6420",
    line: "#9c7224",
    line2: "#3f7fb5",
    star: "#1b2a55",
    hazard: "#b23a2a",
    earth: "#3f7fb5",
    glow: 0.35,
  },
};
export const DEFAULT_THEME = "midnight";
/** The looks in the order a swipe goes through them. */
export const THEME_ORDER = Object.keys(THEMES);

// Bidirectional-text controls could make a message display differently from what was typed.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u0009\u000B-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const cut = (text, max) => Array.from(text).slice(0, max).join(""); // never splits an emoji

/** The message as it will be shown: plain text, at most 160 characters and 5 lines. */
export function cleanMessage(text) {
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").replace(UNSAFE, "").trim());
  const kept = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .split("\n")
    .slice(0, MAX_MESSAGE_LINES);
  return cut(kept.join("\n"), MAX_MESSAGE).trim();
}

export function cleanFrom(text) {
  return cut(
    String(text ?? "")
      .replace(/\s+/g, " ")
      .replace(UNSAFE, "")
      .trim(),
    MAX_FROM,
  ).trim();
}

const cleanTheme = (theme) => (Object.hasOwn(THEMES, theme) ? theme : DEFAULT_THEME);

// ---------- Sealed postcards ----------

const pad = (n) => String(n).padStart(2, "0");
const SEAL_MAX_DAYS = 367;

/** "2026-10-05": a date in the visitor's own time zone. */
export function localISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The next time "MM-DD" comes round, as "YYYY-MM-DD": today if it is today.
 * 29 February falls on 1 March in other years.
 */
export function nextOccurrence(mmdd, now = new Date()) {
  const [m, d] = mmdd.split("-").map(Number);
  const today = localISO(now);
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const iso = localISO(new Date(year, m - 1, d));
    if (iso >= today) return iso;
  }
  return null;
}

/** Whether a postcard sealed until `until` ("YYYY-MM-DD") is still sealed. A seal more than a year off is ignored. */
export function isSealed(until, now = new Date()) {
  if (!until) return false;
  const today = localISO(now);
  const limit = new Date(now);
  limit.setDate(limit.getDate() + SEAL_MAX_DAYS);
  return until > today && until <= localISO(limit);
}

/** Time left until local midnight at the start of `until`, in whole units. */
export function timeUntil(until, now = new Date()) {
  const [y, m, d] = until.split("-").map(Number);
  const ms = Math.max(0, new Date(y, m - 1, d).getTime() - now.getTime());
  const s = Math.floor(ms / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor(s / 3600) % 24, minutes: Math.floor(s / 60) % 60, seconds: s % 60 };
}

/** A calendar file (.ics) that reminds the receiver to open the postcard on the day. */
export function calendarFile({ until, from, link }) {
  const escape = (text) => text.replace(/[\\;,]/g, (ch) => `\\${ch}`).replace(/\n/g, "\\n");
  const day = until.replaceAll("-", "");
  const who = from ? ` from ${from}` : "";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NEO Atlas//Postcards//EN",
    "BEGIN:VEVENT",
    `UID:${day}-${hashString(link).toString(36)}@neo-atlas`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${day}`,
    `SUMMARY:${escape(`Open your NEO Atlas postcard${who}`)}`,
    `DESCRIPTION:${escape(`It opens today: ${link}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

// ---------- Links ----------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A share link for the constellation that also opens it as this postcard (sealed until `sealed`, if set). */
export function postcardQuery(c, { message, from, theme, sealed = null }) {
  const q = new URLSearchParams(shareQuery(c));
  const m = cleanMessage(message);
  const f = cleanFrom(from);
  if (m) q.set("pm", m);
  if (f) q.set("pf", f);
  q.set("pt", cleanTheme(theme));
  if (sealed && ISO_DATE.test(sealed)) q.set("ps", sealed);
  return `?${q}`;
}

/** The postcard part of a link, or null if the link isn't a postcard. */
export function postcardFromQuery(search) {
  const q = new URLSearchParams(search);
  if (!q.has("pt") && !q.has("pm") && !q.has("pf")) return null;
  const sealed = ISO_DATE.test(q.get("ps") ?? "") ? q.get("ps") : null;
  return {
    message: cleanMessage(q.get("pm")),
    from: cleanFrom(q.get("pf")),
    theme: cleanTheme(q.get("pt")),
    sealed,
  };
}

// ---------- What the card says ----------

/** "12 May · every year 1910–2024 · 7 asteroids", "The sky of 1987 · 6 asteroids". */
export function cardSubtitle(c) {
  const sky = constellationSky(c);
  const stars = plural(starCount(c), "asteroid");
  const match = matchInfo(c);
  if (match) return `${match.dates.map(formatMonthDay).join(" + ")} · every year ${FIRST_YEAR}–${LAST_YEAR} · ${stars}`;
  if (sky?.mode === "date")
    return `${formatMonthDay(sky.date)} · every year ${FIRST_YEAR}–${LAST_YEAR} · ${stars}`;
  if (sky?.mode === "year") return `The sky of ${sky.year} · ${stars}`;
  const years = c.asteroids.map((a) => Number(a.close_approach_date.slice(0, 4)));
  return `${Math.min(...years)}–${Math.max(...years)} · ${stars}`;
}

/** The line of facts under the dial: the match score for a Star Match, otherwise the biggest and closest. */
export function cardFacts(c) {
  const match = matchInfo(c);
  if (match) return `Cosmic match ${match.score}% · ${match.short} · just for fun`;
  return cardFactLine(c.asteroids);
}

/** What a screen reader hears for the card. */
export function cardDescription(c, { message, from }) {
  const parts = [`Postcard: the constellation ${c.name}, ${cardSubtitle(c)}.`];
  if (message) parts.push(`Message: ${message}`);
  if (from) parts.push(`From ${from}.`);
  return parts.join(" ");
}

export function fileName(c) {
  const slug = c.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `neo-atlas-${slug || "postcard"}.png`;
}

/**
 * Splits text into lines no wider than `maxWidth`, keeping the writer's line
 * breaks. `measure(text)` returns a width. A word too long for a line is broken.
 */
export function wrapText(text, maxWidth, measure) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ").filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const ch of Array.from(word)) {
        if (line && measure(line + ch) > maxWidth) {
          lines.push(line);
          line = "";
        }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

// ---------- Drawing ----------

export const FONT_DISPLAY = '"Cormorant Garamond Variable", "Cormorant Garamond", Georgia, serif';
export const FONT_BODY = '"Manrope Variable", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono Variable", ui-monospace, monospace';

/** Waits for the card's fonts, so the first picture isn't drawn in a fallback font. */
export async function loadCardFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`600 72px ${FONT_DISPLAY}`),
    document.fonts.load(`italic 500 48px ${FONT_DISPLAY}`),
    document.fonts.load(`600 24px ${FONT_BODY}`),
    document.fonts.load(`700 24px ${FONT_BODY}`),
    document.fonts.load(`500 20px ${FONT_MONO}`),
  ]).catch(() => {});
}

export function setSpacing(ctx, px) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

/** Shrinks the font until `text` fits in `maxWidth`. */
export function fitFont(ctx, text, maxWidth, size, minSize, font) {
  let s = size;
  ctx.font = font(s);
  while (s > minSize && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = font(s);
  }
  return s;
}

export function sparkle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** Lines of `text` in the largest italic size (from `max` down to `min`) that fits the box, centered in it. */
export function drawWrapped(ctx, text, { x, top, bottom, width, max, min, font }) {
  let size = max;
  let lines;
  for (;;) {
    ctx.font = font(size);
    lines = wrapText(text, width, (s) => ctx.measureText(s).width);
    if (lines.length * size * 1.18 <= bottom - top || size <= min) break;
    size -= 2;
  }
  const lineHeight = size * 1.18;
  const maxLines = Math.max(1, Math.floor((bottom - top) / lineHeight));
  if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1]}…`];
  const start = top + (bottom - top - lines.length * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, start + (i + 0.8) * lineHeight));
}

const DIAL = { x: CARD_W / 2, y: 616, scale: 3.02 }; // the dial's 104-unit rim is ~314 px

export function drawBackground(ctx, t, seed, avoid = { x: DIAL.x, y: DIAL.y, r: 104 * DIAL.scale + 18 }) {
  const g = ctx.createRadialGradient(CARD_W / 2, avoid.y, 60, CARD_W / 2, avoid.y, CARD_H * 0.85);
  g.addColorStop(0, t.bg[0]);
  g.addColorStop(0.5, t.bg[1]);
  g.addColorStop(1, t.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  if (t.aurora) drawAurora(ctx, seed);

  // A decorative field of tiny stars, kept outside the dial so it is never mistaken for data.
  const rand = random(seed);
  ctx.fillStyle = t.star;
  for (let i = 0; i < 170; i++) {
    const x = 48 + rand() * (CARD_W - 96);
    const y = 48 + rand() * (CARD_H - 96);
    const r = 0.6 + rand() ** 3 * 1.8;
    ctx.globalAlpha = 0.12 + rand() * 0.4;
    if (Math.hypot(x - avoid.x, y - avoid.y) < avoid.r) continue;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Soft curtains of northern lights across the top of the card. */
function drawAurora(ctx, seed) {
  const rand = random(seed ^ 0x9e3779b9);
  const bands = [
    { color: "125, 255, 196", base: 150, amp: 46 },
    { color: "90, 200, 255", base: 250, amp: 38 },
    { color: "205, 150, 255", base: 330, amp: 30 },
  ];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const band of bands) {
    const phase = rand() * Math.PI * 2;
    const freq = 0.004 + rand() * 0.004;
    const g = ctx.createLinearGradient(0, band.base - 90, 0, band.base + 200);
    g.addColorStop(0, `rgba(${band.color}, 0)`);
    g.addColorStop(0.3, `rgba(${band.color}, 0.22)`);
    g.addColorStop(1, `rgba(${band.color}, 0)`);
    ctx.fillStyle = g;
    for (let x = 44; x < CARD_W - 44; x += 5) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.sin(x * 0.03 + phase) ** 2;
      const dy = Math.sin(x * freq + phase) * band.amp;
      ctx.fillRect(x, band.base - 90 + dy, 4, 290);
    }
  }
  ctx.restore();
}

export function drawBorder(ctx, t) {
  ctx.strokeStyle = t.rule;
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, CARD_W - 60, CARD_H - 60);
  ctx.strokeStyle = t.ruleSoft;
  ctx.lineWidth = 1;
  ctx.strokeRect(42, 42, CARD_W - 84, CARD_H - 84);
  ctx.fillStyle = t.accent;
  for (const [x, y] of [
    [42, 42],
    [CARD_W - 42, 42],
    [42, CARD_H - 42],
    [CARD_W - 42, CARD_H - 42],
  ]) {
    sparkle(ctx, x, y, 11);
  }
}

function drawDial(ctx, t, mode) {
  const { segments, ticks } = dialSegments(mode);
  const s = DIAL.scale;
  ctx.save();
  ctx.translate(DIAL.x, DIAL.y);

  const ring = (r, color, width, dash = []) => {
    ctx.beginPath();
    ctx.arc(0, 0, r * s, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  ring(104, t.rule, 2.5);
  ring(100, t.rule, 1.2);
  ring(86, t.rule, 1.2);

  const boundaries = new Set(segments.map((seg) => Math.round(seg.from * ticks)));
  for (let i = 0; i < ticks; i++) {
    const a = fractionToAngle(i / ticks);
    const inner = boundaries.has(i) ? 86 : 98.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner * s, Math.sin(a) * inner * s);
    ctx.lineTo(Math.cos(a) * 100 * s, Math.sin(a) * 100 * s);
    ctx.strokeStyle = boundaries.has(i) ? t.rule : t.ruleSoft;
    ctx.lineWidth = boundaries.has(i) ? 1.2 : 0.8;
    ctx.stroke();
  }

  ctx.fillStyle = t.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labelSize = mode === "date" ? 17 : 21;
  ctx.font = `600 ${labelSize}px ${FONT_DISPLAY}`;
  setSpacing(ctx, 2);
  for (const seg of segments) {
    const a = fractionToAngle((seg.from + seg.to) / 2);
    const x = Math.cos(a) * 93 * s;
    const y = Math.sin(a) * 93 * s;
    ctx.save();
    ctx.translate(x, y);
    // Set along the ring like an engraved dial; the lower half is turned so it never reads upside down.
    ctx.rotate(a + (y > 0 ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(mode === "date" ? seg.label : seg.label.toUpperCase(), 0, 1); // "1970s", "MAY"
    ctx.restore();
  }
  setSpacing(ctx, 0);

  // Guides: the cross-hairs and the distance rings, with the Moon's distance picked out.
  ctx.strokeStyle = t.ruleSoft;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  ctx.moveTo(-86 * s, 0);
  ctx.lineTo(86 * s, 0);
  ctx.moveTo(0, -86 * s);
  ctx.lineTo(0, 86 * s);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const r of DISTANCE_RINGS) {
    if (r.ld === 1) ring(r.r, t.ruleSoft.replace(/[\d.]+\)$/, "0.6)"), 1.3);
    else ring(r.r, t.ruleSoft, 1, [3, 6]);
  }
  const moon = DISTANCE_RINGS.find((r) => r.ld === 1);
  ctx.font = `italic 500 20px ${FONT_DISPLAY}`;
  ctx.fillStyle = t.muted;
  ctx.textAlign = "left";
  ctx.fillText("Moon", 6, -moon.r * s - 12);

  // Earth at the center.
  ctx.shadowColor = t.earth;
  ctx.shadowBlur = 18 * t.glow;
  ctx.fillStyle = t.earth;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = t.muted;
  ctx.textAlign = "center";
  ctx.font = `italic 500 22px ${FONT_DISPLAY}`;
  ctx.fillText("Earth", 0, 30);

  ctx.restore();
}

function drawStars(ctx, t, constellation, backdrop) {
  const s = DIAL.scale;
  const mode = constellation.mode;
  const placed = new Map(constellation.asteroids.map((a) => [a.neo_reference_id, placeStar(a, mode)]));
  ctx.save();
  ctx.translate(DIAL.x, DIAL.y);

  // The rest of the sky, faintly.
  for (const a of backdrop) {
    if (placed.has(a.neo_reference_id)) continue;
    const star = placeStar(a, mode);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = star.hazardous ? t.hazard : t.star;
    ctx.beginPath();
    ctx.arc(star.x * s, star.y * s, 1 + star.size * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The constellation's lines, softly glowing. A Star Match has two halves in two colors,
  // joined by a dashed bridge with a sparkle on it.
  const bridge = bridgeIndex(constellation);
  const segments = [];
  constellation.path.forEach((id, i) => {
    const a = placed.get(constellation.path[i - 1]);
    const b = placed.get(id);
    if (i > 0 && a && b) segments.push({ a, b, part: bridge < 0 || i < bridge ? 0 : i === bridge ? 1 : 2 });
  });
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const part of [0, 2, 1]) {
    const color = part === 2 ? t.line2 : t.line;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14 * t.glow;
    ctx.setLineDash(part === 1 ? [10, 12] : []);
    ctx.beginPath();
    for (const seg of segments.filter((x) => x.part === part)) {
      ctx.moveTo(seg.a.x * s, seg.a.y * s);
      ctx.lineTo(seg.b.x * s, seg.b.y * s);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  const join = segments.find((x) => x.part === 1);
  if (join) {
    ctx.fillStyle = t.accent;
    ctx.shadowColor = t.accent;
    ctx.shadowBlur = 16 * t.glow;
    sparkle(ctx, ((join.a.x + join.b.x) / 2) * s, ((join.a.y + join.b.y) / 2) * s, 16);
    ctx.shadowBlur = 0;
  }

  for (const star of placed.values()) {
    const x = star.x * s;
    const y = star.y * s;
    const r = 3 + star.size * 2.2;
    const color = star.hazardous ? t.hazard : t.star;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4);
    halo.addColorStop(0, color);
    halo.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.5 * Math.min(1, t.glow);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (star.hazardous) {
      const d = r * 1.35;
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

/** "#efe4c8" at opacity `a`, as an rgba() color. */
function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const ROCK = { light: "#d9ccb4", mid: "#8d7f6c", dark: "#3a3129" };

/**
 * A lumpy, cratered rock, lit from the top left. The same `seed` always gives
 * the same shape. It is an illustration, not the real asteroid's shape.
 */
export function drawRock(ctx, x, y, r, seed, palette = ROCK) {
  const rand = random(seed);
  const n = 18;
  const raw = Array.from({ length: n }, () => 0.78 + rand() * 0.24);
  const radii = raw.map((v, i) => (v * 2 + raw[(i + 1) % n] + raw[(i + n - 1) % n]) / 4);
  const points = radii.map((k, i) => {
    const a = (i / n) * Math.PI * 2;
    return [x + Math.cos(a) * r * k, y + Math.sin(a) * r * k * 0.88];
  });
  const outline = () => {
    ctx.beginPath();
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const start = mid(points[n - 1], points[0]);
    ctx.moveTo(...start);
    points.forEach((p, i) => ctx.quadraticCurveTo(p[0], p[1], ...mid(p, points[(i + 1) % n])));
    ctx.closePath();
  };

  ctx.save();
  outline();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r * 1.15);
  g.addColorStop(0, palette.light);
  g.addColorStop(0.55, palette.mid);
  g.addColorStop(1, palette.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  for (let i = 0; i < 6; i++) {
    const cx = x + (rand() * 2 - 1) * r * 0.6;
    const cy = y + (rand() * 2 - 1) * r * 0.5;
    const cr = r * (0.07 + rand() * 0.14);
    ctx.fillStyle = "rgba(20, 14, 10, 0.32)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, cr, cr * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 245, 225, 0.28)";
    ctx.lineWidth = Math.max(1, cr * 0.18);
    ctx.beginPath();
    ctx.ellipse(cx + cr * 0.12, cy + cr * 0.12, cr, cr * 0.8, 0, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
  }
  ctx.restore();
  outline();
  ctx.strokeStyle = "rgba(20, 14, 10, 0.45)";
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.stroke();
}

/** A perforated postage stamp showing a rock and the biggest asteroid's real size as its value. */
function drawStamp(ctx, t, biggest, seed) {
  const box = { x: 842, y: 74, w: 146, h: 176 };
  const hole = 4.5;
  const step = 14.6;
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  for (let cx = box.x + step / 2; cx < right; cx += step) {
    ctx.lineTo(cx - hole, box.y);
    ctx.arc(cx, box.y, hole, Math.PI, 0, true);
  }
  ctx.lineTo(right, box.y);
  for (let cy = box.y + step / 2; cy < bottom; cy += step) {
    ctx.lineTo(right, cy - hole);
    ctx.arc(right, cy, hole, -Math.PI / 2, Math.PI / 2, true);
  }
  ctx.lineTo(right, bottom);
  for (let cx = right - step / 2; cx > box.x; cx -= step) {
    ctx.lineTo(cx + hole, bottom);
    ctx.arc(cx, bottom, hole, 0, Math.PI, true);
  }
  ctx.lineTo(box.x, bottom);
  for (let cy = bottom - step / 2; cy > box.y; cy -= step) {
    ctx.lineTo(box.x, cy + hole);
    ctx.arc(box.x, cy, hole, Math.PI / 2, -Math.PI / 2, true);
  }
  ctx.closePath();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#f7efdc";
  ctx.fill();
  ctx.restore();

  const inner = { x: box.x + 12, y: box.y + 12, w: box.w - 24, h: box.h - 24 };
  const g = ctx.createLinearGradient(0, inner.y, 0, inner.y + inner.h);
  g.addColorStop(0, t.bg[0]);
  g.addColorStop(1, t.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  ctx.strokeStyle = t.rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(inner.x + 4, inner.y + 4, inner.w - 8, inner.h - 8);

  drawRock(ctx, inner.x + inner.w / 2, inner.y + inner.h / 2 + 2, 34, seed);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = t.accent;
  ctx.font = `700 12px ${FONT_BODY}`;
  setSpacing(ctx, 3);
  ctx.fillText("EARTH", inner.x + inner.w / 2 + 1.5, inner.y + 24);
  setSpacing(ctx, 0);
  ctx.fillStyle = t.text;
  fitFont(ctx, formatDiameter(biggest.estimated_diameter_km), inner.w - 16, 22, 14, (px) => `600 ${px}px ${FONT_DISPLAY}`);
  ctx.fillText(formatDiameter(biggest.estimated_diameter_km), inner.x + inner.w / 2, inner.y + inner.h - 14);
}

/** A round postmark beside the stamp, with wavy cancellation lines across its picture. */
function drawPostmark(ctx, t, label) {
  const cx = 770;
  const cy = 226;
  const r = 58;
  const ink = withAlpha(t.text, 0.62);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2.2;

  // Cancellation waves across the stamp.
  for (let i = 0; i < 4; i++) {
    const y = 132 + i * 15;
    ctx.beginPath();
    for (let x = cx + r + 6; x <= 1004; x += 3) {
      const yy = y + Math.sin((x - cx) * 0.09) * 4;
      if (x === cx + r + 6) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  ctx.translate(cx, cy);
  ctx.rotate(-0.2);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, r - 17, 0, Math.PI * 2);
  ctx.stroke();

  // Lettering around the ring.
  const ring = "POSTED FROM EARTH ✦ NEO ATLAS ✦ ";
  ctx.font = `700 11px ${FONT_BODY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const chars = Array.from(ring);
  chars.forEach((ch, i) => {
    const a = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(ch, 0, -(r - 8.5));
    ctx.restore();
  });

  fitFont(ctx, label, (r - 20) * 2 - 6, 24, 12, (px) => `700 ${px}px ${FONT_DISPLAY}`);
  ctx.fillText(label, 0, 1);
  ctx.restore();
}

function postmarkLabel(c) {
  const match = matchInfo(c);
  if (match) return formatMonthDay(match.dates[0]).toUpperCase();
  const sky = constellationSky(c);
  if (sky?.mode === "date") return formatMonthDay(sky.date).toUpperCase();
  if (sky?.mode === "year") return String(sky.year);
  return "NEO";
}

function drawText(ctx, t, c, { message, from, site }) {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = t.accent;
  ctx.font = `600 22px ${FONT_BODY}`;
  setSpacing(ctx, 9);
  ctx.fillText("NEO ATLAS", 96, 114);
  setSpacing(ctx, 0);

  ctx.fillStyle = t.text;
  fitFont(ctx, c.name, 610, 74, 40, (px) => `600 ${px}px ${FONT_DISPLAY}`);
  ctx.fillText(c.name, 92, 190);

  ctx.fillStyle = t.muted;
  fitFont(ctx, cardSubtitle(c), 610, 24, 16, (px) => `500 ${px}px ${FONT_BODY}`);
  ctx.fillText(cardSubtitle(c), 96, 234);

  ctx.textAlign = "center";

  // The facts line: real numbers in everyday terms.
  const facts = cardFacts(c);
  if (facts) {
    ctx.fillStyle = t.accent;
    fitFont(ctx, `✦ ${facts}`, 920, 24, 15, (px) => `600 ${px}px ${FONT_BODY}`);
    ctx.fillText(`✦ ${facts}`, CARD_W / 2, 980);
  }

  // The message, in the largest size that fits its box.
  ctx.fillStyle = message ? t.text : t.muted;
  drawWrapped(ctx, message || "Near-Earth asteroids, charted like stars.", {
    x: CARD_W / 2,
    top: 1004,
    bottom: from ? 1166 : 1200,
    width: 880,
    max: 50,
    min: 30,
    font: (px) => `italic 500 ${px}px ${FONT_DISPLAY}`,
  });

  if (from) {
    ctx.fillStyle = t.accent;
    fitFont(ctx, `— ${from}`, 820, 36, 24, (px) => `italic 600 ${px}px ${FONT_DISPLAY}`);
    ctx.textAlign = "right";
    ctx.fillText(`— ${from}`, CARD_W - 110, 1210);
    ctx.textAlign = "center";
  }

  // The fine print: what is real and what isn't.
  ctx.fillStyle = t.muted;
  ctx.font = `500 19px ${FONT_BODY}`;
  ctx.fillText(
    "Sizes, speeds and miss distances are real. Dates are simulated, so positions are illustrative.",
    CARD_W / 2,
    1260,
  );
  const hazard = c.asteroids.some((a) => a.is_potentially_hazardous);
  const credits = `${hazard ? "◆ red: potentially hazardous  ·  " : ""}Data: AegisNEO API  ·  ${site}`;
  ctx.font = `500 18px ${FONT_MONO}`;
  ctx.fillText(credits, CARD_W / 2, 1292);
}

/**
 * Draws the postcard onto a 1080×1350 canvas. `backdrop` is the rest of the
 * constellation's sky, drawn faintly behind it when it is known.
 */
export function drawPostcard(ctx, { constellation, backdrop = [], message = "", from = "", theme, site }) {
  const t = THEMES[cleanTheme(theme)];
  const c = { ...constellation, name: cleanName(constellation.name) };
  const seed = hashString(c.path.join("."));
  const biggest = c.asteroids.reduce((best, a) => (a.estimated_diameter_km > best.estimated_diameter_km ? a : best));
  ctx.save();
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  drawBackground(ctx, t, seed);
  drawBorder(ctx, t);
  drawDial(ctx, t, c.mode);
  drawStars(ctx, t, c, backdrop);
  drawStamp(ctx, t, biggest, hashString(biggest.neo_reference_id));
  drawPostmark(ctx, t, postmarkLabel(c));
  drawText(ctx, t, c, { message: cleanMessage(message), from: cleanFrom(from), site });
  ctx.restore();
}

/**
 * What a sealed postcard's picture shows: an envelope with a wax seal and the
 * day it opens. The message stays hidden in the link until then.
 */
export function drawEnvelope(ctx, { theme, from = "", until, site }) {
  const t = THEMES[cleanTheme(theme)];
  const seed = hashString(`${until}|${from}`);
  ctx.save();
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  drawBackground(ctx, t, seed, { x: CARD_W / 2, y: 680, r: 470 });
  drawBorder(ctx, t);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = t.accent;
  ctx.font = `600 22px ${FONT_BODY}`;
  setSpacing(ctx, 9);
  ctx.fillText("A SEALED POSTCARD", CARD_W / 2 + 4, 190);
  setSpacing(ctx, 0);
  ctx.fillStyle = t.text;
  const who = cleanFrom(from);
  fitFont(ctx, who ? `From ${who}` : "For you", 860, 80, 44, (px) => `600 ${px}px ${FONT_DISPLAY}`);
  ctx.fillText(who ? `From ${who}` : "For you", CARD_W / 2, 290);

  // The envelope.
  const env = { x: 150, y: 420, w: 780, h: 500 };
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#f3e8d0";
  ctx.fillRect(env.x, env.y, env.w, env.h);
  ctx.restore();
  ctx.strokeStyle = "rgba(120, 96, 60, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(env.x, env.y + env.h);
  ctx.lineTo(env.x + env.w / 2, env.y + env.h * 0.52);
  ctx.lineTo(env.x + env.w, env.y + env.h);
  ctx.stroke();
  ctx.fillStyle = "#eadbbd";
  ctx.beginPath();
  ctx.moveTo(env.x, env.y);
  ctx.lineTo(env.x + env.w / 2, env.y + env.h * 0.58);
  ctx.lineTo(env.x + env.w, env.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // The wax seal.
  const sx = env.x + env.w / 2;
  const sy = env.y + env.h * 0.58;
  const wax = ctx.createRadialGradient(sx - 18, sy - 20, 6, sx, sy, 74);
  wax.addColorStop(0, "#e2574c");
  wax.addColorStop(0.7, "#a3231c");
  wax.addColorStop(1, "#6e130f");
  ctx.fillStyle = wax;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rr = 66 + (i % 2 ? 5 : 0);
    ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
  }
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 210, 190, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, 48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 220, 200, 0.8)";
  sparkle(ctx, sx, sy, 30);

  const [y, m, d] = until.split("-").map(Number);
  const day = formatMonthDay(`${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  ctx.fillStyle = t.text;
  ctx.font = `600 64px ${FONT_DISPLAY}`;
  ctx.fillText(`Opens on ${day} ${y}`, CARD_W / 2, 1060);
  ctx.fillStyle = t.muted;
  ctx.font = `italic 500 36px ${FONT_DISPLAY}`;
  ctx.fillText("Open the link to see the countdown.", CARD_W / 2, 1124);
  ctx.font = `500 18px ${FONT_MONO}`;
  ctx.fillText(`NEO Atlas  ·  ${site}`, CARD_W / 2, 1292);
  ctx.restore();
}
