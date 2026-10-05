import { useEffect, useState } from "react";
import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace, SRGBColorSpace } from "three";
import { drawBorders, loadEarthImages, textureSize } from "../lib/world.js";
import { worldCanvas } from "../lib/gibs.js";

let texturePromise = null;
let nasaPromise = null;

function toTexture(image, srgb) {
  // WebGL ignores flipY for ImageBitmaps, so worker output goes through a
  // canvas (a fast GPU copy) to upload the same way as the page fallback.
  let canvas = image;
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    image.close();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * NASA imagery for the day and night side (see lib/gibs.js): Blue Marble with
 * shaded relief and bathymetry, and Black Marble city lights. Resolves to null
 * when offline or the service is down; the painted globe then stays.
 */
function loadNasaTextures() {
  nasaPromise ??= (async () => {
    const width = textureSize();
    const [day, night] = await Promise.all([
      worldCanvas("color", width >= 4096 ? 3 : 2, width),
      worldCanvas("night", 2, Math.min(width, 2048)),
    ]);
    if (!day) return null;
    await drawBorders(day).catch(() => {});
    return { day: toTexture(day, true), night: night ? toTexture(night, true) : null };
  })().catch(() => null);
  return nasaPromise;
}

/**
 * The Earth textures: the painted globe first (once per page load, see
 * lib/world.js), then real NASA imagery swapped in when it has arrived.
 */
export function useEarthTextures() {
  const [state, setState] = useState({ textures: null, error: null });

  useEffect(() => {
    let cancelled = false;
    texturePromise ??= loadEarthImages().then((c) => ({
      day: toTexture(c.day, true),
      night: toTexture(c.night, true),
      mask: toTexture(c.mask, false),
      clouds: toTexture(c.clouds, false),
    }));
    texturePromise
      .then((textures) => {
        if (cancelled) return;
        setState({ textures, error: null });
        loadNasaTextures().then((nasa) => {
          if (cancelled || !nasa) return;
          setState({
            textures: { ...textures, day: nasa.day, night: nasa.night ?? textures.night, nasa: true },
            error: null,
          });
        });
      })
      .catch((error) => {
        texturePromise = null;
        if (!cancelled) setState({ textures: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
