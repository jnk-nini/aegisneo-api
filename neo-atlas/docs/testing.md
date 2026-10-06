# Testing NEO Atlas

## Running the checks

From `neo-atlas/`:

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run build
```

`npm run test:watch` re-runs the tests on every change.

**Continuous integration**: GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci`, `npm test`,
`npm run lint` and `npm run build` for NEO Atlas and Impactor on every push to `master` and on every pull
request. Vercel redeploys on each push, so this catches problems before they go live.

Current result: **7 test files, 64 tests, all passing.**

---

## What the unit tests cover

| File                              | Tests | What it checks                                                                                                                                                                               |
| --------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/fun.test.js`             |    12 | Fun facts (size, speed and distance comparisons); the asteroid sign (stable, read off real numbers); Star Match (sender's shape kept, bridge, score, links, birthday twins); sealed postcards (next birthday, never sealed for more than a year, countdown, link round trip, calendar file escaping) |
| `src/lib/constellations.test.js`  |    12 | Building constellations (tap order, loops, repeats, bad records, path cap), share links (round trip, unsafe links rejected), saving, export/import, featured constellations, list filters, loading shared links with missing stars |
| `src/lib/postcard.test.js`        |    11 | The sky a constellation belongs to, automatic constellations (stable, shuffle, names), message cleaning (control and text-direction characters, emoji never cut in half), text wrapping, card subtitles, postcard links |
| `src/lib/chart.test.js`           |    10 | Star placement (distance rings, the Moon ring, out-of-range values), formatting, sky URL state                                                                                               |
| `tests/proxy.test.js`             |     8 | The serverless proxy: forwards allowed paths and parameters with the key, rejects unknown parameters, paths and methods, fails clearly without a key, passes upstream errors uncached, 502 when unreachable |
| `src/lib/api.test.js`             |     7 | API client: URL building, paging, parallel pages, stopping at a maximum, readable errors, one retry after a server error                                                                     |
| `src/lib/calendar.test.js`        |     4 | Days of the year on a 366-day ring, bad dates, January at the top                                                                                                                            |

---

## Manual test checklist

Run on a phone (or the browser's phone view at 375×812), sideways (812×375) and on a laptop (1280×800).
The checks below were last run on 2026-10-06 against the local dev server.

**First visit**

- [x] A fresh visit (site data cleared) shows only the birthday question; nothing else is on screen.
- [x] _Reveal my stars_: the sky fades in, stars pop in, lines draw themselves, the name writes in; the card under the chart rises in.
- [x] No zoom buttons or **?** on the phone during the reveal; the tab bar stays.
- [x] _Shuffle_ reveals a new shape; _Just explore the sky_ opens the full chart, and its tip fades after ~8 s.

**Asteroid sign**

- [x] _You're The …_ opens the sign card with three traits, a reading, a lucky number and a best match.
- [x] The card says "made-up meaning: just for fun".

**Postcard maker**

- [x] Fits one phone screen without scrolling; no sideways scrolling on either tab or with the ⋯ open.
- [x] The step trail shows ✓ Your stars, ② Postcard; Send is ticked once the card is sent, copied or saved.
- [x] _Look_ and _Words_ show one panel at a time and the card doesn't jump between them.
- [x] Each of the six swatches is a 44 px target; swiping the card changes the look too.
- [x] Each tap on the message bar puts the next ready-made message on the card.
- [x] _Write my own_ opens the writing sheet with the cursor at the end; the card updates while typing.
- [x] A new postcard starts blank; the name is remembered.
- [x] ⋯ holds Copy link, Save picture and _Seal until …_ (only for a birthday that isn't today); sealed, Send reads _Send sealed_ and the note says when it opens.
- [x] The shared picture of a sealed postcard is the envelope.

**Receiving**

- [x] A postcard link opens on an envelope that opens by itself; the card slides out.
- [x] A sealed link shows the countdown; _Open it early_ needs two taps.
- [x] _Add your birthday_ → _Join our stars_ joins both constellations in two colours with a bridge, a name from both halves and a match score.
- [x] The reply postcard suggests a message using the sender's name; the reply link shows the match score and _Send one back_.

**Phone layout (375 × 812)**

- [x] The sky screen shows only the sky pill, ⋯, the chart, one line and _Make a postcard_.
- [x] The sky pill opens a sheet with Year / Birthday; the chart changes behind it; _Show this sky_ closes it.
- [x] ⋯ holds Find my birthday stars, Draw my own constellation, the three highlights (ticked when on) and How to read the chart.
- [x] A highlight picked in ⋯ shows as a chip under the chart; its × turns it off.
- [x] Every button, chip and menu row on the sky, reveal and postcard screens is at least 44 px tall.
- [x] The Constellations tab's how-to steps read as normal sentences (not one word per line).

**Everywhere**

- [x] No console errors in a fresh run.
- [x] Phone Back closes the postcard, then the constellation.
- [ ] On a real phone: _Send_ opens the share sheet with the picture; vibration on Android. (Needs a real device.)
