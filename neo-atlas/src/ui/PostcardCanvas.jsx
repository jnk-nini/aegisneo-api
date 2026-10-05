import { useEffect, useRef, useState } from "react";
import { CARD_H, CARD_W, drawPostcard, loadCardFonts } from "../lib/postcard.js";

let fonts = null; // loaded once for every card

/**
 * The postcard as a canvas, redrawn whenever what's on it changes. `onDrawn`
 * runs after each drawing, so the picture can be saved from `canvasRef`.
 */
export default function PostcardCanvas({
  canvasRef,
  constellation,
  backdrop,
  message,
  from,
  theme,
  label,
  onDrawn,
}) {
  const ownRef = useRef(null);
  const ref = canvasRef ?? ownRef;
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let live = true;
    (fonts ??= loadCardFonts()).then(() => live && setFontsReady(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const ctx = ref.current?.getContext("2d");
      if (!ctx) return;
      drawPostcard(ctx, { constellation, backdrop, message, from, theme, site: window.location.host });
      onDrawn?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [ref, constellation, backdrop, message, from, theme, fontsReady, onDrawn]);

  return (
    <canvas
      ref={ref}
      width={CARD_W}
      height={CARD_H}
      className="postcard-canvas"
      role="img"
      aria-label={label}
    />
  );
}
