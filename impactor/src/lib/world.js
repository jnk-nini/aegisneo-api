// Loads Natural Earth country outlines (public domain, via the world-atlas
// package), answers "is this point land or water / which country", and paints
// the globe's textures on canvases. Everything is drawn in a true
// equirectangular projection so texture pixels line up with lat/lon exactly.

import { feature, mesh } from "topojson-client";
import { geoContains, geoEquirectangular, geoPath } from "d3-geo";
import countriesUrl from "world-atlas/countries-50m.json?url";
import { CITIES } from "../data/cities.js";

let worldPromise = null;
let landMask = null; // { data: Uint8ClampedArray, width, height }

export function loadWorld() {
  worldPromise ??= fetch(countriesUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`world map HTTP ${r.status}`);
      return r.json();
    })
    .then((topo) => ({
      countries: feature(topo, topo.objects.countries),
      land: feature(topo, topo.objects.land),
      borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
    }));
  return worldPromise;
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
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

/** Small noise field upscaled by the browser — cheap smooth noise for big textures. */
function noiseCanvas(width, height, frequency, octaves, seed) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const theta = ((y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x++) {
      const phi = ((x + 0.5) / width) * 2 * Math.PI;
      const nx = Math.sin(theta) * Math.cos(phi) * frequency + seed;
      const ny = Math.cos(theta) * frequency;
      const nz = Math.sin(theta) * Math.sin(phi) * frequency;
      const v = Math.round(fbm(nx, ny, nz, octaves) * 255);
      const i = (y * width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function pixelsOf(source, width, height, smoothing = true) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = smoothing;
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/**
 * Paints the day map, night-lights map, ocean mask and cloud map.
 * `size` is the texture width (height is half).
 */
export async function buildEarthTextures(size = 2048) {
  const world = await loadWorld();
  const W = size;
  const H = size / 2;
  const projection = projectionFor(W, H);

  // Land mask: white land on black ocean.
  const mask = makeCanvas(W, H);
  const mctx = mask.getContext("2d", { willReadFrequently: true });
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, W, H);
  mctx.fillStyle = "#fff";
  mctx.beginPath();
  geoPath(projection, mctx)(world.land);
  mctx.fill();
  const maskData = mctx.getImageData(0, 0, W, H).data;
  landMask = { data: maskData, width: W, height: H };

  // Coastal glow: downscale then upscale the mask, which blurs it on every browser.
  const small = makeCanvas(W / 16, H / 16);
  small.getContext("2d").drawImage(mask, 0, 0, W / 16, H / 16);
  const coast = pixelsOf(small, W, H);

  const noiseA = pixelsOf(noiseCanvas(512, 256, 3.2, 5, 11.3), W, H);
  const noiseB = pixelsOf(noiseCanvas(256, 128, 9, 3, 47.1), W, H);

  const day = makeCanvas(W, H);
  const dctx = day.getContext("2d");
  const img = dctx.createImageData(W, H);
  const px = img.data;

  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    const absLat = Math.abs(lat);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = noiseA[i] / 255;
      const n2 = noiseB[i] / 255;
      let r, g, b;
      if (maskData[i] > 127) {
        const lon = ((x + 0.5) / W) * 360 - 180;
        const greenland = lat > 59 && lon > -74 && lon < -11;
        const ice = lat < -60 || greenland || absLat > 78 - n * 10;
        // Subtropical deserts sit near ±15–35°; noise breaks up the bands.
        const desert = clamp01(1 - Math.abs(absLat - 24) / (12 + n * 10)) * clamp01((n - 0.38) * 3.2);
        const boreal = clamp01((absLat - 50) / 14);
        const veg = [mix(52, 92, n2), mix(84, 104, n2), mix(36, 52, n2)];
        const tundra = [128, 126, 108];
        const sand = [mix(190, 214, n2), mix(158, 182, n2), mix(104, 124, n2)];
        r = mix(mix(veg[0], tundra[0], boreal), sand[0], desert);
        g = mix(mix(veg[1], tundra[1], boreal), sand[1], desert);
        b = mix(mix(veg[2], tundra[2], boreal), sand[2], desert);
        if (ice) {
          const t = 0.85 + n2 * 0.15;
          r = 226 * t;
          g = 234 * t;
          b = 240 * t;
        }
        const relief = 0.82 + n2 * 0.3;
        r *= relief;
        g *= relief;
        b *= relief;
      } else {
        const shallow = clamp01((coast[i] / 255) * 1.6);
        const polar = clamp01((absLat - 55) / 25);
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
    const i = (Math.floor(y * scale) * W + Math.floor(x * scale)) * 4;
    const lat = 90 - (y / NH) * 180;
    if (maskData[i] < 128 || lat < -56 || lat > 70) continue;
    if (noiseA[i] / 255 < 0.42 + Math.abs(lat) / 260) continue;
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
  const cloudSource = noiseCanvas(cw, cw / 2, 4.5, 5, 91.7);
  const cloudNoise = cloudSource.getContext("2d").getImageData(0, 0, cw, cw / 2).data;
  const clouds = makeCanvas(cw, cw / 2);
  const cctx = clouds.getContext("2d");
  const cimg = cctx.createImageData(cw, cw / 2);
  for (let i = 0; i < cimg.data.length; i += 4) {
    const y = Math.floor(i / 4 / cw);
    const lat = 90 - ((y + 0.5) / (cw / 2)) * 180;
    // More cloud along the storm tracks (~±55°) and the tropics, less in the subtropics.
    const band = 0.08 * Math.cos((lat * Math.PI) / 30);
    const v = clamp01((cloudNoise[i] / 255 - 0.47 + band) * 3.4);
    cimg.data[i] = cimg.data[i + 1] = cimg.data[i + 2] = v * 255;
    cimg.data[i + 3] = 255;
  }
  cctx.putImageData(cimg, 0, 0);

  // The shader only needs the mask for ocean glints, so the GPU copy can be small.
  const maskSmall = makeCanvas(Math.min(W, 2048), Math.min(W, 2048) / 2);
  maskSmall.getContext("2d").drawImage(mask, 0, 0, maskSmall.width, maskSmall.height);

  return { day, night, mask: maskSmall, clouds };
}

/** "land" or "water" at a lat/lon, using the painted land mask. */
export function surfaceAt(lat, lon) {
  if (!landMask) return "land";
  const { data, width, height } = landMask;
  const x = Math.min(width - 1, Math.max(0, Math.floor(((lon + 180) / 360) * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)));
  return data[(y * width + x) * 4] > 127 ? "land" : "water";
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
