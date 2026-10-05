// Timing and shape of the fireball and mushroom cloud drawn by Plume.jsx, in
// units of the model's fireball radius. Illustrative, like the plume itself.
import { Vector3 } from "three";

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Fire colour for a temperature 0..1 (dull red to yellow-white), linear RGB. Matches the shader. */
export function fireColor(t, out = new Vector3()) {
  const mix = (a, b, k) => a + (b - a) * k;
  const k1 = smooth(0, 0.4, t);
  const k2 = smooth(0.4, 0.75, t);
  const k3 = smooth(0.75, 1, t);
  return out.set(
    mix(mix(mix(0.5, 1.0, k1), 1.0, k2), 1.0, k3),
    mix(mix(mix(0.03, 0.25, k1), 0.55, k2), 0.85, k3),
    mix(mix(mix(0.0, 0.03, k1), 0.15, k2), 0.55, k3),
  );
}

/**
 * Shape of the cloud at `tau` playback seconds after impact. `topUnits` is how
 * high the cap climbs; `frontUnits` is the air-blast front's radius: the base
 * surge rides just behind it until it leaves the drawn volume.
 */
export function plumeState(tau, topUnits, frontUnits = Infinity) {
  const surge = Math.min(0.5 + 2.2 * smooth(0.2, 4.5, tau), Math.max(frontUnits * 0.92, 0.3));
  const grow = smooth(0, 0.9, tau);
  const spread = smooth(1, 5.5, tau);
  const rise = 1 - Math.exp(-Math.max(0, tau - 0.3) / 2.2);
  return {
    capY: 0.55 * (0.4 + 0.6 * grow) + (topUnits - 0.55) * rise,
    capMajor: 0.1 + 1.5 * spread,
    capMinor: (0.4 + 0.6 * grow) * (1 - 0.3 * spread),
    stem: 0.3 * smooth(0.4, 2, tau) * (1 + 0.4 * spread),
    surge,
    surgeThick:
      0.22 * smooth(0.1, 1, tau) * (1 - smooth(6, 9.5, tau)) * (0.6 + 0.4 * smooth(0.3, 1.5, surge)),
    heat: 1 - smooth(0.3, 3.2, tau),
    groundHeat: 1 - smooth(0.5, 4, tau),
    opacity: smooth(0, 0.15, tau) * (1 - smooth(7.5, 10, tau)),
  };
}

/**
 * The ejecta rocks are also drawn on this layer, alone, to give the volume the
 * distance to the nearest rock in each pixel; `rockDistancePass` switches
 * their shader to writing that distance.
 */
export const ROCK_LAYER = 3;
export const rockDistancePass = { value: 0 };
