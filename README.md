# Pluto Phases — "What Was Happening?" widget

Two parts, hosted separately:

1. **`index.html`, `pluto-engine.js`, `ephemeris.json`, `pluto.json`,
   `interpretations.json`** — the whole widget (parchment-styled form,
   results, and the astrology engine + data behind it) as one complete,
   self-contained page. These five files need to live on a real URL.
   **GitHub Pages** is the easiest free option. They all sit flat, side by
   side, in one repo — no folders needed, so this works fine from a phone
   or tablet.
2. **`nicepage-iframe-snippet.html`** — a tiny plain HTML snippet (just an
   `<iframe>`, **no `<script>` tag**) that you paste into a Nicepage "Embed
   Code" block. It loads `index.html` from GitHub Pages inside the iframe.
   Because it contains no script tag, it works on Nicepage's free tier —
   only inline `<script>` in the code box requires the premium license, and
   an iframe sidesteps that entirely. Visitors stay on your Nicepage page;
   the iframe is just a framed window showing the GitHub-hosted page.

## Step 1 — Publish the widget to GitHub Pages

1. Create a new **public** GitHub repo, e.g. `pluto-phases-widget`.
2. Go to **Add file → Upload files**.
3. Tap **choose your files** and select all five files at once:
   - `index.html`
   - `pluto-engine.js`
   - `ephemeris.json`
   - `pluto.json`
   - `interpretations.json`
   (No dragging needed — the file picker works fine on a tablet. Just make
   sure all five land in the repo root, not inside any folder.)
4. Commit the upload.
5. Go to **Settings → Pages**, set:
   - Source: `Deploy from a branch`
   - Branch: `main` / root
6. Save. GitHub will give you a URL like:
   `https://YOUR-GITHUB-USERNAME.github.io/pluto-phases-widget/`
   (can take a minute or two to go live the first time).
7. Confirm it works by visiting that URL directly in a browser — you should
   see the full parchment-styled widget, fully working, on its own page.

## Step 1b — Set up EmailJS so purchase interest gets sent to you

When a visitor selects the **Transit Report** and/or **Consultation** offer
and taps Continue, the widget emails you their full birth details, event,
and computed reading — this is what lets you follow up on real leads. It
uses [EmailJS](https://www.emailjs.com) (free tier: 200 emails/month), so no
backend or API key is exposed publicly.

1. Create a free account at emailjs.com.
2. Add an **Email Service** (e.g. connect your Gmail) — note the **Service
   ID**.
3. Create an **Email Template** with a subject like `New Pluto Phases lead:
   {{interest}}` and a body that just prints `{{summary}}` — note the
   **Template ID**.
4. Under **Account → API Keys**, copy your **Public Key**.
5. Open `index.html`, find these three lines near the bottom script block,
   and fill them in:
   ```js
   var EMAILJS_PUBLIC_KEY = "YOUR_EMAILJS_PUBLIC_KEY";
   var EMAILJS_SERVICE_ID = "YOUR_EMAILJS_SERVICE_ID";
   var EMAILJS_TEMPLATE_ID = "YOUR_EMAILJS_TEMPLATE_ID";
   ```
6. Save and re-upload `index.html` to GitHub (overwrite).

**If you skip this step**, the widget still works — visitors can still open
the Report/Consultation/Kindle links — it just won't be able to email you
their details automatically, and it tells the visitor to mention their
details manually instead. The Kindle eBooks link never needs this, since
it's just a storefront link with no personal data involved.

**Note on the two JotForm links**: the Report and Consultation offers were
given the same JotForm URL — the widget uses it as-is for both. If you'd
rather send visitors to two different forms, just update the `url` values
for `report` and `consultation` inside the `OFFERS` object near the top of
the same script block.

## Step 2 — Wire the Nicepage iframe to that URL

1. Open `nicepage-iframe-snippet.html` in a text editor (even a notes app
   that can edit plain text works, or GitHub's own web editor).
2. Find the `src="..."` line and replace the placeholder URL with your
   actual GitHub Pages URL from Step 1 (keep the trailing slash).
3. Save.

## Step 3 — Add it to your Nicepage site

1. In the Nicepage editor, add an **Embed Code / HTML Code** block where you
   want the widget to appear.
2. Paste the entire contents of `nicepage-iframe-snippet.html` into that
   block (it's short — just one `<iframe>` tag, no script).
3. Publish the site.

That's it — no server of your own, no API keys, no premium license needed,
nothing to maintain besides the five files on GitHub.

### If the fixed iframe height doesn't quite fit

The snippet uses a fixed `height:1900px` since resizing an iframe to fit its
content automatically requires a small script on the *parent* (Nicepage)
page too — which runs into the same premium-license wall. A fixed height
with the iframe's own internal scrollbar (the default browser behavior) is
the simplest workaround. If 1900px leaves too much or too little space,
just adjust that one number in the `style="..."` attribute — no other
changes needed.

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
  a paid API isn't practical here.
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
- **Lead email delivery depends on EmailJS being configured** (Step 1b). If
  it isn't set up, the widget degrades gracefully — links still work, the
  visitor just gets a note asking them to mention their details manually on
  the next page.
- **Never tested in a real browser** — engine logic was smoke-tested with
  Node.js, and the HTML/JS were checked for syntax errors and dangling
  element references, but the actual rendering, form flow, and iframe
  behavior haven't been confirmed in a live browser yet.
