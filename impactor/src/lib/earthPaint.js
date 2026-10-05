// Paints the globe's textures from Natural Earth outlines. Runs inside a Web
// Worker (earth.worker.js) on an OffscreenCanvas, or on the page as a fallback,
// so nothing here touches the DOM: the caller passes in a canvas factory.
// Everything is drawn in a true equirectangular projection so texture pixels
// line up with lat/lon exactly.

import { feature, mesh } from "topojson-client";
import { geoEquirectangular, geoPath } from "d3-geo";
import { CITIES } from "../data/cities.js";

export function worldFromTopology(topo) {
  return {
    countries: feature(topo, topo.objects.countries),
    land: feature(topo, topo.objects.land),
    borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
  };
}

function projectionFor(width, height) {
  return geoEquirectangular()
    .scale(width / (2 * Math.PI))
    .translate([width / 2, height / 2])
    .precision(0.2);
}

// --- deterministic value noise on the sphere (no seams at the date line) ---
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function valueNoise(x, y, z) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const xf = x - xi,
    yf = y - yi,
    zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf),
    v = s(yf),
    w = s(zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
function fbm(x, y, z, octaves) {
  let sum = 0,
    amp = 0.5,
    freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

/** Small grayscale noise field (one byte per pixel), sampled smoothly later. */
function noiseField(width, height, frequency, octaves, seed) {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const theta = ((y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x++) {
      const phi = ((x + 0.5) / width) * 2 * Math.PI;
      const nx = Math.sin(theta) * Math.cos(phi) * frequency + seed;
      const ny = Math.cos(theta) * frequency;
      const nz = Math.sin(theta) * Math.sin(phi) * frequency;
      data[y * width + x] = Math.round(fbm(nx, ny, nz, octaves) * 255);
    }
  }
  return { data, width, height };
}

/**
 * Bilinear lookup tables for stretching a small field over a W×H texture,
 * matching what the browser does when it upscales an image with smoothing
 * (pixel centres aligned, edges clamped). Lets the paint loop read the small
 * field directly instead of keeping a full-size upscaled copy in memory.
 */
function stretch(field, W, H) {
  const axis = (from, to) => {
    const i0 = new Int32Array(to);
    const i1 = new Int32Array(to);
    const f = new Float32Array(to);
    for (let k = 0; k < to; k++) {
      const s = Math.min(from - 1, Math.max(0, ((k + 0.5) * from) / to - 0.5));
      i0[k] = Math.floor(s);
      i1[k] = Math.min(from - 1, i0[k] + 1);
      f[k] = s - i0[k];
    }
    return { i0, i1, f };
  };
  return { ...field, xs: axis(field.width, W), ys: axis(field.height, H) };
}

/** Value (0–255) of a stretched field at texture pixel (x, y). */
function sample(s, x, y) {
  const { data, width, xs, ys } = s;
  const r0 = ys.i0[y] * width;
  const r1 = ys.i1[y] * width;
  const a = xs.i0[x];
  const b = xs.i1[x];
  const fx = xs.f[x];
  const top = data[r0 + a] + (data[r0 + b] - data[r0 + a]) * fx;
  const bottom = data[r1 + a] + (data[r1 + b] - data[r1 + a]) * fx;
  return top + (bottom - top) * ys.f[y];
}

/** 1 bit per pixel: set where the pixel is land. */
export function isLandBit(bits, i) {
  return (bits[i >> 3] >> (i & 7)) & 1;
}

/** Packs the red channel of a white-on-black canvas into bits, a band at a time. */
function packMask(ctx, W, H) {
  const bits = new Uint8Array(Math.ceil((W * H) / 8));
  const band = 64;
  for (let y0 = 0; y0 < H; y0 += band) {
    const rows = Math.min(band, H - y0);
    const data = ctx.getImageData(0, y0, W, rows).data;
    const offset = y0 * W;
    for (let p = 0, n = W * rows; p < n; p++) {
      if (data[p * 4] > 127) {
        const i = offset + p;
        bits[i >> 3] |= 1 << (i & 7);
      }
    }
  }
  return bits;
}

/** Land mask canvas (white land on black ocean) plus its 1-bit copy. */
function paintMask(world, W, makeCanvas) {
  const H = W / 2;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  geoPath(projectionFor(W, H), ctx)(world.land);
  ctx.fill();
  return { canvas, land: { bits: packMask(ctx, W, H), width: W, height: H } };
}

/** Only the land/water mask, for the 2D map (no textures needed). */
export function paintLandMask(world, size, makeCanvas = defaultCanvas) {
  return paintMask(world, size, makeCanvas).land;
}

function defaultCanvas(width, height) {
  return new OffscreenCanvas(width, height);
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/**
 * Paints the day map, night-lights map, ocean mask and cloud map.
 * `size` is the texture width (height is half). Returns canvases from
 * `makeCanvas` and the 1-bit land mask used to answer "land or water?".
 */
export function paintEarth(world, size, makeCanvas = defaultCanvas) {
  const W = size;
  const H = size / 2;
  const projection = projectionFor(W, H);
  const { canvas: mask, land } = paintMask(world, W, makeCanvas);
  const { bits } = land;

  // Coastal glow: shrink the mask, then stretch it back up, which blurs it.
  const sw = W / 16;
  const sh = H / 16;
  const small = makeCanvas(sw, sh);
  const sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(mask, 0, 0, sw, sh);
  const coastRgba = sctx.getImageData(0, 0, sw, sh).data;
  const coastData = new Uint8Array(sw * sh);
  for (let i = 0; i < coastData.length; i++) coastData[i] = coastRgba[i * 4];
  const coast = stretch({ data: coastData, width: sw, height: sh }, W, H);

  const noiseA = stretch(noiseField(512, 256, 3.2, 5, 11.3), W, H);
  const noiseB = stretch(noiseField(256, 128, 9, 3, 47.1), W, H);

  const day = makeCanvas(W, H);
  const dctx = day.getContext("2d");
  const img = dctx.createImageData(W, H);
  const px = img.data;

  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    const absLat = Math.abs(lat);
    const boreal = clamp01((absLat - 50) / 14);
    const polar = clamp01((absLat - 55) / 25);
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const i = p * 4;
      const n = sample(noiseA, x, y) / 255;
      const n2 = sample(noiseB, x, y) / 255;
      let r, g, b;
      if (isLandBit(bits, p)) {
        const lon = ((x + 0.5) / W) * 360 - 180;
        const greenland = lat > 59 && lon > -74 && lon < -11;
        const ice = lat < -60 || greenland || absLat > 78 - n * 10;
        if (ice) {
          const t = 0.85 + n2 * 0.15;
          r = 226 * t;
          g = 234 * t;
          b = 240 * t;
        } else {
          // Subtropical deserts sit near ±15–35°; noise breaks up the bands.
          const desert = clamp01(1 - Math.abs(absLat - 24) / (12 + n * 10)) * clamp01((n - 0.38) * 3.2);
          // Vegetation fades to tundra towards the poles, then to sand in deserts.
          r = mix(mix(mix(52, 92, n2), 128, boreal), mix(190, 214, n2), desert);
          g = mix(mix(mix(84, 104, n2), 126, boreal), mix(158, 182, n2), desert);
          b = mix(mix(mix(36, 52, n2), 108, boreal), mix(104, 124, n2), desert);
        }
        const relief = 0.82 + n2 * 0.3;
        r *= relief;
        g *= relief;
        b *= relief;
      } else {
        const shallow = clamp01((sample(coast, x, y) / 255) * 1.6);
        r = mix(mix(6, 22, shallow), 30, polar) + n2 * 6;
        g = mix(mix(28, 82, shallow), 56, polar) + n2 * 8;
        b = mix(mix(62, 112, shallow), 84, polar) + n2 * 10;
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  dctx.putImageData(img, 0, 0);

  // Country borders and coastlines on top.
  const path = geoPath(projection, dctx);
  dctx.lineWidth = Math.max(0.6, W / 4096);
  dctx.strokeStyle = "rgba(255,255,255,0.16)";
  dctx.beginPath();
  path(world.borders);
  dctx.stroke();
  dctx.strokeStyle = "rgba(190,230,255,0.22)";
  dctx.beginPath();
  path(world.land);
  dctx.stroke();

  // Night lights: city glows plus a faint scatter over populated latitudes.
  // Lights are soft, so half resolution on large maps saves GPU memory.
  const NW = Math.min(W, 2048);
  const NH = NW / 2;
  const nightProjection = projectionFor(NW, NH);
  const night = makeCanvas(NW, NH);
  const nctx = night.getContext("2d");
  nctx.fillStyle = "#000";
  nctx.fillRect(0, 0, NW, NH);
  nctx.globalCompositeOperation = "lighter";
  let seed = 1234567;
  const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967295;
  const dots = Math.round(NW * 22);
  const scale = W / NW;
  for (let k = 0; k < dots; k++) {
    const x = rand() * NW;
    const y = rand() * NH;
    const tx = Math.floor(x * scale);
    const ty = Math.floor(y * scale);
    const lat = 90 - (y / NH) * 180;
    if (!isLandBit(bits, ty * W + tx) || lat < -56 || lat > 70) continue;
    if (sample(noiseA, tx, ty) / 255 < 0.42 + Math.abs(lat) / 260) continue;
    nctx.fillStyle = `rgba(255,${180 + rand() * 50},${90 + rand() * 60},${0.2 + rand() * 0.35})`;
    nctx.fillRect(x, y, 1, 1);
  }
  for (const [, , lat, lon, pop] of CITIES) {
    const [x, y] = nightProjection([lon, lat]);
    const r = (NW / 2048) * (1.2 + Math.sqrt(pop) * 1.3);
    const grad = nctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,226,160,0.95)");
    grad.addColorStop(0.35, "rgba(255,180,90,0.45)");
    grad.addColorStop(1, "rgba(255,150,60,0)");
    nctx.fillStyle = grad;
    nctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Clouds: thresholded noise in the red channel (the shader uses it as alpha).
  // Noise is generated at the final resolution — thresholding an upscaled field
  // leaves blocky contours that show up when zoomed in.
  const cw = W >= 4096 ? 1024 : 768;
  const ch = cw / 2;
  const cloudNoise = noiseField(cw, ch, 4.5, 5, 91.7).data;
  const clouds = makeCanvas(cw, ch);
  const cctx = clouds.getContext("2d");
  const cimg = cctx.createImageData(cw, ch);
  for (let p = 0; p < cloudNoise.length; p++) {
    const y = Math.floor(p / cw);
    const lat = 90 - ((y + 0.5) / ch) * 180;
    // More cloud along the storm tracks (~±55°) and the tropics, less in the subtropics.
    const band = 0.08 * Math.cos((lat * Math.PI) / 30);
    const v = clamp01((cloudNoise[p] / 255 - 0.47 + band) * 3.4) * 255;
    const i = p * 4;
    cimg.data[i] = cimg.data[i + 1] = cimg.data[i + 2] = v;
    cimg.data[i + 3] = 255;
  }
  cctx.putImageData(cimg, 0, 0);

  // The shader only needs the mask for ocean glints, so the GPU copy can be small.
  const MW = Math.min(W, 2048);
  const maskSmall = makeCanvas(MW, MW / 2);
  maskSmall.getContext("2d").drawImage(mask, 0, 0, MW, MW / 2);

  return { day, night, mask: maskSmall, clouds, land };
}
