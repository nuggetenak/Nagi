# 凪 nagi

A calm, JMdict-anchored way through the JLPT word list. Standalone platform,
starting with N3, built to grow into the full N5→N1 series. No gamification
by design — see `docs/BLUEPRINT.md` for the full reasoning behind every
decision and `docs/CREDITS.md` for data licensing (read this one — there's a
real decision flagged in it, not just boilerplate).

Two parts, cleanly separated:
- **`/` (this root)** — the data core: schema, validator, JMdict-anchored
  lexicon, and the multi-agent packet relay that fills in glosses and example
  sentences over time. Not the app — the source of truth the app reads from.
- **`app/`** — the actual installable PWA. Vanilla JS (no framework, no
  build step), offline-first, works on phone/tablet/desktop and installs on
  all of them. Reads a compiled snapshot of the data core; never touches the
  JSONL directly.

## Current state

- **2082 lexicon entries** (`data/lexicon/`), N3, built from the public N3
  list resolved against JMdict 3.6.2 — 2025 exact matches (mechanically
  `checked`), 57 disambiguated matches waiting on review, 12 words needing
  manual disposition (`data/seed/unresolved.jsonl`).
- **0 glosses beyond JMdict's own English, 0 example sentences yet** — the
  three working drills run today straight off JMdict's English; simplified
  glosses and cloze sentences are the multi-agent work this foundation is
  built for. Next up per the latest conversation: pulling in Tanaka
  Corpus/Tatoeba for sentences and KANJIDIC2 for kanji depth — not done yet.
- **The app is real and tested**: word→meaning, meaning→word, and
  word→reading run end-to-end against the live 2082-word set, with a
  transparent Leitner-style scheduler and installable offline support. Cloze
  is fully wired up and will light itself on the moment L3 sentences exist —
  nothing to rebuild when that day comes. See `app/README.md`.
- **One packet already cut and waiting**: `packets/P-0001.json` — review the
  57 disambiguated matches. `HANDOFF.md` has the details.

## Quickstart — data core

```bash
npm install
npm run validate      # should show 0 errors, 57 warnings (the review-pending words)
npm test               # data-core tests + the full app smoke test, one command
cat HANDOFF.md          # what to run next, always current
```

To run the next packet: open `packets/P-0001.md`, paste `agents/reviewer.md`
first, then the packet's own content, into any model, save the reply as
JSONL, then:

```bash
npm run apply -- --packet packets/P-0001.json --output reply.jsonl --by <model, e.g. gemini/2.5-pro>
```

To cut the next batch — sentences are the actual priority right now, they're
what the cloze drill is waiting on:

```bash
npm run packet -- --type sentences --n 30 --prompt-ref agents/sentence-writer.md
```

See `agents/README.md` for the full loop (there's also a gloss-simplifying
role and how review packets fit in).

## Quickstart — app

```bash
npm run build && cp data/dist/n3-core.json app/data/n3-core.json   # refresh the app's data snapshot
npx serve app        # or any static file server — the app needs no backend
```

Open the printed local URL on your phone (same network) to test the actual
install prompt. See `app/README.md` for the architecture and how to wire in
a new drill mode later.

## Layout

```
schema/              JSON Schema for every record type + the packet envelope
tools/                validate, fmt, seed-import, make-packet, apply-packet,
                       stamp, build, jmdict-sync — see docs/BLUEPRINT.md
tools/lib/            shared logic: hashing, JA text rules, status derivation,
                       validator core, packet contracts, store I/O
data/lexicon/         L1 — headword/reading/pos/senses, JMdict-anchored
data/gloss-id/        L2 — simplified/translated glosses, keyed to L1 (empty — optional, deferred)
data/sentences/        L3 — example/cloze sentences, keyed to L1
data/seed/             import manifest, raw-source pins, unresolved queue
data/dist/              `npm run build` output — gitignored, regenerate anytime
packets/              cut task packets + their paste-ready .md + results
agents/                the three estafet prompts (sentence-writer, gloss-writer,
                        reviewer) + how to run the loop — see agents/README.md
audit/                 append-only ledger + open-issues log (what HANDOFF/PROGRESS read)
docs/                  BLUEPRINT.md (architecture) + CREDITS.md (licensing)
test/                   data-core unit + integration tests, isolated fixtures
app/                    the installable PWA — see app/README.md
HANDOFF.md / PROGRESS.md   generated — never hand-edit, see docs/BLUEPRINT.md
```

## Commands

See `docs/BLUEPRINT.md#commands` for the full data-core list with explanations.
