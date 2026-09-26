# nagi — the app

Vanilla JS, no framework, no build step. Every file here is exactly what
ships — open any `src/*.js` in a browser's dev tools and you're reading the
real running code, not a compiled artifact. That was a deliberate call: it's
what "atomized, compact, easy to audit/adjust/upgrade/fix" actually means in
practice, and a PWA doesn't need React to be installable, offline, or
cross-platform — it needs a manifest, a service worker, and HTML/CSS/JS.

## Why these specific choices

- **PWA, not native-per-platform**: one codebase installs on Windows, macOS,
  Android, and iOS (via each platform's "Install app" / "Add to Home
  Screen"), matches "easily adaptable with all kinds of devices," and needs
  no backend to start — exactly what was asked for.
- **No typed-answer checking.** Recognition (word→meaning) is multiple
  choice; meaning→word and word→reading are reveal-then-self-grade. Typed
  input needs a working IME for Japanese on every device this has to run on,
  and grading free text against multiple valid phrasings is a real, ongoing
  correctness problem. Reveal+self-grade is the honest, device-agnostic
  choice, and it's a standard, well-proven pattern for production-direction
  recall drills.
- **A plain Leitner box ladder, not FSRS.** `src/srs.js` is nine lines of
  actual logic: seven boxes, correct advances a box, wrong resets to zero.
  No dependency, fully readable in one sitting. If real FSRS is wanted later
  (the SSW Konstruksi sibling project already uses `ts-fsrs`), `srs.js` is
  the only file that changes — nothing else knows how scheduling works
  internally, they just call `grade()` and `buildQueue()`.
- **No backend yet, on purpose.** Progress lives in `localStorage`
  (`src/state.js` is the only file that touches it). Sync/accounts are a
  clean layer to add later without touching drill logic — see "Adding a
  backend" below.
- **Every screen asks `registry.js` what drills exist** rather than
  hardcoding a list — adding a fourth drill (an antonym/confusable-pairs mode
  once that JMdict field gets surfaced, say) means writing one new file under
  `src/drills/` and adding one line to `registry.js`. Home, the level picker,
  the mode picker, and the session screen all stay untouched.
- **Unpopulated levels and modes are shown, not hidden.** N4/N5/N2/N1 read
  "in progress" instead of vanishing from the level grid; cloze reads "needs
  example sentences" instead of disappearing. `eligible()` on each drill
  module is the single source of truth both the picker screens and the
  session screen use — there's no separate "is this ready" flag to keep in
  sync by hand.

## Module map

```
index.html            single entry point; topbar + #screen mount point
manifest.webmanifest   installability (name, icons, standalone display)
sw.js                  offline cache: app shell + data/n3-core.json
css/style.css          design tokens + components (calm dusk-water palette)
data/n3-core.json      compiled snapshot — copy here after `npm run build`
src/
  main.js              boots: registers routes, starts the router, registers sw.js
  router.js             minimal hash router — the URL IS the nav state
  ui.js                  the entire "framework": el(), mount(), ruby-markup renderer
  data.js                 the ONLY module that knows the bundle's JSON shape
  state.js                 the ONLY module that touches localStorage
  srs.js                    scheduling — pure functions, swap this file for FSRS later
  drills/
    registry.js             the list every screen reads to know what modes exist
    recognition.js           word → meaning, multiple choice
    recall.js                 ONE engine, two directions (meaning→word, word→reading)
    cloze.js                   fill-the-blank, multiple choice; 0-eligible until L3 exists
  screens/
    home.js, level-picker.js, mode-picker.js, session.js, summary.js
test/
  smoke.mjs               end-to-end test — see "Testing" below
```

## Testing

`node app/test/smoke.mjs` (or just `npm test` from the repo root, which runs
this alongside the data-core tests). It imports the **real** `src/` files
through Node's own ES module loader — not a bundled/mocked copy — against a
`document`/`location` supplied by jsdom, and drives the UI by dispatching
real click events and reading the real DOM, the same way a person would.

One thing worth knowing if this ever gets extended: jsdom does not execute
`<script type="module">` tags (it's an acknowledged gap in jsdom itself, not
a config issue), so `index.html`'s own script tag never runs under test —
the test file does the equivalent wiring by hand (sets `globalThis.document`
etc., then `import()`s `main.js` directly). A real browser needs none of
this; it's purely a test-harness detail.

## Adding a backend later

The seam is `state.js` and `data.js`:
- `state.js`'s `getProgress`/`setProgress`/`getAllProgress` are the only
  functions that touch storage. Point them at a network call instead of
  `localStorage` (or write-through to both) and every drill screen keeps
  working unmodified.
- `data.js`'s `loadBundle()` fetches one static JSON file. Point it at an API
  endpoint instead and, again, nothing else changes — every screen calls
  `getLevelCatalog()`/`getEntriesForLevel()`, never the bundle shape directly.

## Honest limitations

- **Distractors for multiple choice are randomly sampled**, not curated for
  plausibility (a beginner-obvious wrong answer is as likely as a genuinely
  confusable one). The validator's `W002` warning (entries sharing an
  un-hinted primary gloss) is a proxy for "these would make good/bad
  distractors" that isn't wired into the app yet — a natural improvement
  once glosses exist to have that problem.
- **The Leitner ladder's intervals are a reasonable starting guess**
  (10 min → 21 days across 7 boxes), not tuned against real retention data.
- **No cross-device sync** — progress is per-browser-per-device until a
  backend exists (see above).
- **Icons are programmatically generated** (`icons/source.svg` + `sharp`),
  not hand-crafted — fine for now, worth a real design pass before a public
  launch.
