import { useEffect, useState } from "react";
import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace, SRGBColorSpace } from "three";
import { loadEarthImages } from "../lib/world.js";

let texturePromise = null;

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

/** The procedural Earth textures, painted once per page load (see lib/world.js). */
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
      .then((textures) => !cancelled && setState({ textures, error: null }))
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
