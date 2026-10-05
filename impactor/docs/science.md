# The science behind Impactor

What the numbers are based on, how the picture is drawn from them, and where both stop being accurate.

---

## 1. The impact model

`src/physics/impact.js` implements:

> Collins, G. S., Melosh, H. J. & Marcus, R. A. (2005). _Earth Impact Effects Program: A Web-based
> computer program for calculating the regional environmental consequences of a meteoroid impact on
> Earth._ Meteoritics & Planetary Science 40(6), 817–840.

Equation numbers from the paper are noted in the code.

| Stage             | What is calculated                                                                                               | Paper      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| Energy            | Kinetic energy ½mv², in joules and megatons of TNT                                                               | Eq. 1      |
| Recurrence        | How often an impact of this energy happens on Earth                                                              | Eq. 3      |
| Atmospheric entry | Breakup altitude, pancake spreading, airburst altitude, speed at the ground. Intact, fragment swarm or airburst. | Eqs. 8–20  |
| Crater            | Transient and final diameter and depth. Simple bowl or complex crater.                                           | Eqs. 21–28 |
| Fireball and heat | Fireball radius, thermal exposure, burn and ignition ranges                                                      | Eqs. 32–39 |
| Earthquake        | Richter magnitude, mapped to Mercalli intensity                                                                  | Eq. 40     |
| Air blast         | Peak overpressure and wind speed with distance, for ground and air bursts                                        | Eqs. 54–59 |
| Ocean impacts     | Water slowing the impactor before it reaches the seabed                                                          | Eq. 65     |

### Inputs and where they come from

| Input       | Source                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------- |
| Diameter    | AegisNEO catalog `estimated_diameter_km`, or the slider                                   |
| Entry speed | `√(flyby speed² + 11.2²)` km/s from the catalog's `relative_velocity_km_h`, or the slider |
| Density     | Chosen composition: icy 1,000 · porous 1,500 · stony 3,000 · iron 8,000 kg/m³             |
| Entry angle | Slider, 45° by default (the most likely angle)                                            |
| Surface     | Land or water at the target, from Natural Earth outlines                                  |
| Target rock | Sedimentary rock, 2,500 kg/m³                                                             |
| Ocean depth | 3,700 m (mean ocean depth)                                                                |

**Why add 11.2 km/s?** The catalog speed is relative to Earth far away. A body that actually hits is
accelerated by Earth's gravity, so its speed at the top of the atmosphere is the flyby speed and the
escape velocity combined in quadrature. Using the catalog speed alone would underestimate every impact.

### Damage zones

`src/physics/zones.js` turns the result into the zones shown on the globe and in the results panel:

| Zone                                  | From                  |
| ------------------------------------- | --------------------- |
| Crater                                | Final crater diameter |
| Fireball                              | Fireball radius       |
| Steel-framed buildings near collapse  | Overpressure          |
| Multistory masonry buildings collapse | Overpressure          |
| Wood-frame houses collapse            | Overpressure          |
| Windows shatter                       | Overpressure          |
| Third-degree burns                    | Thermal exposure      |
| Most trees blown down                 | Peak wind speed       |

The paper's blast and heat formulas assume a flat Earth. Past a quarter of the way round the planet
their results stop meaning a distance, so such zones are labelled **global** instead.

Blast arrival times assume the shock travels at the speed of sound. Reference events for scale
(`src/physics/events.js`): Hiroshima, Chelyabinsk, Meteor Crater, Tunguska, Tsar Bomba, Krakatoa and
Chicxulub, with commonly cited energy estimates.

### Checked against real events

`src/physics/impact.test.js` checks the model against:

| Event                  | Check                                                         |
| ---------------------- | ------------------------------------------------------------- |
| Chelyabinsk, 2013      | ~0.5 Mt airburst in the upper atmosphere                      |
| Tunguska, 1908         | ~10 Mt airburst a few km up, forest flattened over tens of km |
| Meteor Crater, Arizona | Iron impactor makes a ~1.2 km simple crater                   |
| Chicxulub              | A 10 km body makes a complex crater 100–250 km wide           |
| 1 kt surface burst     | Matches the paper's Table 4 distances within ~15%             |

---

## 2. Model assumptions

- The catalog has no density, so the user picks a composition (stony by default).
- Every ocean impact assumes the mean ocean depth of 3.7 km. Real depth at the target isn't used.
- Tsunamis aren't modelled, following the source paper.
- For very high airbursts the ground blast uses whichever is larger: the paper's fit, or its
  surface-burst curve at slant range. With the fit alone Chelyabinsk would give ~0.15 kPa on the
  ground, against a measured few kPa.
- The model gives regional effects. Global effects (climate, extinction) are described in words from
  the impact energy, not calculated.

---

## 3. How the impact is drawn

Every effect on screen is sized from the model's result, so the picture matches the numbers.

- **Crater**: a detailed patch of ground at the impact site (`CraterPatch.jsx`), carved to the model's
  diameter and depth. Simple craters are a bowl with a raised rim. Complex ones get a flat floor,
  terraced walls and a central peak (a peak ring above 100 km). The crater digs out over
  ≈ 0.8·√(D/g) seconds and then collapses into its final shape. The globe's own mesh (~125 km per cell)
  is too coarse for this, so the globe leaves a hole there and the patch fills it with the same
  textures and lighting.
- **Depth**: real large craters are very flat (900 km wide, 3 km deep), so depth is scaled up to about
  1:10 of the width when needed. The playback bar shows the factor.
- **Ejecta**: launched on 45° ballistic arcs from the growing crater (an inverted cone), landing as a
  blanket that thins as r⁻³ (McGetchin et al. 1973).
- **Debris**: hot debris flies out in rays, more of it downrange after a slanting hit. Ranges follow a
  steep power law, so almost all of it lands near the crater and only the largest impacts send a thin
  tail far round the planet.
- **Ground damage**: charred land inside the clothing-ignition range, fires in the third-degree-burn
  range, flattened forest in the 90%-of-trees-down range, and city lights out where wood-frame houses
  collapse. Each appears when the blast or the heat reaches it.
- **Plume**: the fireball follows Eq. 32. For impacts big enough to affect the whole planet, the vapour
  plume that leaves the atmosphere is drawn larger (labelled "Fireball ×N").
- **Ocean impacts**: the water cavity opens and fills back in, and a ring crosses the ocean at
  deep-water wave speed √(g·h) ≈ 190 m/s. Once the water settles, the seabed crater the model gives
  shows through, with stirred-up sediment and floating debris.
- **Largest impacts** (about a million megatons and up, a ~2.5 km rock): ejecta falling back worldwide,
  spreading fires and a dust veil that browns the planet. Illustrative, scaled by impact energy.
- **Time**: excavation takes seconds to minutes, but the blast takes up to hours to reach its outer
  zones. When needed the aftermath clock speeds up as it plays so both fit. The time shown is always
  real.

---

## 4. Known limitations

Impactor is a teaching tool. These are the places where it is simplified, approximate, or only
illustrative. Anything drawn larger than real is labelled on screen.

### Physics

| Limitation                                 | Why                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| No tsunami height                          | The source model doesn't calculate one. The ring on the ocean only shows the wave speed. |
| One ocean depth everywhere (3.7 km)        | No bathymetry data is used in the calculation.                                           |
| Composition is a guess                     | The catalog has no density.                                                              |
| Catalog diameters are estimates            | They come from brightness (absolute magnitude), not direct measurement.                  |
| Flat-Earth blast and heat formulas         | Zones past a quarter of the globe are shown as "global" instead of a distance.           |
| Global effects are described, not modelled | Climate cooling, firestorms and extinction text are rules of thumb by energy.            |
| No planet-scale impactors                  | Sizes stop at 100 km. Breaking up the planet is outside the model.                       |

### Visuals

| Limitation                           | Detail                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Crater depth exaggerated             | Up to ~1:10 of the width so large craters are visible (labelled "Crater depth ×N").         |
| Fireball enlarged for global impacts | Labelled "Fireball ×N" or "Fireball size illustrative".                                     |
| Seabed drawn shallow and clear       | So the seabed crater can be seen through the water (labelled).                              |
| Real flyby direction                 | The catalog has no orbit, so only the miss distance is real. The direction is illustrative. |
| Clouds are not real weather          | They are generated, not satellite cloud cover.                                              |
| Night-side craters look dark         | Lighting follows the real sun, so an impact at night is lit mostly by its own fire.         |
| Imagery needs a connection           | Offline, or if NASA GIBS is unreachable, the painted globe is used instead.                 |

### App

| Limitation                       | Detail                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved scenarios are per browser  | They live in `localStorage`. Use _Copy link_ to move a scenario to another device.                                                              |
| Share links round values         | Diameter to 4 significant figures and speed to 0.01 km/s, so a reopened link can differ from the original by a fraction of a percent in energy. |
| Proxy is not access control      | Anyone can call `/api/neo/*`, and there is no rate limit.                                                                                       |
| 3D needs WebGL                   | Without it the 2D map is used. It gives full results but no animation.                                                                          |
| Weak devices get simpler effects | Quality drops automatically to keep the frame rate up.                                                                                          |
