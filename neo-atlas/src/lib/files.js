// Pictures made on this device: turning a canvas into a file, sharing it, saving it.

import { CARD_H, CARD_W } from "./postcard.js";

/** Whether this browser can hand an image to the phone's share sheet. */
export function canShareImages() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File([""], "card.png", { type: "image/png" })] }));
  } catch {
    return false;
  }
}

export function canvasToFile(canvas, name) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type: "image/png" })) : reject(new Error("No image"))),
      "image/png",
    ),
  );
}

/** A card-sized canvas that isn't on the page, drawn by `draw(ctx)`. */
export function offscreenCard(draw) {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  draw(canvas.getContext("2d"));
  return canvas;
}

/** Saves a file (a picture, a calendar reminder) to the visitor's device. */
export function saveFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A short buzz on phones that support it, when the visitor hasn't asked for less motion. */
export function buzz(pattern = 12) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not allowed here: no buzz.
  }
}
