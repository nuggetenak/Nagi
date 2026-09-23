# BLUEPRINT — nugget-vocab-core

## What this is

The data foundation for the N3 vocab drill — nothing else yet, on purpose. No
gamification, no UI, no server. Three things only:

1. **A source-of-truth dataset** (`data/*.jsonl`) that's correct, deduplicated,
   and anchored to a real dictionary rather than free-floating AI output.
2. **A mechanical validator** (`tools/validate.js`) that catches structural and
   provenance problems without a human reading every line.
3. **A packet/apply relay** (`tools/make-packet.js` + `tools/apply-packet.js`)
   that lets any agent, on any model, do one bounded unit of work and hand it
   back in a form the validator can judge — this is the "estafet" mechanism.

Everything below explains a decision, not just states it — you asked for this
critically evaluated, so limitations and tradeoffs are called out inline, not
swept into a separate "known issues" section at the end.

## Why JMdict as the anchor, not the public N3 list

JLPT hasn't published an official vocabulary list since the [2010 test
revision](https://www.jlpt.jp/e/faq/index.html). Every N3 word list that exists,
including the one used here, is a community reconstruction — so there's no
"ground truth" list to trust blindly. What *is* trustworthy is JMdict: a
maintained, versioned, precedent-setting dictionary. So the public list is used
only to answer "which words count as N3" (word selection) — the actual content
(reading validity, part-of-speech, English sense definitions) is pulled from
whichever JMdict entry that headword+reading resolves to. See
`docs/CREDITS.md` for the licensing reasoning behind this split — it's not
just a quality choice, JMdict's CC BY-SA terms are also cleaner to reason
about than the list's murkier provenance chain.

**Result of the seed import** (`tools/seed-import.js`, full report in
`data/seed/import-report.md`):

| tier | count | meaning |
|---|---:|---|
| exact | 2071 | headword+reading matched exactly one JMdict entry — mechanically trustworthy |
| gloss | 43 | multiple JMdict entries shared the spelling/reading; the list's English gloss uniquely pointed at one |
| common | 14 | still ambiguous after gloss-matching; resolved because only one candidate is tagged "common" in JMdict |
| ambiguous | 8 | genuinely couldn't be resolved automatically | 
| none | 4 | no JMdict entry matched at all (mostly bound affixes like `～敗`, `来～`) |

2082 lexicon entries were created (some CSV rows collapsed into the same
JMdict entry). The 12 ambiguous/none rows are sitting in
`data/seed/unresolved.jsonl` for manual disposition — not dropped, not
guessed. **Packet P-0001** (already cut, sitting in `packets/`) asks a
reviewer to sanity-check the 57 gloss/common-tier entries before anything
gets built on top of them — that felt like the right first move over jumping
straight into content generation on a foundation that hasn't had its
shakiest 2.7% double-checked.

## The three layers, and why they're separate files

```
data/lexicon/*.jsonl     L1 — headword, reading, pos, English senses (JMdict-anchored)
data/gloss-id/*.jsonl    L2 — Indonesian glosses, keyed by L1 id
data/sentences/*.jsonl   L3 — example/cloze sentences, keyed by L1 id + sense id
```

Each layer is its own set of files, sharded ~200 records per file
(`data/lexicon/0001.jsonl`, `0002.jsonl`, ...). Three reasons this beats one
big file or one-file-per-word:

- **Independent lifecycles.** A JMdict re-sync only ever touches L1. Someone
  fixing Indonesian phrasing only touches L2. A packet for one layer can never
  merge-conflict with a packet for another.
- **Diff size.** One record per line, sorted by id, keys in a fixed order
  (`tools/lib/canon.js`) — changing one word's gloss is a one-line diff, not a
  reformatted blob. `npm run fmt -- --check` fails CI if anything drifts from
  canonical form.
- **Sharding caps blast radius.** ~200 records/file keeps merge conflicts (if
  you ever do run two agents in parallel against the same shard) small and
  git diffs reviewable, without the overhead of one-file-per-word.

L2/L3 reference L1 by id (`w-000123`) rather than embedding L1's content —
this is what makes staleness detection possible (next section).

## IDs are reserved by tools, never invented by agents

`w-000001`, `x-000001`, `P-0001` — sequential, zero-padded, allocated by
`tools/lib/store.js:reserve()`, which reads `data/counters.json`, hands out
the next N numbers, and persists the new floor immediately. An agent never
writes an id into existence. This matters more with multiple models in the
loop than with one: two different models independently "inventing" the next
plausible id is exactly how you get silent collisions. A tombstoned id (if a
record is ever retired) goes into `data/redirects.jsonl` and the validator
(`E006`) refuses to let it be reused.

## Canonical hashing is the trust mechanism, not a formatting nicety

Every record's `prov` (provenance) block is built from two hashes
(`tools/lib/canon.js`):

- `contentHash` — hash of the record's own content, excluding `prov` itself.
- `basisHash` (L2/L3 only) — hash of the specific L1 fields a record
  *depends on* (headword, reading, pos, senses).

A `checked` or `verified` stamp records the hash it was valid for. **Status is
derived at read time, never stored** (`tools/lib/status.js`): if the current
content hash doesn't match the stamp's hash, or the current L1 basis hash
doesn't match what the stamp recorded, the record silently falls back to
`draft` — no cleanup step required, no tooling discipline required to keep it
honest. Edit a gloss by hand, and its `checked` stamp stops applying,
automatically. Fix a typo in L1's English sense, and every L2/L3 record
hanging off that sense falls back to `draft` too, automatically. This is
directly why L2/L3 can safely reference L1 instead of duplicating its text —
the dependency is enforced by hashing, not by hoping someone remembers to
propagate the change.

## Status ladder: draft → checked → verified

- **draft** — has content, no independent pass has confirmed it yet.
- **checked** — a *different* actor reviewed it and it passed, for the
  *current* content and the *current* L1 basis.
- **verified** — a human reviewed it and it passed.

"Different actor" is checked by comparing the exact `by` string
(`claude/opus-5` vs `claude/sonnet-5` counts as different; the same string
twice doesn't) — **not** by provider family. Your stated pattern already has
Claude reviewing Claude's own output on a different role (Crunchy reviewing
other agents in Nugget Nihongo), and you explicitly said "multi-agent and
*even* multi-model" — multi-model as the occasional deeper check, not the
baseline requirement. Requiring a different *provider* every time would have
made same-provider relay (your actual daily pattern) impossible to ever reach
`checked` status. One exact-JMdict-match L1 entries get `checked`
automatically at import time (`tool/seed-import` is treated as a mechanical,
not-really-needing-a-second-opinion actor) — but only for `exact`-tier joins;
`gloss`/`common`-tier joins stay `draft` until an actual review packet passes
them, which is exactly what P-0001 is for.

## The packet/apply relay (the actual "estafet" mechanism)

A **packet** (`tools/make-packet.js`) is a data + output-contract envelope —
explicitly **not** a prompt. It has three parts:
- `input` — the L1 context an agent needs (headword/reading/senses, or for a
  review packet, the specific content being judged).
- `output_contract` — mechanical rules (JSONL only, these fields only, this
  many senses, etc.) that `apply-packet.js` enforces.
- `prompt_ref` — a pointer to whichever of your existing agent prompts should
  be used. This tool never writes prompt bodies — per your standing rule, you
  attach your own pre-made prompt to whatever role/packet type fits.

**The loop**: cut a packet → hand `packets/P-xxxx.md` (the paste-ready
rendering) to any model alongside its prompt → save the reply as pure JSONL
→ `npm run apply -- --packet ... --output ... --by <actor>`.

`apply-packet.js` judges every line **independently**:
- Malformed JSON, disallowed fields, an id outside the packet, a duplicate id
  → rejected with a specific reason, that id alone.
- The packet's `base` hash for an id no longer matches the live store (L1
  changed underneath it, or — for review packets — the reviewed content
  changed) → rejected as **stale**, that id alone.
- A `pass` review from the same actor that made the record → rejected as
  **same-actor**, that id alone.
- Everything else accepted gets stamped and merged; a `fail` review opens an
  entry in `audit/issues.jsonl` instead of touching content.

One bad line never blocks the other 49. Nothing is silently dropped — every
rejection and every missing id ends up in the console output, in
`packets/P-xxxx.md`'s appended Result section, and factored into
`HANDOFF.md`'s open-issues list.

## Why HANDOFF.md / PROGRESS.md are generated, not written

This is a direct fix for a pattern in your other Nugget Nihongo project
(`learnings.md`): Crispy's recurring failure was forgetting to update
metadata/audit trails under load — not malice, just what happens when a
tracking file's accuracy depends on an agent remembering an extra step at
the busiest point in a session. Here, `HANDOFF.md` and `PROGRESS.md`
(`tools/lib/handoff.js`) are **rebuilt from the audit ledger
(`audit/packets.jsonl`) every time a packet is made or applied.** No agent
ever hand-edits them, so there's nothing to forget. This is what "lean:
HANDOFF/PROGRESS + validator" means concretely here — the lean part is *no
permission gates, no ZIP deliverables, no tier classification*; the rigor is
still real, it's just mechanical instead of procedural.

## Validator codes (`npm run validate`)

Errors (`E*`) block; warnings (`W*`) are observations, never blocking.

| code | meaning |
|---|---|
| E001 | schema violation or invalid JSON |
| E002 | not canonically formatted (`npm run fmt`) |
| E003 | malformed id, or record filed in the wrong shard |
| E004 | duplicate id |
| E005 | dangling reference (L2/L3 → missing L1 entry/sense) |
| E006 | a tombstoned id was reused |
| E007 | provenance invariant broken (self-review, non-human `verified`, etc.) |
| E008 | sentence ruby/cloze syntax broken |
| E009 | kana-only headword doesn't match its own reading |
| E010 | duplicate sense id within one record |
| W001 | a `checked`/`verified` stamp is stale → record reads as `draft` |
| W002 | two entries share an un-hinted primary Indonesian gloss (ambiguous for meaning→word drills) |
| W004 | an L1 sense has no L2 gloss yet |
| W006 | L1's JMdict join isn't `exact` and hasn't been reviewed |
| W008 | a sentence's cloze target doesn't look related to its entry |
| W010 | content changed outside the packet flow (`npm run stamp` after a hand edit) |

## Commands

```
npm run validate           # the hard gate — run before every commit
npm run fmt                # canonicalize all JSONL (fmt -- --check for CI)
npm run seed                # (re-)run seed import; safe to re-run, merges not duplicates
npm run sync                # refresh L1 against a newer JMdict release
npm run packet -- --type gloss-id --n 50 --prompt-ref <path>
npm run apply -- --packet packets/P-xxxx.json --output reply.jsonl --by <actor>
npm run stamp -- --layer L --id ID --by human/nugget   # after a hand edit
npm run build               # compiles data/dist/n3-core.json for the app/server to consume
npm test                    # unit + integration tests (isolated fixtures, never touches data/)
```

## The build step, and the road to "online with a server"

`tools/build.js` compiles the three JSONL layers into one denormalized
`data/dist/n3-core.json` — ruby/cloze parsing happens once here (surface
form, kana form, plain sentence, all pre-computed) so a future client doesn't
reimplement `tools/lib/ja.js`. This file (or the same compile step pointed at
a database instead of a JSON file) is the seam: today it can be fetched
directly by a static PWA; later, a server can run the identical
`data/lexicon` + `data/gloss-id` + `data/sentences` through the same layered
model, with the server owning the source-of-truth JSONL (or migrating it into
a real DB using the same L1/L2/L3 shape) and serving compiled/queried views
to clients. Nothing about the schema or packet mechanism assumes local files
specifically — `tools/lib/store.js` is the only place that would need a
database-backed rewrite; validator, hashing, and packet contracts stay as-is.

## Honest limitations / what's NOT solved yet

- **`build.js`'s quality gate is coarse.** `--min-status` only filters on the
  *lexicon* entry's status, not per-field. A word with a `checked` L1 entry
  but a still-`draft`, unreviewed gloss is included in the build exactly as
  written. Fine for an internal/dev build; a "only ship reviewed content"
  flag that filters at the sense/gloss level is a natural v2 addition, not
  built now to keep scope to the foundation itself.
- **`jmdict-sync.js` doesn't touch `data/seed/unresolved.jsonl`.** If a future
  JMdict release adds an entry for one of the 12 currently-unresolved words,
  nothing re-checks that automatically — it's a manual re-run of the affected
  rows. Only 12 words, judged not worth automating yet.
- **`alt_forms`/`alt_readings` are frozen at import time.** `jmdict-sync`
  refreshes pos/senses/tags but deliberately leaves alternate spellings/
  readings alone, to avoid identity churn on routine syncs. If JMdict adds a
  genuinely new alternate spelling later, that's currently a manual add.
- **No auto re-scoring of `W002` (ambiguous primary gloss) as glosses get
  written.** It's a live warning recomputed on every `validate` run, so it's
  always current — there's just no packet type yet that specifically targets
  "add a disambiguating hint" as its own batch; today that's folded into
  ordinary gloss review.
- **Cross-check strength is a policy choice, not a cryptographic guarantee.**
  Nothing stops running the *same* model twice under two different `--by`
  strings to fake independence. The mechanism enforces the paperwork
  (different actor id, matching hash/basis); it can't enforce that you
  actually used a different model. That's on the human orchestrator — same
  trust boundary as `DISPATCH-CLEARANCE` in your other project relies on you
  actually reading things.
- **Sentence quality/naturalness is entirely unvalidated.** `E008` only
  checks *syntax* (ruby coverage, one cloze marker) — nothing checks that a
  sentence is natural Japanese or that the cloze blank isn't trivially
  guessable. That is exactly what review packets on the `sentences` layer are
  for; it's a review-workflow problem, not a schema problem.

## Next steps, in order

1. Run **P-0001** (already cut) — review the 57 gloss/common-tier joins.
2. Fix or retire the 12 rows in `data/seed/unresolved.jsonl` by hand (add
   them as manual lexicon entries, or decide they're not worth including).
3. Start cutting `gloss-id` packets (`npm run packet -- --type gloss-id --n
   50 --prompt-ref <your vocab agent prompt>`) — 2082 entries ÷ 50 ≈ 42
   packets to cover all of L2.
4. Interleave `sentences` packets once a batch of glosses has a `checked`
   gloss to write example sentences against.
5. Once there's real L2/L3 content, revisit `build.js`'s quality gate before
   pointing an actual app at `data/dist/n3-core.json`.
