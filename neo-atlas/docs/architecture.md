# NEO Atlas architecture

How NEO Atlas is built: its parts, how data flows through them, and why there is no database.

---

## 1. Overview

NEO Atlas is a single-page React app (Vite build) deployed as its own Vercel project. It has no backend of
its own apart from one small serverless function that forwards read-only requests to the
[AegisNEO API](https://aegisneo-api.vercel.app/docs) with the site's API key.

```
Browser (React app)  ──/api/neo/*──▶  api/neo.js (Vercel function, adds the key)  ──▶  AegisNEO API
      │
      ├─ draws the chart (SVG) and the cards (canvas) on the device
      ├─ keeps saved constellations and the sender's name in localStorage
      └─ puts everything shareable in the link (no database)
```

| Layer            | Technology                                     |
| ---------------- | ---------------------------------------------- |
| UI               | React 19, plain CSS (one stylesheet)           |
| Chart            | SVG, with d3-zoom for pan and pinch            |
| Cards            | HTML canvas, 1080×1350 PNG                     |
| Build and tests  | Vite, Vitest, ESLint (with the React Compiler rules) |
| Hosting          | Vercel (static files + one serverless function) |

---

## 2. Folder structure

```
neo-atlas/
├─ api/neo.js                 The proxy: allows only read-only endpoints and parameters, adds the key
├─ index.html                 Page shell, link-preview tags
├─ public/                    favicon.svg, og.png (link preview picture)
├─ src/
│  ├─ App.jsx                 Screens, what is open, the address bar and Back button
│  ├─ main.jsx                Fonts, stylesheet, error boundary
│  ├─ hooks/                  useSky (load a sky), useViewing (a shared link), useDraft (drawing),
│  │                          useSaved, useFeatured, useHistorySync, useToast, useCatalogTotal
│  ├─ lib/                    Logic without React (all unit-tested):
│  │  ├─ api.js               API client: paging, retries, readable errors
│  │  ├─ chart.js, calendar.js  Where a star goes on the dial
│  │  ├─ sky.js               Which sky is shown, and its URL form
│  │  ├─ constellations.js    Constellations, share links, saving, export/import
│  │  ├─ auto.js              Constellations made automatically, and their names
│  │  ├─ facts.js             Everyday comparisons for sizes, speeds and distances
│  │  ├─ sign.js              The asteroid sign
│  │  ├─ match.js             Star Match: joining two birthdays, the match score
│  │  ├─ postcard.js          Postcard text, links, sealing, and drawing the card and envelope
│  │  ├─ signcard.js          Drawing the asteroid-sign card
│  │  ├─ files.js             Canvas → PNG, share, download, vibration
│  │  └─ prefs.js, random.js, format.js, highlights.js
│  ├─ ui/                     Components (see § 3)
│  └─ styles/global.css       All styles, phone first
├─ docs/                      This documentation
└─ tests/proxy.test.js        Tests for api/neo.js
```

---

## 3. Screens and components

| Screen                      | Components                                                        |
| --------------------------- | ----------------------------------------------------------------- |
| First visit                 | `Intro` (full-screen question over a starry sky)                  |
| Your constellation          | `ViewingBar` (name, Save), `StarChart` (reveal), `AutoCard`       |
| Postcard maker              | `PostcardComposer`, `CardCanvas`, `Burst`                         |
| Asteroid sign               | `SignCard`, `CardCanvas`                                          |
| Receiving a postcard        | `PostcardReceived` (envelope, countdown, Star Match form)         |
| Exploring                   | `SkyControls`, `ChartTip`, `Legend`, `SkySummary`, `HighlightChips`, `DetailSheet`, `DrawBar`, `ListView`, `ConstellationsView` |

`App.jsx` decides what is open. Overlays (postcards, the sign, the first-visit question) are `<dialog>`
elements opened with `showModal()`, so focus stays inside them and the page behind can't be tapped.

---

## 4. The main flows

### First visit → postcard

1. `Intro` returns a date such as `10-06`. The sky switches to that date and `autoFor` remembers it.
2. `useSky` loads every asteroid whose simulated date is that day, in any year (`search=-10-06`, paged).
3. When it has loaded, `autoConstellation()` joins the biggest of them and the view becomes
   `{ source: "auto" }`.
4. `StarChart` gets `reveal = constellation.id` and plays the reveal once (§ 7). `AutoCard` rises in under it.
5. **Make it a postcard** opens `PostcardComposer` with a fresh, blank state (it is mounted anew each time).

### A postcard link

1. `initialState()` reads the link: the constellation (`cs`, `cn`, `cm`), its sky (`d`/`y`), and the postcard
   fields (`pm`, `pf`, `pt`, `ps`).
2. `useViewing` fetches each asteroid by ID, so the card always shows the catalog's real values.
3. `PostcardReceived` shows the envelope, then the card (or the countdown while sealed).

### Star Match

1. On a birthday postcard, **Join our stars** calls `startMatch(date)`: the sky switches to the receiver's
   birthday and `matchFor` keeps the sender's constellation.
2. When that sky has loaded, `matchConstellation(base, autoConstellation(receiverSky))` builds one joined
   constellation (§ 6 of [Data and limits](data-and-limits.md#6-star-match)). The view becomes
   `{ source: "match" }` and is revealed like a birthday constellation.
3. Because the joined constellation is an ordinary list of asteroid IDs, its link works like any other.
   `matchInfo()` recognises a match on the receiving side by its stars coming from exactly two birthdays.

---

## 5. The link is the database

Everything that can be shared lives in the URL:

| Parameter | Meaning                                                         |
| --------- | --------------------------------------------------------------- |
| `y` / `d` | The sky: a year (`1987`) or a day and month (`05-12`)            |
| `a`       | The selected asteroid                                            |
| `cn`      | Constellation name                                               |
| `cm`      | Its dial: `d` (date across all years) or `y` (one year)          |
| `cs`      | Asteroid IDs in drawing order, joined with dots (up to 40)       |
| `pm`      | Postcard message (cleaned, 160 characters, 5 lines)              |
| `pf`      | Postcard sender (30 characters)                                  |
| `pt`      | Postcard look                                                    |
| `ps`      | Sealed until this date (`YYYY-MM-DD`)                            |

Text from a link is treated as untrusted: control and text-direction characters are removed, it is only
ever rendered as plain text (React text or canvas `fillText`), unknown looks fall back to the default, and a
seal more than a year away is ignored.

On the device, `localStorage` keeps saved constellations, the sender's name (`neo-atlas:from`), and
whether the first-visit question and the tip have been seen. Every read and write is wrapped so that
private browsing or full storage never breaks the page.

`useHistorySync` keeps the address bar and the Back button in step: opening something (a star card, a
constellation, a postcard) adds a history entry, so the phone's Back gesture closes it instead of leaving
the site.

---

## 6. Drawing the cards

Postcards, the sealed envelope and the asteroid-sign card are drawn on a 1080×1350 canvas on the device
(`drawPostcard`, `drawEnvelope`, `drawSignCard`). Nothing is uploaded.

- **Card layout:** title and sky (top left), a perforated postage stamp with an illustrated rock and the
  biggest asteroid's real size, a round postmark with the date, the star dial with the constellation, one
  line of fun facts, the message, the sender, and the fine print.
- **Looks** are colour sets in `THEMES`; Aurora also draws northern-light curtains. A Star Match uses a
  second line colour for the receiver's half and a dashed bridge with a sparkle.
- **The rock** on the stamp and the sign card is drawn from a seed (the asteroid's ID), so each asteroid
  always gets the same lumpy, cratered shape. It is an illustration, not the asteroid's real shape.
- **Sharing:** phones only open the share sheet straight from a tap, so the PNG is prepared 300 ms after each
  change and is ready when **Send** is tapped. A sealed postcard shares the envelope picture instead.
- Fonts are loaded before the first drawing so the card never shows a fallback font.

---

## 7. The reveal and other motion

- **Reveal** (`StarChart`, prop `reveal`): the faint sky fades in with scattered delays, the constellation's
  stars pop in in drawing order, then each line draws itself using `pathLength="1"` and an animated
  `stroke-dashoffset`. All line timings fit in about 1.6 s, however many lines there are. When it ends,
  the elements are re-mounted without animation, so switching tabs never replays it.
- **Envelope:** CSS only (a flap that folds back, a card that slides up).
- **Burst:** small stars and a shooting star in CSS, plus `navigator.vibrate` where available.
- `prefers-reduced-motion` turns all of this off, including delays and vibration.

---

## 8. Talking to the AegisNEO API

| Feature                        | API call                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| Catalog summary                | `GET /api/v1/stats`                                                      |
| A year's sky                   | `GET /api/v1/asteroids?search=1987-&limit=100&offset=…`                  |
| A date in every year           | `GET /api/v1/asteroids?search=-05-12&limit=100&offset=…`                 |
| Ready-made constellations      | `GET /api/v1/asteroids?sort=diameter&order=desc&limit=7` (and similar)   |
| One asteroid (shared links)    | `GET /api/v1/asteroids/{neo_reference_id}`                               |

`lib/api.js` asks for the first page, then the remaining pages together; retries once on a server error;
gives up after 20 s; and turns errors into plain sentences. The browser never sees the API key:
`api/neo.js` adds it and refuses any path or parameter not on its list.

---

## 9. Phones first

- One main button per screen; secondary actions are small and quiet.
- The postcard maker fits on one phone screen without scrolling: the card takes whatever height is left
  (`container-type: size`, width `min(100cqw, 80cqh)`), and the controls take four short rows.
- Zoom buttons are hidden on touch screens (`pointer: coarse`); pinch and double-tap still zoom.
- Text inputs are 16 px or larger so iOS doesn't zoom in on them; safe-area insets are respected.
- Sideways phones get two columns (card or chart left, controls right).

---

## 10. Accessibility

- Dialogs use `<dialog>` with labels; Escape closes the writing sheet first, then the dialog.
- Every card canvas has a text description (`role="img"` with an `aria-label` that includes the message).
- The chart can be used with the keyboard (arrow keys between stars, Enter to join while drawing) and
  announces stars to screen readers.
- Look dots, ready-made messages and the seal button are real buttons with `aria-pressed`.
- The sealed countdown is a `role="timer"` with a readable label, so screen readers aren't flooded every second.

---

## 11. Security headers

`vercel.json` sets a strict Content Security Policy (scripts, styles, fonts and requests only from the site
itself), `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a permissions policy that turns off the
camera, microphone and location. A rate limit on `/api/neo` is recommended in the Vercel firewall.
