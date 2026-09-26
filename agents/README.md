# Estafet agent prompts

Three roles, one packet type each. These are the **stable rules** for a
role — persona, quality bar, output format. A packet's own `input` and
`output_contract` (in `packets/P-xxxx.md`) is the **specific batch of work**
for one run. You need both: the prompt tells an agent how to work, the
packet tells it what to work on.

| File | Role | Packet type | Handles |
|---|---|---|---|
| `sentence-writer.md` | Nami (波) | `sentences` | Writes cloze example sentences — **do this first**, it's the empty layer blocking the cloze drill |
| `gloss-writer.md` | Shizuku (雫) | `gloss-id` | Simplifies JMdict's English into learner-friendly phrasing — lower priority, the app already works off raw JMdict English |
| `reviewer.md` | Kagami (鏡) | `review` | Checks another agent's work, any layer — never reviews its own prior output |

## The loop

```bash
# 1. cut a packet
npm run packet -- --type sentences --n 30 --prompt-ref agents/sentence-writer.md

# 2. open packets/P-xxxx.md — paste its ENTIRE content into a fresh chat with
#    whichever model, right after pasting the matching role file above.
#    (the packet .md already embeds the Input and Output contract — you're
#    pasting two things: the role prompt, then the packet.)

# 3. save that model's reply as pure JSONL, then:
npm run apply -- --packet packets/P-xxxx.json --output reply.jsonl --by <actor, e.g. gemini/2.5-pro>
```

`--by` is whatever you want to call that actor (`claude/opus-5`,
`gemini/2.5-pro`, `human/nugget`) — it's what the cross-check rule compares
against later, so keep it consistent per model/session.

## Then review it

```bash
npm run packet -- --type review --layer sentences --n 30 --prompt-ref agents/reviewer.md
```

Run this with a **different** actor than whoever wrote the batch — same
model is fine, same exact `--by` string is not; `apply` rejects a pass from
the id that made the content. A `pass` moves the record to `checked`
status (or `verified` if `--by human/...`); a `fail` opens an entry in
`audit/issues.jsonl` and leaves the content untouched for a follow-up
`sentences`/`gloss-id` packet scoped to just those ids (`--ids
w-000045,w-000091`) to fix.

## Suggested order right now

1. `sentences` for N3 — the cloze drill is live-empty until this exists
2. `review` on that batch
3. `gloss-id` only once sentences are flowing, if you still want it — recognition/recall already work off JMdict's English
