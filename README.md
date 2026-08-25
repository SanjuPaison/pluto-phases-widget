# Pluto Phases — "What Was Happening?" widget

Two parts, hosted separately:

1. **`pluto-engine.js` + `data/`** — the actual astrology engine and its data
   files (natal ephemeris, transiting Pluto positions, the 75 interpretation
   texts). These need to live on a real URL that supports CORS. **GitHub
   Pages** is the easiest free option.
2. **`nicepage-block.html`** — the parchment-styled form + results UI you
   paste directly into a Nicepage "Embed Code" block. It stays on your
   Nicepage page; it only reaches out (in the background) to fetch the files
   above and to OpenStreetMap for place lookups. Visitors never leave your
   site.

## Step 1 — Publish the engine + data to GitHub Pages

1. Create a new **public** GitHub repo, e.g. `pluto-phases-widget`.
2. Upload these files/folders from this delivery, preserving structure:
   - `pluto-engine.js`
   - `data/ephemeris.json`
   - `data/pluto.json`
   - `data/interpretations.json`
3. In the repo, go to **Settings → Pages**, set:
   - Source: `Deploy from a branch`
   - Branch: `main` / root
4. Save. GitHub will give you a URL like:
   `https://YOUR-GITHUB-USERNAME.github.io/pluto-phases-widget/`
   (it can take a minute or two to go live the first time).
5. Confirm it works by visiting
   `https://YOUR-GITHUB-USERNAME.github.io/pluto-phases-widget/data/interpretations.json`
   in a browser — you should see raw JSON, not a 404.

## Step 2 — Wire the Nicepage block to that URL

1. Open `nicepage-block.html` in a text editor.
2. Near the bottom, find this line:
   ```js
   var GITHUB_PAGES_BASE_URL = "https://YOUR-GITHUB-USERNAME.github.io/pluto-phases-widget/";
   ```
3. Replace it with your actual URL from Step 1 (keep the trailing slash).
4. Save.

## Step 3 — Add it to your Nicepage site

1. In the Nicepage editor, add an **Embed Code / HTML Code** block where you
   want the widget to appear.
2. Paste the entire contents of `nicepage-block.html` into that block.
3. Publish the site.

That's it — no server of your own, no API keys, nothing to maintain besides
those four files on GitHub.

## What the widget does

- Visitor enters birth date/time/place, which point (Sun or Moon) should
  govern the reading, an event date, and a short description of what
  happened.
- It geocodes the birth place client-side via OpenStreetMap Nominatim (free,
  no key) to get latitude/longitude.
- It rebuilds the same natal chart + transiting-Pluto aspect scan used in
  the Android app and PDF report (same ephemeris data, same aspect-detection
  logic, same 135° offset and 3° orb defaults, same ±4-day uncertainty note).
- It finds every Pluto(-135°) aspect whose "active window" covers the event
  date, ranks them by keyword overlap with the typed description (no AI —
  a fixed keyword-to-planet dictionary in `pluto-engine.js`) and by
  closeness to the exact date, and shows the top few with their actual
  interpretation text from the report's own 75-entry library.
- It also shows that era's Pluto Phase houses (1st/10th sign) and, where the
  era falls within Book of Luck's coverage, its lucky/unlucky colors,
  numbers, and people.
- Closes with a styled call-to-action linking to lifeprediction.net for the
  full 75-page Transit Report.

## Known limitations (worth knowing before launch)

- **Ephemeris coverage**: 1940–2060 for the natal chart, 1950–2060 for
  transiting Pluto. Birth or event dates outside that range aren't
  supported (the widget will show an error).
- **Time zone**: the widget asks the visitor to pick their birth UTC offset
  from a dropdown rather than inferring it, since reliably resolving
  historical local time zones (including old DST rules) client-side without
  a paid API isn't practical here. This matches the offset assumption
  already used by the underlying birth-chart engine.
- **No AI**: matching the typed description to the most relevant transit is
  done with a plain keyword dictionary (see `KEYWORDS` in
  `pluto-engine.js`), not language understanding. It's free and instant,
  but a description using none of the listed keywords just falls back to
  ranking by exactness of date. Extending `KEYWORDS` with more synonyms is
  the easy way to improve matches over time — no redeploy needed beyond
  editing that one file on GitHub.
- **Geocoding**: OpenStreetMap Nominatim is free but rate-limited and
  sometimes ambiguous for small towns — visitors may need to try a nearby
  larger city.
- **Not independently re-verified against a live ephemeris** (e.g. JPL
  Horizons) in this session — see the original project handoff docs for
  ephemeris provenance.
