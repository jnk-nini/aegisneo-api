// Turns a simulation result into the rings drawn on the globe and listed in
// the results legend. Colours are shared by both so they always match.

export const ZONE_STYLES = {
  crater: { color: "#1b0f0a", line: "#ff9a52", label: "Crater" },
  fireball: { color: "#fff0b8", line: "#fff0b8", label: "Fireball" },
  steel: { color: "#b3122e", line: "#ff3d5a", label: "Steel-framed buildings near collapse" },
  masonry: { color: "#e5332a", line: "#ff5a4a", label: "Multistory masonry buildings collapse" },
  burns3: { color: "#ff5fb0", line: "#ff7cc0", label: "Third-degree burns" },
  wood: { color: "#ff8a3d", line: "#ffa260", label: "Wood-frame houses collapse" },
  trees90: { color: "#4fbf7a", line: "#7fe0a2", label: "Most trees blown down" },
  windows: { color: "#ffd166", line: "#ffe08f", label: "Windows shatter" },
};

export function zonesFor(result) {
  if (!result) return [];
  const zones = [];
  if (result.crater?.finalDiameterM) zones.push({ key: "crater", radiusM: result.crater.finalDiameterM / 2 });
  if (result.fireballRadiusM) zones.push({ key: "fireball", radiusM: result.fireballRadiusM });
  for (const z of result.blast) zones.push({ key: z.key, radiusM: z.radiusM });
  const burns = result.thermal.find((t) => t.key === "burns3");
  if (burns) zones.push({ key: "burns3", radiusM: burns.radiusM });
  const trees = result.wind.find((w) => w.key === "trees90");
  if (trees) zones.push({ key: "trees90", radiusM: trees.radiusM });
  return zones
    .filter((z) => z.radiusM > 0)
    .map((z) => ({ ...z, ...ZONE_STYLES[z.key] }))
    .sort((a, b) => b.radiusM - a.radiusM);
}

export function outermostRadiusM(result) {
  const zones = zonesFor(result);
  return zones.length ? zones[0].radiusM : 0;
}
