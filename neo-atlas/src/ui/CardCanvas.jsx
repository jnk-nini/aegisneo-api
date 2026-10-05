import { useEffect, useRef, useState } from "react";
import { CARD_H, CARD_W, loadCardFonts } from "../lib/postcard.js";

let fonts = null; // loaded once for every card

/**
 * A 1080×1350 card drawn on a canvas by `draw(ctx)`, redrawn whenever `draw`
 * changes (so pass a memoized function). `onDrawn` runs after each drawing,
 * so the picture can be saved from `canvasRef`.
 */
export default function CardCanvas({ canvasRef, draw, label, onDrawn, className = "" }) {
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
      draw(ctx);
      onDrawn?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [ref, draw, fontsReady, onDrawn]);

  return (
    <canvas
      ref={ref}
      width={CARD_W}
      height={CARD_H}
      className={`postcard-canvas ${className}`}
      role="img"
      aria-label={label}
    />
  );
}
