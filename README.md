# nugget-vocab-core

Data foundation for the N3 vocab drill. Not the app — the source of truth the
app (and every agent working on it) reads from and writes to. Layered,
schema-validated, hash-verified, JMdict-anchored. No gamification here by
design; see `docs/BLUEPRINT.md` for the full reasoning behind every decision
and `docs/CREDITS.md` for data licensing (read this one — there's a real
decision flagged in it, not just boilerplate).

## Current state

- **2082 lexicon entries** (`data/lexicon/`), built from the public N3 list
  resolved against JMdict 3.6.2 — 2025 exact matches (mechanically `checked`),
  57 disambiguated matches waiting on review, 12 words needing manual
  disposition (`data/seed/unresolved.jsonl`).
- **0 Indonesian glosses, 0 example sentences yet** — that's the multi-agent
  work this foundation is built for.
- **One packet already cut and waiting**: `packets/P-0001.json` — review the
  57 disambiguated matches. `HANDOFF.md` has the details.

## Quickstart

```bash
npm install
npm run validate      # should show 0 errors, 57 warnings (the review-pending words)
cat HANDOFF.md         # what to run next, always current
```

To run the next packet: open `packets/P-0001.md`, attach it to whichever
review/QA prompt you want to use, run it on any model, save the reply as
JSONL, then:

```bash
npm run apply -- --packet packets/P-0001.json --output reply.jsonl --by <model, e.g. gemini/2.5-pro>
```

To cut the next batch of work once P-0001 is applied:

```bash
npm run packet -- --type gloss-id --n 50 --prompt-ref <path to your vocab-agent prompt>
```

## Layout

```
schema/            JSON Schema for every record type + the packet envelope
tools/              validate, fmt, seed-import, make-packet, apply-packet,
                     stamp, build, jmdict-sync — see docs/BLUEPRINT.md
tools/lib/          shared logic: hashing, JA text rules, status derivation,
                     validator core, packet contracts, store I/O
data/lexicon/       L1 — headword/reading/pos/senses, JMdict-anchored
data/gloss-id/      L2 — Indonesian glosses, keyed to L1
data/sentences/      L3 — example/cloze sentences, keyed to L1
data/seed/           import manifest, raw-source pins, unresolved queue
data/dist/            `npm run build` output — gitignored, regenerate anytime
packets/            cut task packets + their paste-ready .md + results
audit/               append-only ledger + open-issues log (what HANDOFF/PROGRESS read)
docs/                BLUEPRINT.md (architecture) + CREDITS.md (licensing)
test/                 unit + integration tests, run against isolated fixtures
HANDOFF.md / PROGRESS.md   generated — never hand-edit, see docs/BLUEPRINT.md
```

## Commands

See `docs/BLUEPRINT.md#commands` for the full list with explanations.
