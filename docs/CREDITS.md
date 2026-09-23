# CREDITS & licensing

_Not legal advice — I'm not a lawyer. This documents what each source's own license
says, so the decision below can be made with the facts in hand._

## Sources

### JMdict (via `jmdict-simplified`)
- **What's used**: headword, reading, part-of-speech, and English sense glosses for
  every `data/lexicon/*.jsonl` entry. This is the AUTHORITATIVE content — not the
  public list's own "meaning" column (see below).
- **Publisher**: Electronic Dictionary Research and Development Group (EDRDG),
  James William Breen.
- **Accessed via**: [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified)
  (a JSON conversion of the original XML; itself CC BY-SA 4.0, same as the source).
- **License**: **Creative Commons Attribution-ShareAlike 4.0** ([full text](https://creativecommons.org/licenses/by-sa/4.0/)).
- **What BY-SA actually requires**, in plain terms:
  1. **Attribution** — credit EDRDG/JMdict wherever the data (or an app built on it)
     is presented, not just buried in a repo file. See "Required attribution" below.
  2. **ShareAlike** — a work that **adapts** JMdict (which `data/lexicon/*.jsonl`
     is — it's a curated extraction of JMdict's own fields) must be released under
     the **same CC BY-SA 4.0 license**. This is the one real decision point:

     > **Flag for Nugget**: `data/lexicon/*.jsonl` (and anything built directly from
     > it, like `data/dist/*.json`) is JMdict-derived and — as far as this license's
     > plain text goes — needs to stay CC BY-SA 4.0 if it's redistributed, which in
     > practice usually means the repo (or at least this data) is public. Code
     > (`tools/`, `schema/`) is NOT "adapted material" under BY-SA and can carry
     > whatever license you want (MIT is the usual choice and is what's suggested
     > below). `data/gloss-id/*.jsonl` (the Indonesian glosses your agents will
     > write) is a judgment call — arguably a new creative expression of the same
     > underlying meaning rather than an adaptation of JMdict's specific English
     > wording, but it's close enough to the line that treating it as BY-SA too is
     > the safer read if this ever goes public.
  3. No commercial restriction — BY-SA explicitly allows commercial use, selling,
     bundling. The SSW Konstruksi app precedent (closed content, live-deployed) is
     fine license-wise; it's specifically the ShareAlike copyleft that needs a
     conscious answer, not permission to use JMdict at all.
- **Not committed**: the raw JMdict JSON (~118 MB) lives only in `data/seed/raw/`
  (gitignored). `data/seed/manifest.json` pins the exact version/sha256 so it's
  always reproducible: `node tools/fetch-jmdict.js --tag <tag>`.

### Public N3 word list
- **What's used**: ONLY as a **word-selection seed** — which headword+reading pairs
  count as "N3" and get a `lists: [{src, level}]` tag. The list's own English
  "meaning" column is carried into `lists[].gloss` purely as an audit-trail
  reference (so a human can spot-check the automated JMdict match) and is never
  used as the entry's actual content.
- **Source**: [jamsinclair/open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks),
  which its own README says was repackaged from chyyran/jlpt-anki-decks, itself
  traced to [tanos.co.uk](http://www.tanos.co.uk/jlpt/)'s JLPT lists.
- **License**: **MIT** (the repo's own `LICENSE` file, no separate license carved
  out for the CSV data).
- **Important context**: the JLPT has published no official vocabulary list since
  the [2010 test revision](https://www.jlpt.jp/e/faq/index.html) — every N3 word
  list that exists anywhere, this one included, is a community reconstruction from
  past exams and textbooks, not an official standard. That's exactly why this
  project treats it as a starting seed to verify against JMdict, not ground truth
  to copy.
- **Committed**: `data/seed/n3-public-list.csv` (small, MIT-licensed, kept for
  reproducibility of the seed import).

### Example sentences (`data/sentences/*.jsonl`)
Written by whichever agent/model a `sentences`-type packet is run with —
original text, not sourced from anywhere else. No third-party license applies.
`schema/sentences.schema.json` reserves an `origin: "tatoeba"` value in case a
Tatoeba-sourced sentence bank ever gets folded in later — Tatoeba content is
CC BY 2.0 FR and per-sentence attributable, which is a different (lighter)
obligation than JMdict's; not wired up in v1, listed here so future-you doesn't
have to rediscover the license when it is.

## Required attribution (do this wherever the app is public-facing)

Minimum text, adapted from EDRDG's own suggested wording:

> This application uses the JMdict dictionary file, used in conformance with the
> Electronic Dictionary Research and Development Group's licence.

Link `Electronic Dictionary Research and Development Group` to
<https://www.edrdg.org/>. A one-line mention in an "About" or settings screen is
enough — EDRDG's own examples page shows this is the norm, not a full legal
notice per screen.

## Suggested (not yet applied) repo-level licensing

Given the flag above, a defensible split once this goes public:
- `tools/`, `schema/`, everything under `docs/` except this file's data notes → **MIT**
- `data/lexicon/`, `data/gloss-id/`, `data/dist/` → **CC BY-SA 4.0** (matches JMdict's own requirement)
- `data/sentences/` → your call — original content, no inherited obligation

No `LICENSE` file has been added yet on purpose — this is a decision for Nugget to
make once, not one to bake in silently.
