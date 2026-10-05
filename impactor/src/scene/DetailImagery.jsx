// Streams sharper NASA imagery around wherever the camera is looking (see
// lib/gibs.js and detailDay() in surfaceShader.js), so zooming in shows real
// terrain instead of the globe texture's stretched pixels. The window is a
// few tiles across at the level that matches the screen's resolution there;
// it is rebuilt off to the side and swapped in whole once its tiles arrive.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace, SRGBColorSpace } from "three";
import { LAYERS, drawLayer, levelFor, tileSpan } from "../lib/gibs.js";
import { useSim } from "../store.js";
import { EARTH_RADIUS_M } from "../physics/impact.js";
import { vectorToLatLon } from "./sphereMath.js";
import { detailUniforms } from "./surfaceShader.js";

const CHECK_SECONDS = 0.3;
const MIN_LEVEL = 4; // coarser than this, the globe's own texture is as sharp

function makeLayer(size, srgb) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  return { canvas, texture };
}

export default function DetailImagery({ baseDay }) {
  const camera = useThree((s) => s.camera);
  const height = useThree((s) => s.size.height);
  // Phones and weak GPUs get a window half as wide (a quarter of the memory and upload).
  const light = useSim((s) => s.quality === "low");
  const size = light ? 1024 : 2048;
  const tiles = size / 512;
  const layers = useMemo(() => ({ color: makeLayer(size, true), relief: makeLayer(size, false) }), [size]);
  const state = useRef({ key: "", wanted: "", build: 0, since: 0 });

  useEffect(() => {
    detailUniforms.detailColor.value = layers.color.texture;
    detailUniforms.detailRelief.value = layers.relief.texture;
    return () => {
      detailUniforms.detailOn.value.set(0, 0);
      layers.color.texture.dispose();
      layers.relief.texture.dispose();
    };
  }, [layers]);

  const build = async (z, col0, row0, key) => {
    const s = state.current;
    const id = ++s.build;
    const span = tileSpan(z);
    const win = {
      lon0: col0 * span - 180,
      latN: 90 - row0 * span,
      widthDeg: tiles * span,
      heightDeg: tiles * span,
    };
    const zColor = Math.min(z, LAYERS.color.maxZ);
    const color = document.createElement("canvas");
    color.width = color.height = size;
    const cctx = color.getContext("2d");
    // Under the tiles, the globe's own map, in case some don't arrive.
    if (baseDay?.image) {
      const img = baseDay.image;
      for (const shift of [-360, 0, 360]) {
        const x = ((-180 + shift - win.lon0) / win.widthDeg) * size;
        const y = ((win.latN - 90) / win.heightDeg) * size;
        cctx.drawImage(img, x, y, (360 / win.widthDeg) * size, (180 / win.heightDeg) * size);
      }
    }
    const relief = document.createElement("canvas");
    relief.width = relief.height = size;
    const rctx = relief.getContext("2d");
    rctx.fillStyle = "#808080";
    rctx.fillRect(0, 0, size, size);
    const useRelief = z >= 5;
    await Promise.all([
      drawLayer(cctx, "color", zColor, win),
      useRelief ? drawLayer(rctx, "relief", z, win) : null,
    ]);
    if (id !== s.build) return; // superseded while loading
    layers.color.canvas.getContext("2d").drawImage(color, 0, 0);
    layers.relief.canvas.getContext("2d").drawImage(relief, 0, 0);
    layers.color.texture.needsUpdate = true;
    layers.relief.texture.needsUpdate = true;
    const u = ((((win.lon0 + 180) / 360) % 1) + 1) % 1;
    detailUniforms.detailRect.value.set(
      u,
      (win.latN - win.heightDeg + 90) / 180,
      win.widthDeg / 360,
      win.heightDeg / 180,
    );
    detailUniforms.detailOn.value.set(1, useRelief ? 1 : 0);
    s.key = key;
  };

  useFrame((_, dt) => {
    const s = state.current;
    s.since += dt;
    if (s.since < CHECK_SECONDS) return;
    s.since = 0;
    const target = camera.userData.lookAt;
    const look = target && target.length() > 0.5 ? target : camera.position.clone().normalize();
    const dist = camera.position.distanceTo(look);
    // Ground metres per screen pixel at the centre of the view.
    const metres =
      ((2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(height, 1)) * EARTH_RADIUS_M;
    // A little coarser than the centre needs, so a tilted view's far side is covered too.
    const z = Math.min(LAYERS.relief.maxZ, Math.round(levelFor(metres) - 0.6));
    if (z < MIN_LEVEL) {
      detailUniforms.detailOn.value.set(0, 0);
      s.key = "";
      s.wanted = "";
      s.build++;
      return;
    }
    // Centre the window a little ahead of the look-at point, where a tilted view sees most ground.
    const up = look.clone().normalize();
    const ahead = look.clone().sub(camera.position);
    ahead.addScaledVector(up, -ahead.dot(up));
    const { lat, lon } = vectorToLatLon(up.addScaledVector(ahead, 0.6));
    const span = tileSpan(z);
    const rows = Math.ceil(180 / span);
    const col0 = Math.floor((lon + 180) / span - tiles / 2 + 0.5);
    const row0 = Math.min(rows - tiles, Math.max(0, Math.floor((90 - lat) / span - tiles / 2 + 0.5)));
    const key = `${z}/${col0}/${row0}`;
    if (key === s.key || key === s.wanted) return;
    s.wanted = key;
    build(z, col0, row0, key);
  });

  return null;
}
