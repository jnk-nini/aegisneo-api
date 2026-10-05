// Real satellite imagery for the globe from NASA's Global Imagery Browse
// Services (GIBS, public domain, no key needed): Blue Marble colour with shaded
// relief and sea-floor bathymetry, Black Marble city lights for the night side,
// and ASTER shaded relief (31 m) for close-up terrain. Tiles are 512 px in the
// plate carrée (EPSG:4326) grid; a level-0 tile spans 288°.

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best";
const TILE = 512;

export const LAYERS = {
  color: {
    name: "BlueMarble_ShadedRelief_Bathymetry",
    date: "2004-08-01",
    set: "500m",
    ext: "jpeg",
    maxZ: 7,
  },
  night: { name: "VIIRS_Black_Marble", date: "2016-01-01", set: "500m", ext: "png", maxZ: 7 },
  relief: {
    name: "ASTER_GDEM_Greyscale_Shaded_Relief",
    date: "2000-03-01",
    set: "31.25m",
    ext: "jpeg",
    maxZ: 11,
  },
};

/** Degrees covered by one tile at level `z`. */
export const tileSpan = (z) => 288 / 2 ** z;

/** Level whose pixels are about `metres` across (≈ 111 km per degree). */
export function levelFor(metres) {
  return Math.log2(((tileSpan(0) / TILE) * 111320) / Math.max(metres, 1));
}

export function tileUrl(layer, z, row, col) {
  const l = LAYERS[layer];
  return `${GIBS}/${l.name}/default/${l.date}/${l.set}/${z}/${row}/${col}.${l.ext}`;
}

// Decoded tiles, newest last; the oldest are dropped past the limit.
const cache = new Map();
const CACHE_LIMIT = 160;
const pending = new Map();

function loadTile(layer, z, row, col) {
  const url = tileUrl(layer, z, row, col);
  if (cache.has(url)) {
    const image = cache.get(url);
    cache.delete(url);
    cache.set(url, image);
    return Promise.resolve(image);
  }
  if (pending.has(url)) return pending.get(url);
  const job = fetch(url, { mode: "cors" })
    .then((r) => (r.ok ? r.blob() : null))
    .then((blob) => (blob ? createImageBitmap(blob) : null))
    .catch(() => null)
    .then((image) => {
      pending.delete(url);
      if (image) {
        cache.set(url, image);
        while (cache.size > CACHE_LIMIT) {
          const [oldest, old] = cache.entries().next().value;
          old.close?.();
          cache.delete(oldest);
        }
      }
      return image;
    });
  pending.set(url, job);
  return job;
}

/**
 * Draws `layer` at level `z` into `ctx`, which shows the lon/lat box
 * `win` = { lon0, latN, widthDeg, heightDeg } (lon0 may run past ±180).
 * Resolves once every tile has been drawn or has failed; returns how many failed.
 */
export async function drawLayer(ctx, layer, z, win) {
  const { width, height } = ctx.canvas;
  const s = tileSpan(z);
  const cols = Math.round(360 / s);
  const rows = Math.ceil(180 / s);
  const c0 = Math.floor((win.lon0 + 180) / s);
  const c1 = Math.ceil((win.lon0 + win.widthDeg + 180) / s) - 1;
  const r0 = Math.max(0, Math.floor((90 - win.latN) / s));
  const r1 = Math.min(rows - 1, Math.ceil((90 - win.latN + win.heightDeg) / s) - 1);
  const pxPerDegX = width / win.widthDeg;
  const pxPerDegY = height / win.heightDeg;
  const jobs = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const col = ((c % cols) + cols) % cols;
      const x = (c * s - 180 - win.lon0) * pxPerDegX;
      const y = (90 - r * s - win.latN) * -pxPerDegY;
      jobs.push(
        loadTile(layer, z, r, col).then((image) => {
          if (!image) return 1;
          // Overlap by a pixel so scaled tiles leave no hairline gaps.
          ctx.drawImage(image, x, y, s * pxPerDegX + 0.6, s * pxPerDegY + 0.6);
          return 0;
        }),
      );
    }
  }
  const failed = await Promise.all(jobs);
  return failed.reduce((a, b) => a + b, 0);
}

/** The whole world for one layer at level `z`, into a `width` × `width/2` canvas, or null if it failed. */
export async function worldCanvas(layer, z, width) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = width / 2;
  const ctx = canvas.getContext("2d");
  const failed = await drawLayer(ctx, layer, z, { lon0: -180, latN: 90, widthDeg: 360, heightDeg: 180 });
  const total = Math.round(360 / tileSpan(z)) * Math.ceil(180 / tileSpan(z));
  return failed > total * 0.1 ? null : canvas;
}
