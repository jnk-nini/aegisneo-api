// Paints the globe off the main thread so the page stays responsive while it
// works (a 4096 px day map is 8 million pixels). Replies with ImageBitmaps,
// which move to the page without copying, and the 1-bit land mask.

import { paintEarth, paintLandMask, worldFromTopology } from "./earthPaint.js";

let worldPromise = null;

function loadWorld(url) {
  worldPromise ??= fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`world map HTTP ${r.status}`);
      return r.json();
    })
    .then(worldFromTopology);
  return worldPromise;
}

self.onmessage = async ({ data: { id, url, size, textures } }) => {
  try {
    const world = await loadWorld(url);
    if (!textures) {
      const land = paintLandMask(world, size);
      self.postMessage({ id, land }, [land.bits.buffer]);
      return;
    }
    const painted = paintEarth(world, size);
    const bitmaps = {};
    for (const key of ["day", "night", "mask", "clouds"]) {
      bitmaps[key] = painted[key].transferToImageBitmap();
    }
    self.postMessage({ id, bitmaps, land: painted.land }, [
      ...Object.values(bitmaps),
      painted.land.bits.buffer,
    ]);
  } catch (err) {
    worldPromise = null;
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
