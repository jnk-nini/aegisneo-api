import { beforeEach, describe, expect, it } from "vitest";
import { realParamsFor, useSim } from "./store.js";

const BENNU = {
  neo_reference_id: "2101955",
  name: "101955 Bennu (1999 RQ36)",
  estimated_diameter_km: 0.49,
  relative_velocity_km_h: 21600, // 6 km/s flyby
};
const MANILA = { lat: 14.6, lon: 121, surface: "land", label: "Manila" };
const initial = useSim.getState();

describe("simulation store", () => {
  beforeEach(() => {
    useSim.setState(initial, true);
    useSim.setState({ view3d: true, webglFailed: false, reducedMotion: false });
  });

  it("selecting an asteroid loads its real size and entry speed and clears any run", () => {
    useSim.setState({ run: { id: 1 }, phase: "done" });
    useSim.getState().selectAsteroid(BENNU);
    const s = useSim.getState();
    expect(s.diameterM).toBeCloseTo(490, 6);
    expect(s.velocityKms).toBeCloseTo(realParamsFor(BENNU).velocityKms, 9);
    expect(s.velocityKms).toBeGreaterThan(6); // Earth's pull speeds it up on the way in
    expect(s.run).toBeNull();
    expect(s.phase).toBe("idle");
    expect(s.isHypothetical()).toBe(false);
  });

  it("changing size or speed makes the scenario hypothetical; composition doesn't", () => {
    useSim.getState().selectAsteroid(BENNU);
    useSim.getState().setParam("composition", "iron");
    expect(useSim.getState().isHypothetical()).toBe(false);
    useSim.getState().setParam("diameterM", 1000);
    expect(useSim.getState().isHypothetical()).toBe(true);
  });

  it("won't launch without a target", () => {
    useSim.getState().selectAsteroid(BENNU);
    useSim.getState().launch();
    expect(useSim.getState().run).toBeNull();
  });

  it("launch plays the animation in 3D, and jumps to results with reduced motion or on the 2D map", () => {
    useSim.getState().selectAsteroid(BENNU);
    useSim.getState().setTarget(MANILA);
    useSim.getState().launch();
    let s = useSim.getState();
    expect(s.phase).toBe("approach");
    expect(s.run.id).toBe(1);
    expect(s.run.target).toEqual(MANILA);
    expect(s.run.query).toContain("a=2101955");
    expect(s.run.result.energy.megatons).toBeGreaterThan(0);

    useSim.setState({ reducedMotion: true });
    useSim.getState().launch();
    s = useSim.getState();
    expect(s.run.id).toBe(2);
    expect(s.phase).toBe("done");
    expect(s.mobileTab).toBe("results");

    useSim.setState({ reducedMotion: false, view3d: false });
    useSim.getState().launch();
    expect(useSim.getState().phase).toBe("done");
  });

  it("a new target after a finished run clears it, but not mid-animation", () => {
    useSim.getState().selectAsteroid(BENNU);
    useSim.getState().setTarget(MANILA);
    useSim.getState().launch();
    useSim.getState().setTarget({ ...MANILA, lat: 10 });
    expect(useSim.getState().run).not.toBeNull();

    useSim.getState().setPhase("done");
    expect(useSim.getState().sheet).toBe("peek");
    useSim.getState().setTarget({ ...MANILA, lat: 11 });
    expect(useSim.getState().run).toBeNull();
    expect(useSim.getState().phase).toBe("idle");
  });

  it("damage-zone rings over the impact start off and can be turned on", () => {
    expect(useSim.getState().showZoneRings).toBe(false);
    useSim.getState().setShowZoneRings(true); // no localStorage here; must not throw
    expect(useSim.getState().showZoneRings).toBe(true);
  });

  it("starting over clears the asteroid, target and run", () => {
    useSim.getState().selectAsteroid(BENNU);
    useSim.getState().setTarget(MANILA);
    useSim.getState().setParam("angleDeg", 70);
    useSim.getState().launch();
    const before = useSim.getState().globeRequest;
    useSim.getState().reset(); // no history API here; must not throw
    const s = useSim.getState();
    expect(s.asteroid).toBeNull();
    expect(s.target).toBeNull();
    expect(s.run).toBeNull();
    expect(s.phase).toBe("idle");
    expect(s.angleDeg).toBe(45);
    expect(s.diameterM).toBe(100);
    expect(s.globeRequest).toBe(before + 1);
  });
});
