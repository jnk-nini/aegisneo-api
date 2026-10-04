// Impact physics following Collins, Melosh & Marcus (2005), "Earth Impact
// Effects Program: A Web-based computer program for calculating the regional
// environmental consequences of a meteoroid impact on Earth", Meteoritics &
// Planetary Science 40(6), 817–840. Equation numbers in comments refer to that
// paper. All internal units are SI (m, kg, s, J, Pa) unless a name says otherwise.

export const EARTH_RADIUS_M = 6.371e6;
export const EARTH_ESCAPE_VELOCITY_KMS = 11.19;
const G_EARTH = 9.81;
const SCALE_HEIGHT_M = 8000; // H, Eq. 5
const SURFACE_AIR_DENSITY = 1; // ρ0, Eq. 5
const DRAG_COEFFICIENT = 2; // C_D, Eq. 6
const PANCAKE_FACTOR = 7; // f_p, Eq. 18
const JOULES_PER_MEGATON = 4.184e15;
const JOULES_PER_KILOTON = 4.184e12;
const LUMINOUS_EFFICIENCY = 3e-3; // η, Eq. 34
const SIMPLE_COMPLEX_TRANSITION_M = 3200; // D_c, Eq. 27
const AMBIENT_PRESSURE_PA = 1e5; // P0, Eq. 59
const SOUND_SPEED_MS = 330; // c0, Eq. 59/64
const WATER_DENSITY = 1000;
const WATER_DRAG_COEFFICIENT = 0.877; // Eq. 65
const SEAFLOOR_DENSITY = 2700;
const ATMOSPHERE_MIN_DIAMETER_M = 1000; // entry model only applies below 1 km

export const COMPOSITIONS = {
  ice: { label: "Icy (comet-like)", density: 1000 },
  porous: { label: "Porous rock", density: 1500 },
  stony: { label: "Stony", density: 3000 },
  iron: { label: "Iron", density: 8000 },
};

export const TARGETS = {
  sedimentary: { label: "Sedimentary rock", density: 2500 },
  crystalline: { label: "Crystalline rock", density: 2750 },
};

// Table 1 — thermal exposure (J/m²) needed for each effect during a 1 Mt event.
const THERMAL_THRESHOLDS = [
  { key: "clothing", label: "Clothing ignites", exposure1Mt: 1.0e6 },
  { key: "burns3", label: "Third-degree burns", exposure1Mt: 0.42e6 },
  { key: "burns2", label: "Second-degree burns", exposure1Mt: 0.25e6 },
];

// Table 4 — peak overpressure damage levels.
const BLAST_THRESHOLDS = [
  { key: "steel", label: "Steel-framed buildings near collapse", pressure: 273000 },
  { key: "masonry", label: "Multistory masonry buildings collapse", pressure: 42600 },
  { key: "wood", label: "Wood-frame houses collapse", pressure: 26800 },
  { key: "windows", label: "Windows shatter", pressure: 6900 },
];

// Eq. 59 discussion — peak wind speeds that blow down trees.
const WIND_THRESHOLDS = [
  { key: "trees90", label: "Up to 90% of trees blown down", speed: 62 },
  { key: "trees30", label: "About 30% of trees blown down", speed: 40 },
];

/** Speed at the top of the atmosphere for an object passing Earth at `relativeKms`. */
export function atmosphericEntrySpeed(relativeKms) {
  // Earth's gravity accelerates an incoming body: v² = v∞² + v_esc².
  return Math.sqrt(relativeKms ** 2 + EARTH_ESCAPE_VELOCITY_KMS ** 2);
}

export function kineticEnergy(diameterM, density, velocityMs) {
  return (Math.PI / 12) * density * diameterM ** 3 * velocityMs ** 2; // Eq. 1
}

const airDensity = (z) => SURFACE_AIR_DENSITY * Math.exp(-z / SCALE_HEIGHT_M); // Eq. 5

/** Pancake-model ∫ e^{(z*−z)/H} L(z)² dz from `zLow` to the breakup altitude (Eq. 17). */
export function pancakeIntegral(zLow, zStar, diameterM, dispersionLength) {
  const H = SCALE_HEIGHT_M;
  const n = 400; // Simpson's rule, even number of intervals
  const h = (zStar - zLow) / n;
  const f = (z) => {
    const expansion = Math.exp((zStar - z) / (2 * H)) - 1;
    const L2 = diameterM ** 2 * (1 + ((2 * H) / dispersionLength) ** 2 * expansion ** 2); // Eq. 15
    return Math.exp((zStar - z) / H) * L2;
  };
  let sum = f(zLow) + f(zStar);
  for (let i = 1; i < n; i++) sum += f(zLow + i * h) * (i % 2 ? 4 : 2);
  return (sum * h) / 3;
}

/**
 * Atmospheric entry (Eqs. 8–20): does the body reach the ground intact, break
 * up and strike as a fragment swarm, or disperse completely in an airburst?
 */
export function atmosphericEntry({ diameterM, density, velocityMs, angleDeg }) {
  const sinT = Math.sin((angleDeg * Math.PI) / 180);
  const H = SCALE_HEIGHT_M;
  const Cd = DRAG_COEFFICIENT;

  if (diameterM >= ATMOSPHERE_MIN_DIAMETER_M) {
    return {
      regime: "intact",
      impactVelocityMs: velocityMs,
      breakupAltitudeM: null,
      airburstAltitudeM: null,
      diameterAtGroundM: diameterM,
    };
  }

  const yieldStrength = 10 ** (2.107 + 0.0624 * Math.sqrt(density)); // Eq. 9
  const strengthFactor = (4.07 * Cd * H * yieldStrength) / (density * diameterM * velocityMs ** 2 * sinT); // Eq. 12

  const terminalVelocity = Math.sqrt((4 * density * diameterM * G_EARTH) / (3 * SURFACE_AIR_DENSITY * Cd));
  const intactVelocityAt = (z) =>
    velocityMs * Math.exp(-(3 * airDensity(z) * Cd * H) / (4 * density * diameterM * sinT)); // Eq. 8

  let zStar = null;
  if (strengthFactor < 1) {
    zStar =
      -H *
      (Math.log(yieldStrength / (SURFACE_AIR_DENSITY * velocityMs ** 2)) +
        1.308 -
        0.314 * strengthFactor -
        1.303 * Math.sqrt(1 - strengthFactor)); // Eq. 11
  }

  if (zStar === null || zStar <= 0) {
    return {
      regime: "intact",
      impactVelocityMs: Math.max(intactVelocityAt(0), terminalVelocity),
      breakupAltitudeM: null,
      airburstAltitudeM: null,
      diameterAtGroundM: diameterM,
    };
  }

  const rhoStar = airDensity(zStar);
  const velocityAtBreakup = intactVelocityAt(zStar);
  const dispersionLength = diameterM * sinT * Math.sqrt(density / (Cd * rhoStar)); // Eq. 16
  const airburstAltitude =
    zStar - 2 * H * Math.log(1 + (dispersionLength / (2 * H)) * Math.sqrt(PANCAKE_FACTOR ** 2 - 1)); // Eq. 18
  const velocityBelowBreakup = (z) =>
    velocityAtBreakup *
    Math.exp(
      (-((3 / 4) * (Cd * rhoStar)) / (density * diameterM ** 3 * sinT)) *
        pancakeIntegral(z, zStar, diameterM, dispersionLength),
    ); // Eq. 17

  if (airburstAltitude > 0) {
    return {
      regime: "airburst",
      impactVelocityMs: velocityBelowBreakup(airburstAltitude),
      breakupAltitudeM: zStar,
      airburstAltitudeM: airburstAltitude,
      diameterAtGroundM: null,
    };
  }

  const expansion = Math.exp(zStar / (2 * H)) - 1;
  const diameterAtGround = diameterM * Math.sqrt(1 + ((2 * H) / dispersionLength) ** 2 * expansion ** 2); // Eq. 15 at z = 0
  // Fragments slow no further than a half-size fragment's terminal velocity (Eq. 19 discussion).
  const halfFragmentTerminal = terminalVelocity / Math.SQRT2;
  return {
    regime: "fragmented",
    impactVelocityMs: Math.max(velocityBelowBreakup(0), halfFragmentTerminal),
    breakupAltitudeM: zStar,
    airburstAltitudeM: null,
    diameterAtGroundM: diameterAtGround,
  };
}

/** Transient + final crater dimensions (Eqs. 21–28). Returns metres. */
export function craterSize({ diameterM, density, velocityMs, angleDeg, targetDensity, waterTarget = false }) {
  const sinT = Math.sin((angleDeg * Math.PI) / 180);
  const constant = waterTarget ? 1.365 : 1.161;
  const transient =
    constant *
    (density / targetDensity) ** (1 / 3) *
    diameterM ** 0.78 *
    velocityMs ** 0.44 *
    G_EARTH ** -0.22 *
    sinT ** (1 / 3); // Eq. 21

  if (transient > 1.5e6) {
    // Extremely large events melt more rock than the crater holds (Eq. 30 discussion).
    return { transientDiameterM: transient, finalDiameterM: null, depthM: null, type: "melt-province" };
  }

  if (transient <= 2560) {
    const final = 1.25 * transient; // Eq. 22
    const transientDepth = transient / (2 * Math.SQRT2); // Eq. 25
    const rimHeight = (0.07 * transient ** 4) / final ** 3; // Eq. 48
    const brecciaVolume = 0.032 * final ** 3; // Eq. 23
    const brecciaThickness =
      (2.8 * brecciaVolume * (transientDepth + rimHeight)) / (transientDepth * final ** 2); // Eq. 24
    return {
      transientDiameterM: transient,
      finalDiameterM: final,
      depthM: transientDepth + rimHeight - brecciaThickness, // Eq. 26
      type: "simple",
    };
  }

  const final = (1.17 * transient ** 1.13) / SIMPLE_COMPLEX_TRANSITION_M ** 0.13; // Eq. 27
  const depthKm = 0.4 * (final / 1000) ** 0.3; // Eq. 28
  return { transientDiameterM: transient, finalDiameterM: final, depthM: depthKm * 1000, type: "complex" };
}

/** Fraction of the fireball visible above the horizon at range r (Eqs. 36–37). */
function fireballVisibleFraction(rangeM, fireballRadiusM) {
  const delta = rangeM / EARTH_RADIUS_M;
  const hidden = (1 - Math.cos(delta)) * EARTH_RADIUS_M; // Eq. 37
  if (hidden >= fireballRadiusM) return 0;
  const halfAngle = Math.acos(hidden / fireballRadiusM);
  return (2 / Math.PI) * (halfAngle - (hidden / fireballRadiusM) * Math.sin(halfAngle)); // Eq. 36
}

/**
 * Largest range at which `valueAt(r)` is still ≥ `threshold`. Scans a log grid
 * (blast pressure is not strictly monotonic across the Mach-reflection edge)
 * and then bisects inside the last bracket. Returns 0 if never reached.
 */
function outermostRange(valueAt, threshold, maxRangeM = Math.PI * EARTH_RADIUS_M) {
  const steps = 240;
  const rMin = 1;
  const ratio = (maxRangeM / rMin) ** (1 / steps);
  let lastInside = null;
  let r = rMin;
  for (let i = 0; i <= steps; i++, r *= ratio) {
    if (valueAt(r) >= threshold) lastInside = r;
  }
  if (lastInside === null) return 0;
  let lo = lastInside;
  let hi = Math.min(lastInside * ratio, maxRangeM);
  if (valueAt(hi) >= threshold) return hi;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (valueAt(mid) >= threshold) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Peak overpressure (Pa) at ground range r from a burst of energy E at altitude zb (Eqs. 54–58). */
export function peakOverpressure(rangeM, energyJ, burstAltitudeM = 0) {
  const yieldKt = energyJ / JOULES_PER_KILOTON;
  const cubeRoot = Math.cbrt(yieldKt);
  const r1 = rangeM / cubeRoot; // Eq. 57
  const zb1 = burstAltitudeM / cubeRoot;
  const px = 75000;

  const machRegion = (rx) => ((px * rx) / (4 * r1)) * (1 + 3 * (rx / r1) ** 1.3); // Eq. 54
  if (zb1 <= 0) return machRegion(290);

  const p0 = 3.14e11 * zb1 ** -2.6; // Eq. 56a
  const beta = 34.87 * zb1 ** -1.73; // Eq. 56b
  const exponentialFit = p0 * Math.exp(-beta * r1); // Eq. 55
  // Adjustment (not in the paper): far above the Mach ceiling the exponential
  // fit drops much faster than observed — for Chelyabinsk (~30 km burst) it
  // predicts ~0.15 kPa at the ground against a measured few kPa. We also take
  // the surface-burst curve (Eq. 54) at the slant range and keep the larger.
  const slantR1 = Math.hypot(rangeM, burstAltitudeM) / cubeRoot;
  const slantSurfaceCurve = ((px * 290) / (4 * slantR1)) * (1 + 3 * (290 / slantR1) ** 1.3);
  const regularReflection = Math.max(exponentialFit, slantSurfaceCurve);
  if (zb1 >= 550) return regularReflection;
  const machStart = (550 * zb1) / (1.2 * (550 - zb1)); // Eq. 58
  return r1 < machStart ? regularReflection : machRegion(289 + 0.65 * zb1);
}

/** Peak wind speed behind the shock front (Eq. 59). */
export function peakWindSpeed(overpressurePa) {
  const ratio = overpressurePa / (7 * AMBIENT_PRESSURE_PA);
  return ((5 * overpressurePa) / (7 * AMBIENT_PRESSURE_PA)) * (SOUND_SPEED_MS / Math.sqrt(1 + 6 * ratio));
}

export function seismicMagnitude(energyJ) {
  return 0.67 * Math.log10(energyJ) - 5.87; // Eq. 40
}

/** Average years between impacts of at least this energy anywhere on Earth (Eq. 3). */
export function recurrenceYears(megatons) {
  return 109 * megatons ** 0.78;
}

/** Modified Mercalli intensity near the impact for a Richter magnitude (Table 2). */
export function mercalliFor(magnitude) {
  const table = [
    [1, "—"],
    [2, "I"],
    [3, "I–II"],
    [4, "III–IV"],
    [5, "IV–V"],
    [6, "VI–VII"],
    [7, "VII–VIII"],
    [8, "IX–X"],
    [9, "X–XI"],
  ];
  for (const [limit, label] of table) if (magnitude < limit) return label;
  return "XII";
}

/**
 * Full scenario. Inputs:
 *  diameterM, density (kg/m³), velocityKms (top of atmosphere), angleDeg (from horizontal),
 *  surface: "land" | "water", waterDepthM, targetDensity (kg/m³, land only).
 */
export function simulateImpact({
  diameterM,
  density = COMPOSITIONS.stony.density,
  velocityKms,
  angleDeg = 45,
  surface = "land",
  waterDepthM = 3700,
  targetDensity = TARGETS.sedimentary.density,
}) {
  const velocityMs = velocityKms * 1000;
  const initialEnergy = kineticEnergy(diameterM, density, velocityMs);
  const initialMegatons = initialEnergy / JOULES_PER_MEGATON;
  const entry = atmosphericEntry({ diameterM, density, velocityMs, angleDeg });
  const isAirburst = entry.regime === "airburst";

  const result = {
    inputs: { diameterM, density, velocityKms, angleDeg, surface, waterDepthM, targetDensity },
    energy: { joules: initialEnergy, megatons: initialMegatons },
    entry,
    recurrenceYears: recurrenceYears(initialMegatons),
    crater: null,
    waterCrater: null,
    craterField: false,
    fireballRadiusM: null,
    thermal: [],
    blast: [],
    wind: [],
    seismic: null,
    blastEnergyJ: null,
    burstAltitudeM: isAirburst ? entry.airburstAltitudeM : 0,
  };

  // For an airburst the paper deposits all of the impact energy at the burst
  // altitude (Fig. 2a); otherwise effects use the energy at the surface.
  const surfaceEnergy = isAirburst
    ? initialEnergy
    : kineticEnergy(diameterM, density, entry.impactVelocityMs);
  result.blastEnergyJ = surfaceEnergy;

  if (!isAirburst) {
    const sinT = Math.sin((angleDeg * Math.PI) / 180);
    let craterVelocity = entry.impactVelocityMs;
    let seismicEnergy = surfaceEnergy;

    if (surface === "water") {
      result.waterCrater = craterSize({
        diameterM,
        density,
        velocityMs: entry.impactVelocityMs,
        angleDeg,
        targetDensity: WATER_DENSITY,
        waterTarget: true,
      });
      const swarmDiameter = entry.diameterAtGroundM ?? diameterM;
      craterVelocity =
        entry.impactVelocityMs *
        Math.exp(
          -(3 * WATER_DENSITY * WATER_DRAG_COEFFICIENT * waterDepthM) / (2 * density * swarmDiameter * sinT),
        ); // Eq. 65
      seismicEnergy = kineticEnergy(diameterM, density, craterVelocity);
    }

    // Crater uses the original diameter: mass is conserved even if the swarm has spread.
    const crater = craterSize({
      diameterM,
      density,
      velocityMs: craterVelocity,
      angleDeg,
      targetDensity: surface === "water" ? SEAFLOOR_DENSITY : targetDensity,
    });
    result.crater = crater;
    if (entry.regime === "fragmented" && entry.diameterAtGroundM / sinT >= crater.transientDiameterM) {
      result.craterField = true;
    }

    result.seismic = { magnitude: seismicMagnitude(seismicEnergy) };
    result.seismic.mercalli = mercalliFor(result.seismic.magnitude);

    // Thermal radiation only matters for impacts faster than ~15 km/s (Eq. 32 discussion).
    if (entry.impactVelocityMs >= 15000) {
      const fireballRadius = 0.002 * Math.cbrt(surfaceEnergy); // Eq. 32
      result.fireballRadiusM = fireballRadius;
      const megatons = surfaceEnergy / JOULES_PER_MEGATON;
      const exposureAt = (r) =>
        (fireballVisibleFraction(r, fireballRadius) * LUMINOUS_EFFICIENCY * surfaceEnergy) /
        (2 * Math.PI * r * r); // Eqs. 34, 36
      result.thermal = THERMAL_THRESHOLDS.map((t) => ({
        key: t.key,
        label: t.label,
        radiusM: outermostRange(exposureAt, t.exposure1Mt * megatons ** (1 / 6)), // Eq. 39
      })).filter((t) => t.radiusM > 0);
    }
  }

  const pressureAt = (r) => peakOverpressure(r, surfaceEnergy, result.burstAltitudeM);
  result.groundZeroPressurePa = pressureAt(1);
  result.blast = BLAST_THRESHOLDS.map((t) => ({
    key: t.key,
    label: t.label,
    pressurePa: t.pressure,
    radiusM: outermostRange(pressureAt, t.pressure),
  })).filter((t) => t.radiusM > 0);
  result.wind = WIND_THRESHOLDS.map((t) => ({
    key: t.key,
    label: t.label,
    speedMs: t.speed,
    radiusM: outermostRange((r) => peakWindSpeed(pressureAt(r)), t.speed),
  })).filter((t) => t.radiusM > 0);

  return result;
}

/** Seconds for the air blast to reach range r, treating it as a sound wave (Eq. 64). */
export function blastArrivalSeconds(rangeM) {
  return rangeM / SOUND_SPEED_MS;
}

export { JOULES_PER_MEGATON };
