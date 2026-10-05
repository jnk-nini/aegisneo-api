import { useEffect, useRef } from "react";

const API_HOME = "https://aegisneo-api.vercel.app";

export default function AboutDialog({ open, onClose }) {
  const ref = useRef();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="about" onClose={onClose} aria-labelledby="about-title">
      <div className="about-body">
        <header>
          <h2 id="about-title">About Impactor</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p>
          Impactor lets you strike Earth with real near-Earth asteroids and see what would happen. It is a
          separate website built on the{" "}
          <a href={API_HOME} target="_blank" rel="noreferrer">
            AegisNEO API
          </a>
          , which serves 33,000+ close approaches from NASA near-Earth object records (compiled on Kaggle,
          1910–2024).
        </p>

        <h3>How it uses the AegisNEO API</h3>
        <ul>
          <li>
            <code>GET /api/v1/asteroids?search=…</code> — the asteroid search
          </li>
          <li>
            <code>GET /api/v1/asteroids?sort=diameter&amp;order=desc</code> — “Largest” and “Closest flybys”
          </li>
          <li>
            <code>GET /api/v1/asteroids/random?hazardous=true</code> — “Random” picks
          </li>
          <li>
            <code>GET /api/v1/asteroids/{"{id}"}</code> — famous asteroids and shared links
          </li>
        </ul>
        <p className="muted">
          Requests pass through this site&apos;s own server function, which adds the API key, so the key is
          never sent to your browser.
        </p>

        <h3>The science</h3>
        <p>
          Atmospheric entry (breakup and airbursts), crater size, fireball, heat, earthquake magnitude and air
          blast follow Collins, Melosh &amp; Marcus (2005), “Earth Impact Effects Program”,{" "}
          <em>Meteoritics &amp; Planetary Science</em> 40(6), 817–840. The model is checked against
          Chelyabinsk, Tunguska, Meteor Crater and Chicxulub in this project&apos;s automated tests.
        </p>
        <ul>
          <li>
            Diameter and flyby speed come from the catalog. Entry speed adds Earth&apos;s escape velocity
            (11.2 km/s).
          </li>
          <li>
            The catalog has no density, so you choose a composition. Stony (3,000 kg/m³) is the default.
          </li>
          <li>
            Tsunami height, fires spreading and long-term climate effects aren&apos;t modelled. In the
            animation, the tsunami ring, worldwide fires and dust veil are illustrative.
          </li>
          <li>
            For very high airbursts, the ground blast uses whichever is larger: the paper&apos;s fit or its
            surface-burst curve at slant range (the fit alone underestimates events like Chelyabinsk).
          </li>
          <li>
            Asteroid size in the animation is enlarged so you can see it. The crater&apos;s width, the damage
            on the ground and the zone outlines are drawn to scale. Crater depth is exaggerated when it would
            be too flat to see; the playback bar says by how much.
          </li>
          <li>
            Crater formation takes seconds to minutes; the blast takes hours to cross the largest zones. So
            both fit, the aftermath clock can speed up as it plays. The time shown is always real.
          </li>
        </ul>
        <p className="muted">These are estimates for learning, not predictions of real hazards.</p>

        <h3>Your data</h3>
        <p className="muted">
          No accounts and no tracking. Saved scenarios stay in this browser (localStorage), and share links
          hold the whole scenario in the URL.
        </p>

        <h3>Credits</h3>
        <ul className="muted">
          <li>Country outlines: Natural Earth (public domain), via the world-atlas package.</li>
          <li>
            3D: three.js and React Three Fiber. The Earth textures are generated in your browser from those
            outlines.
          </li>
          <li>Asteroid data: AegisNEO API (NASA near-Earth object data via Kaggle, 1910–2024).</li>
        </ul>
      </div>
    </dialog>
  );
}
