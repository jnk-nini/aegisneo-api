// Loads Natural Earth country outlines (public domain, via the world-atlas
// package) and answers "is this point land or water / which country". The
// globe's textures are painted by earthPaint.js, in a Web Worker when the
// browser supports OffscreenCanvas so the page never freezes while it works.

import { geoContains } from "d3-geo";
import countriesUrl from "world-atlas/countries-50m.json?url";
import { isLandBit, paintEarth, paintLandMask, worldFromTopology } from "./earthPaint.js";

let worldPromise = null;
let landMask = null; // { bits: Uint8Array (1 bit per pixel), width, height }
let landPromise = null;
let earthPromise = null;

export function loadWorld() {
  worldPromise ??= fetch(countriesUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`world map HTTP ${r.status}`);
      return r.json();
    })
    .then(worldFromTopology)
    .catch((err) => {
      worldPromise = null;
      throw err;
    });
  return worldPromise;
}

/** Texture width for this device: phones get half the resolution (a quarter of the memory). */
export function textureSize() {
  const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
  return mobile ? 2048 : 4096;
}

// --- painting: worker first, the page as a fallback ---

function workerSupported() {
  try {
    return (
      typeof Worker !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      "transferToImageBitmap" in OffscreenCanvas.prototype &&
      Boolean(new OffscreenCanvas(1, 1).getContext("2d"))
    );
  } catch {
    return false;
  }
}

let worker = null;
let nextId = 0;
const pending = new Map();

function paintInWorker(size, textures) {
  if (!worker) {
    worker = new Worker(new URL("./earth.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve({ images: data.bitmaps ?? null, land: data.land });
    };
    worker.onerror = (event) => {
      event.preventDefault();
      for (const job of pending.values()) job.reject(new Error(event.message || "texture worker failed"));
      pending.clear();
      worker.terminate();
      worker = null;
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, url: new URL(countriesUrl, location.href).href, size, textures });
  });
}

function pageCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function paintOnPage(size, textures) {
  const world = await loadWorld();
  if (!textures) return { images: null, land: paintLandMask(world, size, pageCanvas) };
  const { land, ...images } = paintEarth(world, size, pageCanvas);
  return { images, land };
}

function paint(size, textures) {
  if (!workerSupported()) return paintOnPage(size, textures);
  return paintInWorker(size, textures).catch(() => paintOnPage(size, textures));
}

/**
 * Day, night, ocean-mask and cloud images for the globe (ImageBitmaps from
 * the worker, or canvases from the fallback). Painted once per page load.
 */
export function loadEarthImages() {
  earthPromise ??= paint(textureSize(), true)
    .then(({ images, land }) => {
      landMask = land;
      return images;
    })
    .catch((err) => {
      earthPromise = null;
      throw err;
    });
  landPromise ??= earthPromise
    .then(() => landMask)
    .catch(() => {
      landPromise = null;
    });
  return earthPromise;
}

/** Makes sure the land/water mask is ready; the 2D map needs it without any textures. */
export function loadLandMask() {
  if (landMask) return Promise.resolve(landMask);
  landPromise ??= paint(textureSize(), false)
    .then(({ land }) => (landMask = land))
    .catch(() => {
      landPromise = null;
    });
  return landPromise;
}

/** "land" or "water" at a lat/lon, using the painted land mask. */
export function surfaceAt(lat, lon) {
  if (!landMask) return "land";
  const { bits, width, height } = landMask;
  const x = Math.min(width - 1, Math.max(0, Math.floor(((lon + 180) / 360) * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)));
  return isLandBit(bits, y * width + x) ? "land" : "water";
}

/** Country name containing a point, or null (ocean or unknown). */
export async function countryAt(lat, lon) {
  const world = await loadWorld();
  const point = [lon, lat];
  for (const f of world.countries.features) {
    if (geoContains(f, point)) return f.properties?.name ?? null;
  }
  return null;
}
