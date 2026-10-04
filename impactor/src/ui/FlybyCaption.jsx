import { useSim } from "../store.js";
import { KM_PER_LD } from "../scene/Flyby.jsx";

/** Plain-language summary of the real close approach, shown over the flyby view. */
export default function FlybyCaption() {
  const mode = useSim((s) => s.mode);
  const asteroid = useSim((s) => s.asteroid);
  if (mode !== "flyby" || !asteroid) return null;
  const ld = asteroid.miss_distance_km / KM_PER_LD;
  const millionKm = asteroid.miss_distance_km / 1e6;
  const comparison =
    ld < 1 ? "closer than the Moon" : `${ld.toFixed(ld < 10 ? 1 : 0)}× farther away than the Moon`;
  return (
    <div className="flyby-caption" role="status">
      <strong>{asteroid.name}</strong> really passed Earth on {asteroid.close_approach_date} at{" "}
      {millionKm < 1
        ? `${Math.round(asteroid.miss_distance_km).toLocaleString()} km`
        : `${millionKm.toFixed(1)} million km`}{" "}
      — {comparison}. Drawn to scale. Drag to rotate, scroll or pinch to zoom.
    </div>
  );
}
