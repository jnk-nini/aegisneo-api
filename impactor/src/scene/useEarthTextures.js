import { useEffect, useState } from "react";
import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace, SRGBColorSpace } from "three";
import { buildEarthTextures } from "../lib/world.js";

let texturePromise = null;

function pickSize() {
  const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
  return mobile ? 2048 : 4096;
}

function toTexture(canvas, srgb) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Builds the procedural Earth textures once per page load. */
export function useEarthTextures() {
  const [state, setState] = useState({ textures: null, error: null });

  useEffect(() => {
    let cancelled = false;
    texturePromise ??= buildEarthTextures(pickSize()).then((c) => ({
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
