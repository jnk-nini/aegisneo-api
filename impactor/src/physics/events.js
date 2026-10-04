// Reference events for scale. Energies are commonly cited estimates
// (megatons of TNT); ranges in the literature are wide, so treat as approximate.
export const REFERENCE_EVENTS = [
  { name: "Hiroshima bomb (1945)", megatons: 0.015 },
  { name: "Chelyabinsk airburst (2013)", megatons: 0.5 },
  { name: "Tunguska event (1908)", megatons: 12 },
  { name: "Tsar Bomba, largest nuclear test (1961)", megatons: 50 },
  { name: "Krakatoa eruption (1883)", megatons: 200 },
  { name: "Meteor Crater impact, Arizona (~50,000 years ago)", megatons: 10 },
  { name: "Chicxulub impact, end of the dinosaurs (66 million years ago)", megatons: 1e8 },
];

/** Closest reference event (by order of magnitude) and how many times bigger/smaller. */
export function compareToEvents(megatons) {
  let best = REFERENCE_EVENTS[0];
  let bestGap = Infinity;
  for (const event of REFERENCE_EVENTS) {
    const gap = Math.abs(Math.log10(megatons / event.megatons));
    if (gap < bestGap) {
      best = event;
      bestGap = gap;
    }
  }
  return { event: best, ratio: megatons / best.megatons };
}

export function globalConsequence(megatons) {
  if (megatons >= 1e7)
    return "Global catastrophe: worldwide firestorms, years of darkness and cooling, and mass extinction.";
  if (megatons >= 1e5)
    return "Global effects likely: dust and soot in the stratosphere could cool the climate and threaten harvests worldwide.";
  if (megatons >= 1e3)
    return "Continental-scale devastation; noticeable but temporary effects on global weather are possible.";
  if (megatons >= 1)
    return "Regional disaster: severe damage around the impact site, little effect on the rest of the world.";
  return "Local event: dangerous near the site, with no lasting regional or global effects.";
}
