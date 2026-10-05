// Postcards: a constellation drawn on a 1080×1350 card, with a short message.
// Nothing is uploaded. The picture is drawn on the visitor's device, and the
// message travels in the link, like the rest of a shared constellation.

import { dialSegments, DISTANCE_RINGS, FIRST_YEAR, fractionToAngle, LAST_YEAR, placeStar } from "./chart.js";
import { cleanName, constellationSky, shareQuery, starCount } from "./constellations.js";
import { formatMonthDay, plural } from "./format.js";
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
    star: "#fff3e9",
    hazard: "#ff8070",
    earth: "#a9d4f5",
    glow: 1,
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
    star: "#1b2a55",
    hazard: "#b23a2a",
    earth: "#3f7fb5",
    glow: 0.35,
  },
};
export const DEFAULT_THEME = "midnight";

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

// ---------- Links ----------

/** A share link for the constellation that also opens it as this postcard. */
export function postcardQuery(c, { message, from, theme }) {
  const q = new URLSearchParams(shareQuery(c));
  const m = cleanMessage(message);
  const f = cleanFrom(from);
  if (m) q.set("pm", m);
  if (f) q.set("pf", f);
  q.set("pt", cleanTheme(theme));
  return `?${q}`;
}

/** The postcard part of a link, or null if the link isn't a postcard. */
export function postcardFromQuery(search) {
  const q = new URLSearchParams(search);
  if (!q.has("pt") && !q.has("pm") && !q.has("pf")) return null;
  return { message: cleanMessage(q.get("pm")), from: cleanFrom(q.get("pf")), theme: cleanTheme(q.get("pt")) };
}

// ---------- What the card says ----------

/** "12 May · every year 1910–2024 · 7 asteroids", "The sky of 1987 · 6 asteroids". */
export function cardSubtitle(c) {
  const sky = constellationSky(c);
  const stars = plural(starCount(c), "asteroid");
  if (sky?.mode === "date")
    return `${formatMonthDay(sky.date)} · every year ${FIRST_YEAR}–${LAST_YEAR} · ${stars}`;
  if (sky?.mode === "year") return `The sky of ${sky.year} · ${stars}`;
  const years = c.asteroids.map((a) => Number(a.close_approach_date.slice(0, 4)));
  return `${Math.min(...years)}–${Math.max(...years)} · ${stars}`;
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

const FONT_DISPLAY = '"Cormorant Garamond Variable", "Cormorant Garamond", Georgia, serif';
const FONT_BODY = '"Manrope Variable", system-ui, sans-serif';
const FONT_MONO = '"JetBrains Mono Variable", ui-monospace, monospace';

/** Waits for the card's fonts, so the first picture isn't drawn in a fallback font. */
export async function loadCardFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`600 72px ${FONT_DISPLAY}`),
    document.fonts.load(`italic 500 48px ${FONT_DISPLAY}`),
    document.fonts.load(`600 24px ${FONT_BODY}`),
    document.fonts.load(`500 20px ${FONT_MONO}`),
  ]).catch(() => {});
}

function setSpacing(ctx, px) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

/** Shrinks the font until `text` fits in `maxWidth`. */
function fitFont(ctx, text, maxWidth, size, minSize, font) {
  let s = size;
  ctx.font = font(s);
  while (s > minSize && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = font(s);
  }
  return s;
}

function sparkle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

const DIAL = { x: CARD_W / 2, y: 612, scale: 3.15 }; // the dial's 104-unit rim is ~328 px

function drawBackground(ctx, t, seed) {
  const g = ctx.createRadialGradient(CARD_W / 2, DIAL.y, 60, CARD_W / 2, DIAL.y, CARD_H * 0.85);
  g.addColorStop(0, t.bg[0]);
  g.addColorStop(0.5, t.bg[1]);
  g.addColorStop(1, t.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // A decorative field of tiny stars, kept outside the dial so it is never mistaken for data.
  const rand = random(seed);
  ctx.fillStyle = t.star;
  for (let i = 0; i < 170; i++) {
    const x = 48 + rand() * (CARD_W - 96);
    const y = 48 + rand() * (CARD_H - 96);
    const r = 0.6 + rand() ** 3 * 1.8;
    ctx.globalAlpha = 0.12 + rand() * 0.4;
    if (Math.hypot(x - DIAL.x, y - DIAL.y) < 104 * DIAL.scale + 18) continue;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBorder(ctx, t) {
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

  // The constellation's lines, softly glowing.
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = t.line;
  ctx.shadowBlur = 14 * t.glow;
  ctx.beginPath();
  constellation.path.forEach((id, i) => {
    const star = placed.get(id);
    if (!star) return;
    if (i === 0) ctx.moveTo(star.x * s, star.y * s);
    else ctx.lineTo(star.x * s, star.y * s);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (const star of placed.values()) {
    const x = star.x * s;
    const y = star.y * s;
    const r = 3 + star.size * 2.2;
    const color = star.hazardous ? t.hazard : t.star;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4);
    halo.addColorStop(0, color);
    halo.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.5 * t.glow;
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

function drawText(ctx, t, c, { message, from, site }) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = t.accent;
  ctx.font = `600 22px ${FONT_BODY}`;
  setSpacing(ctx, 9);
  ctx.fillText("NEO ATLAS", CARD_W / 2 + 4, 108);
  setSpacing(ctx, 0);

  ctx.fillStyle = t.text;
  fitFont(ctx, c.name, 900, 76, 44, (px) => `600 ${px}px ${FONT_DISPLAY}`);
  ctx.fillText(c.name, CARD_W / 2, 184);

  ctx.fillStyle = t.muted;
  fitFont(ctx, cardSubtitle(c), 900, 25, 18, (px) => `500 ${px}px ${FONT_BODY}`);
  ctx.fillText(cardSubtitle(c), CARD_W / 2, 228);

  // The message, in the largest size that fits its box.
  const box = { top: 990, bottom: from ? 1162 : 1196, width: 880 };
  const text = message || "Near-Earth asteroids, charted like stars.";
  let size = 50;
  let lines;
  for (;;) {
    ctx.font = `italic 500 ${size}px ${FONT_DISPLAY}`;
    lines = wrapText(text, box.width, (s) => ctx.measureText(s).width);
    if (lines.length * size * 1.18 <= box.bottom - box.top || size <= 30) break;
    size -= 2;
  }
  const lineHeight = size * 1.18;
  const maxLines = Math.floor((box.bottom - box.top) / lineHeight);
  if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1]}…`];
  const top = box.top + (box.bottom - box.top - lines.length * lineHeight) / 2;
  ctx.fillStyle = message ? t.text : t.muted;
  lines.forEach((line, i) => ctx.fillText(line, CARD_W / 2, top + (i + 0.8) * lineHeight));

  if (from) {
    ctx.fillStyle = t.accent;
    fitFont(ctx, `— ${from}`, 820, 36, 24, (px) => `italic 600 ${px}px ${FONT_DISPLAY}`);
    ctx.textAlign = "right";
    ctx.fillText(`— ${from}`, CARD_W - 110, 1206);
    ctx.textAlign = "center";
  }

  // The fine print: what is real and what isn't.
  ctx.fillStyle = t.muted;
  ctx.font = `500 19px ${FONT_BODY}`;
  ctx.fillText(
    "Sizes and miss distances are real. Dates are simulated, so positions are illustrative.",
    CARD_W / 2,
    1258,
  );
  const hazard = c.asteroids.some((a) => a.is_potentially_hazardous);
  const credits = `${hazard ? "◆ red: potentially hazardous  ·  " : ""}Data: AegisNEO API  ·  ${site}`;
  ctx.font = `500 18px ${FONT_MONO}`;
  ctx.fillText(credits, CARD_W / 2, 1290);
}

/**
 * Draws the postcard onto a 1080×1350 canvas. `backdrop` is the rest of the
 * constellation's sky, drawn faintly behind it when it is known.
 */
export function drawPostcard(ctx, { constellation, backdrop = [], message = "", from = "", theme, site }) {
  const t = THEMES[cleanTheme(theme)];
  const c = { ...constellation, name: cleanName(constellation.name) };
  ctx.save();
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  drawBackground(ctx, t, hashString(c.path.join(".")));
  drawBorder(ctx, t);
  drawDial(ctx, t, c.mode);
  drawStars(ctx, t, c, backdrop);
  drawText(ctx, t, c, { message: cleanMessage(message), from: cleanFrom(from), site });
  ctx.restore();
}
