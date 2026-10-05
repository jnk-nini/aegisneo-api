import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { blendPose, focusPose, newPose, slerpUnit } from "./effects.js";
import { latLonToVector, localFrame } from "./sphereMath.js";

const camera = { fov: 45, aspect: 16 / 9 };

describe("camera flights", () => {
  it("slerps between opposite directions without passing through zero", () => {
    const a = new Vector3(0, 0, 1);
    const b = new Vector3(0, 0, -1);
    const out = new Vector3();
    for (let t = 0; t <= 1.0001; t += 0.1) {
      slerpUnit(a, b, t, out);
      expect(out.length()).toBeCloseTo(1, 6);
    }
    expect(slerpUnit(a, b, 1, out).z).toBeCloseTo(-1, 6);
  });

  it("flies to a target on the far side of the globe over the top, not through or along it", () => {
    // Globe view looking at the near side; the target is directly behind Earth.
    const from = { position: new Vector3(0, 0, 3.3), target: new Vector3(), up: new Vector3(0, 1, 0) };
    const center = new Vector3(0, 0, -1);
    const to = focusPose(center, localFrame(center), 0.003, camera);
    const out = newPose();
    for (let t = 0; t <= 1.0001; t += 0.02) {
      blendPose(from, to, t, out);
      expect(Number.isFinite(out.position.length())).toBe(true);
      expect(Number.isFinite(out.up.length())).toBe(true);
      if (t > 0.05 && t < 0.95) expect(out.position.length()).toBeGreaterThan(1.001);
    }
    blendPose(from, to, 1, out);
    expect(out.position.distanceTo(to.position)).toBeLessThan(1e-9);
  });

  it("keeps the existing short hops unchanged at the ends", () => {
    const center = latLonToVector(14.6, 121).normalize();
    const frame = localFrame(center);
    const near = focusPose(center, frame, 0.01, camera);
    const far = focusPose(center, frame, 0.2, camera);
    const out = newPose();
    blendPose(near, far, 0, out);
    expect(out.position.distanceTo(near.position)).toBeLessThan(1e-9);
    blendPose(near, far, 1, out);
    expect(out.position.distanceTo(far.position)).toBeLessThan(1e-9);
  });

  it("frames the zone with a tilted, above-ground camera", () => {
    const center = latLonToVector(0, 0).normalize();
    const pose = focusPose(center, localFrame(center), 0.05, camera);
    expect(pose.position.length()).toBeGreaterThan(1);
    expect(pose.target.equals(center)).toBe(true);
  });
});
