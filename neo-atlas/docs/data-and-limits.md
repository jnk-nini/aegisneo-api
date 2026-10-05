# Data and limits

What in NEO Atlas is real, what is simulated, what is just for fun, and what it can't do.

---

## 1. The data

Every asteroid comes from the **AegisNEO API**: 33,511 near-Earth objects from NASA's NeoWs feed (via the
Kaggle "Nearest Earth Objects 1910–2024" dataset), one record each. For each one the atlas uses:

| Field                       | Real? | Used for                                         |
| --------------------------- | :---: | ------------------------------------------------ |
| Estimated diameter          | yes   | Star size, the stamp's value, size comparisons, the sign |
| Miss distance               | yes   | Distance from the centre, Moon comparisons, the sign |
| Relative speed              | yes   | Speed comparisons, the sign                      |
| Potentially hazardous flag  | yes   | Red diamonds, fierier names, the sign            |
| Close-approach date         | **simulated** | Where a star sits around the dial; which birthday it belongs to |

---

## 2. The simulated dates

The Kaggle dataset has no date column, so the API gives every asteroid a fixed date between 1910 and 2024,
derived from its ID. This means:

- a star's **distance, size and hazard marking are real**; its **position around the dial is illustrative**;
- "the asteroids that passed on your birthday" are the ones whose simulated date falls on that day;
- the same asteroid is always on the same date, so a birthday always gets the same sky.

The site says so on the first screen, under the chart, in _How to read_, in each star's card, in the footer,
and in the fine print of every postcard.

---

## 3. How the chart is drawn

The atlas is a planisphere with Earth at the centre:

- **Around the dial:** the day of the year (year view, January at the top) or the year (birthday view, 1910
  at the top), clockwise.
- **Distance from the centre:** the miss distance on a log scale, from 0.02 to 200 lunar distances, with a
  ring at the Moon's distance.
- **Star size:** the diameter on a log scale.

The automatic constellation takes the 32 biggest asteroids of the sky, starts from the biggest, picks its
nearest big neighbours while keeping them a little apart so the shape stays readable, and joins them with
the shortest set of lines that connects them all (a minimum spanning tree), drawn as one stroke. Names are
picked from word lists using a seed made from the stars, so the same stars always get the same name.

---

## 4. Fun facts

The numbers are real; only the comparison is everyday language. The comparison uses the largest familiar
thing that is not bigger than the asteroid:

| Reference          | Size    |
| ------------------ | ------: |
| A person           | 1.7 m   |
| A car              | 4.5 m   |
| A bus              | 12 m    |
| A blue whale       | 25 m    |
| A football pitch   | 105 m   |
| The Eiffel Tower   | 330 m   |
| The Burj Khalifa   | 828 m   |
| Mount Everest      | 8,849 m |

Speeds are given as the time to cover London–New York (5,570 km). Distances are given in Moon distances
(384,400 km).

---

## 5. The asteroid sign

**Real asteroid, made-up meaning.** The sign comes from the biggest asteroid of the birthday's sky, and the
first rule that matches decides it:

| Rule (checked in this order)                      | Sign             |
| ------------------------------------------------- | ---------------- |
| Potentially hazardous and closer than 20 Moon distances | The Daredevil |
| 1 km or wider                                     | The Giant        |
| 90,000 km/h or faster                             | The Sprinter     |
| Closer than 5 Moon distances                      | The Close Friend |
| Potentially hazardous                             | The Rebel        |
| Farther than 100 Moon distances                   | The Hermit       |
| Slower than 25,000 km/h                           | The Daydreamer   |
| Smaller than 40 m                                 | The Pebble       |
| Anything else                                     | The Wanderer     |

The three traits each come from one number (size, speed, distance or hazard). The reading and the lucky
number are picked with a seed made from the asteroid's ID, so they never change for the same birthday.

---

## 6. Star Match

- **Joining:** the sender's constellation is kept exactly as drawn. The receiver's birthday constellation
  (made the same way as in § 3, minus any stars both share) is joined starting from its star nearest to the
  last star of the sender's shape, so the bridge between them is short.
- **Name:** the last word of each half: _The Crown & the Heron_. If both halves share a word: _The Twin Crowns_.
- **The score is for fun.** It is 70–99%: higher when the closest pair of stars (one from each birthday)
  passed Earth in nearby years, plus a small fixed amount from both dates. It is the same every time for the
  same stars. The sentence under it (_"Your closest stars passed Earth 1 year apart"_) is a real comparison of
  the simulated years.
- **Birthday twins** (the same day and month) get the sender's own stars and a "Twin" name.

---

## 7. Sealed postcards

Sealing is a **surprise, not a secret.** The seal date travels in the link, and the page simply waits for
that date (in the receiver's own time zone) before showing the card. Anyone who reads the link itself can
see the message, and the receiver can choose **Open it early**. A seal date more than a year away is
ignored, so a link can never be locked forever.

---

## 8. Known limitations

**Data**

- Close-approach dates are simulated (§ 2), so "your birthday's asteroids" are a fun way into real data,
  not a record of what flew past on that day.
- Diameters are NASA's estimates from brightness, so real sizes may differ.
- The catalog stops at 2024.

**Postcards and links**

- Without a database, a postcard can't be edited or taken back once its link is sent, and the site can't
  tell you when it's been opened.
- Messages are limited to 160 characters and names to 30, so the whole postcard fits in a link.
- Messaging apps show the site's general preview picture for a link, not the postcard itself.
- Some apps drop the text when a picture is shared, so the link may need to be pasted separately (use
  **Copy link to send**).
- Vibration only works on browsers that support it (mostly Android Chrome); iPhones don't vibrate for websites.

**Saving**

- Saved constellations and the remembered name live in one browser on one device. Clearing site data or
  private browsing loses them; **Export** keeps a copy.
