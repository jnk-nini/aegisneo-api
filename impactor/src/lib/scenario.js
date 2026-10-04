// Restores a scenario from a share link or a saved entry.
import { useSim } from "../store.js";
import { api } from "./api.js";
import { queryToScenario } from "./share.js";
import { pickTarget } from "./target.js";
import { COMPOSITIONS } from "../physics/impact.js";

export async function applyScenarioQuery(query, { launch = false } = {}) {
  const scenario = queryToScenario(query, COMPOSITIONS);
  if (!scenario) return false;
  if (scenario.asteroidId) {
    try {
      const asteroid = await api.get(scenario.asteroidId);
      useSim.getState().selectAsteroid(asteroid);
    } catch {
      // The object may have been removed from the catalog; keep the custom values.
    }
  }
  useSim.setState({
    diameterM: scenario.diameterM,
    velocityKms: scenario.velocityKms,
    angleDeg: scenario.angleDeg,
    azimuthDeg: scenario.azimuthDeg,
    composition: scenario.composition,
  });
  if (scenario.target) await pickTarget(scenario.target.lat, scenario.target.lon);
  if (launch && useSim.getState().target) useSim.getState().launch();
  return true;
}
