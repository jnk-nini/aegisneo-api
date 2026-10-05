// The "asteroid sign" card: a 1080×1350 picture, drawn on the visitor's device
// like the postcards, so it can be shared without uploading anything.

import { distanceComparison } from "./facts.js";
import { formatDiameter, formatMonthDay } from "./format.js";
import {
  CARD_H,
  CARD_W,
  drawBackground,
  drawBorder,
  drawRock,
  drawWrapped,
  fitFont,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
  setSpacing,
  sparkle,
  THEMES,
} from "./postcard.js";
import { hashString } from "./random.js";

const ORBIT = { x: CARD_W / 2, y: 470, r: 190 };

export function signDescription(sign, date) {
  return `Asteroid sign for ${formatMonthDay(date)}: ${sign.title}. ${sign.motto} ${sign.traits.join(". ")}. ${sign.reading} Lucky number ${sign.lucky}. Best match: ${sign.match}. Just for fun.`;
}

export function signFileName(sign) {
  return `neo-atlas-sign-${sign.key}.png`;
}

/** Draws the sign card for the birthday `date` ("MM-DD"). */
export function drawSignCard(ctx, { sign, date, site }) {
  const t = THEMES.neon;
  const a = sign.asteroid;
  const seed = hashString(a.neo_reference_id);
  ctx.save();
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  drawBackground(ctx, t, seed, { x: ORBIT.x, y: ORBIT.y, r: ORBIT.r * 1.45 });
  drawBorder(ctx, t);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = t.accent;
  ctx.font = `600 22px ${FONT_BODY}`;
  setSpacing(ctx, 9);
  ctx.fillText("YOUR ASTEROID SIGN", CARD_W / 2 + 4, 120);
  setSpacing(ctx, 0);
  ctx.fillStyle = t.muted;
  ctx.font = `italic 500 34px ${FONT_DISPLAY}`;
  ctx.fillText(`Born on ${formatMonthDay(date)}`, CARD_W / 2, 172);

  // The rock on its orbit, glowing.
  const glow = ctx.createRadialGradient(ORBIT.x, ORBIT.y, 40, ORBIT.x, ORBIT.y, ORBIT.r * 1.4);
  glow.addColorStop(0, "rgba(255, 90, 222, 0.35)");
  glow.addColorStop(1, "rgba(255, 90, 222, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, ORBIT.y - ORBIT.r * 1.5, CARD_W, ORBIT.r * 3);
  ctx.save();
  ctx.translate(ORBIT.x, ORBIT.y);
  ctx.rotate(-0.32);
  ctx.strokeStyle = "rgba(127, 249, 255, 0.55)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 10]);
  ctx.beginPath();
  ctx.ellipse(0, 0, ORBIT.r * 1.45, ORBIT.r * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  drawRock(ctx, ORBIT.x, ORBIT.y, ORBIT.r * 0.72, seed);
  ctx.fillStyle = t.accent;
  ctx.shadowColor = t.accent;
  ctx.shadowBlur = 18;
  sparkle(ctx, ORBIT.x + ORBIT.r * 1.2, ORBIT.y - ORBIT.r * 0.62, 14);
  sparkle(ctx, ORBIT.x - ORBIT.r * 1.3, ORBIT.y + ORBIT.r * 0.3, 10);
  ctx.shadowBlur = 0;

  ctx.fillStyle = t.text;
  fitFont(ctx, sign.title, 900, 104, 60, (px) => `600 ${px}px ${FONT_DISPLAY}`);
  ctx.fillText(sign.title, CARD_W / 2, 790);
  ctx.fillStyle = t.line;
  ctx.font = `italic 500 42px ${FONT_DISPLAY}`;
  ctx.fillText(sign.motto, CARD_W / 2, 848);

  ctx.fillStyle = t.text;
  ctx.font = `600 28px ${FONT_BODY}`;
  sign.traits.forEach((trait, i) => ctx.fillText(`✦  ${trait}`, CARD_W / 2, 918 + i * 44));

  ctx.fillStyle = t.muted;
  drawWrapped(ctx, sign.reading, {
    x: CARD_W / 2,
    top: 1036,
    bottom: 1150,
    width: 860,
    max: 36,
    min: 26,
    font: (px) => `italic 500 ${px}px ${FONT_DISPLAY}`,
  });

  ctx.fillStyle = t.accent;
  ctx.font = `700 26px ${FONT_BODY}`;
  ctx.fillText(`Lucky number ${sign.lucky}  ·  Best match: ${sign.match}`, CARD_W / 2, 1198);

  ctx.fillStyle = t.muted;
  const ruler = `Ruled by ${a.name}: ${formatDiameter(a.estimated_diameter_km)} wide, passed ${distanceComparison(a.miss_distance_km)}.`;
  fitFont(ctx, ruler, 920, 20, 14, (px) => `500 ${px}px ${FONT_BODY}`);
  ctx.fillText(ruler, CARD_W / 2, 1246);
  ctx.font = `500 18px ${FONT_MONO}`;
  ctx.fillText(`Real asteroid, made-up meaning: just for fun  ·  ${site}`, CARD_W / 2, 1290);
  ctx.restore();
}
