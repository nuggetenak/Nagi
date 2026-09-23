#!/usr/bin/env node
'use strict';
// Cuts one packet: a data + output-contract envelope for ONE agent/model to
// fill in. A packet is not a prompt — `prompt_ref` just points at whichever
// existing agent prompt Nugget wants to run it with (per his standing rule:
// reuse pre-made prompts, don't improvise new ones here).
//
// Usage:
//   node tools/make-packet.js --type gloss-id --n 50 --prompt-ref agents/juicy.md
//   node tools/make-packet.js --type sentences --n 30 --prompt-ref agents/saucy.md
//   node tools/make-packet.js --type review --layer gloss-id --n 40 --prompt-ref agents/crunchy.md
//   node tools/make-packet.js --type gloss-id --ids w-000001,w-000002 --prompt-ref agents/juicy.md
const fs = require('fs');
const path = require('path');
const { loadStore, reserve, fmtId, fmtPacketId, writeFileAtomic, appendLedger, today } = require('./lib/store');
const { basisHash, contentHash } = require('./lib/canon');
const { contractFor } = require('./lib/contract');
const { statusOf } = require('./lib/status');
const { refreshHandoffFiles } = require('./lib/handoff');

function parseArgs(argv) {
  const a = { root: path.resolve(__dirname, '..'), n: 50, status: null, match: null };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--root') a.root = path.resolve(argv[++i]);
    else if (v === '--type') a.type = argv[++i];
    else if (v === '--layer') a.layer = argv[++i];
    else if (v === '--n') a.n = parseInt(argv[++i], 10);
    else if (v === '--ids') a.ids = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (v === '--ids-file') a.ids = fs.readFileSync(argv[++i], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
    else if (v === '--role') a.role = argv[++i];
    else if (v === '--prompt-ref') a.promptRef = argv[++i];
    else if (v === '--reviewer-hint') a.reviewerHint = argv[++i];
    else if (v === '--status') a.status = argv[++i].split(',');
    else if (v === '--match') a.match = argv[++i].split(',');
    else if (v === '--help') a.help = true;
  }
  return a;
}

function help() {
  console.log(`node tools/make-packet.js --type gloss-id|sentences|review [options]

  --type gloss-id|sentences|review   required
  --layer lexicon|gloss-id|sentences required for --type review
  --n N                    how many to select when --ids is not given (default 50)
  --ids id1,id2,...        explicit ids (entry ids for gloss-id/lexicon-review, record ids for gloss-id/sentences-review)
  --ids-file PATH          one id per line
  --prompt-ref PATH        pointer to the EXISTING agent prompt to use (not embedded)
  --role NAME              label shown in HANDOFF.md, e.g. "Juicy (vocab)"
  --reviewer-hint TEXT     one-line note shown to the reviewer
  --status draft,checked   (auto-select only) filter source records by status
  --match exact,gloss,common  (auto-select only, layer=lexicon review) filter by jmdict.match tier
`);
}

function selectGlossIds(store, a) {
  return [...store.layers.lexicon.keys()].filter((id) => !store.layers['gloss-id'].has(id)).sort().slice(0, a.n);
}

function selectSentenceSlots(store, a, reserveIds) {
  const have = new Set();
  for (const { rec } of store.layers.sentences.values()) have.add(`${rec.entry}/${rec.sid}`);
  const need = [];
  for (const [id, { rec }] of [...store.layers.lexicon].sort(([x], [y]) => (x < y ? -1 : 1))) {
    for (const s of rec.senses) {
      if (need.length >= a.n) break;
      if (!have.has(`${id}/${s.sid}`)) need.push({ entry: id, sid: s.sid });
    }
    if (need.length >= a.n) break;
  }
  if (!need.length) return [];
  const nums = reserveIds(need.length);
  return need.map((n, i) => ({ id: fmtId('x', nums[i]), entry: n.entry, sid: n.sid }));
}

function selectReviewIds(store, a) {
  const layer = a.layer;
  let ids = [...store.layers[layer].keys()];
  if (a.ids) ids = a.ids;
  else {
    ids = ids.filter((id) => {
      const rec = store.layers[layer].get(id).rec;
      const st = statusOf(store, layer, rec);
      if (a.status ? !a.status.includes(st) : st !== 'draft') return false;
      if (layer === 'lexicon' && a.match && !a.match.includes(rec.jmdict.match)) return false;
      if (layer !== 'lexicon' && !store.layers.lexicon.has(layer === 'sentences' ? rec.entry : id)) return false; // orphans handled by validate, skip here
      return true;
    }).sort();
  }
  return ids.slice(0, a.ids ? ids.length : a.n);
}

function inputFor(store, type, layer, ids, slots) {
  const lex = store.layers.lexicon;
  const ctx = (entryId) => { const e = lex.get(entryId); return e && { headword: e.rec.headword, reading: e.rec.reading, pos: e.rec.pos, senses: e.rec.senses }; };
  if (type === 'gloss-id') return ids.map((id) => ({ id, ...ctx(id) }));
  if (type === 'sentences') return slots.map((s) => ({ id: s.id, entry: s.entry, sid: s.sid, ...(ctx(s.entry) ? { headword: ctx(s.entry).headword, reading: ctx(s.entry).reading, sense: ctx(s.entry).senses.find((x) => x.sid === s.sid) } : {}) }));
  // review
  return ids.map((id) => {
    const rec = store.layers[layer].get(id).rec;
    if (layer === 'lexicon') return { id, headword: rec.headword, reading: rec.reading, pos: rec.pos, senses: rec.senses, jmdict_match: rec.jmdict.match };
    if (layer === 'gloss-id') return { id, entry: ctx(id), gloss: rec.senses };
    return { id, entry: ctx(rec.entry), sid: rec.sid, ja: rec.ja, tr: rec.tr };
  });
}

function baseFor(store, type, layer, ids, slots) {
  const base = {};
  if (type === 'gloss-id') for (const id of ids) base[id] = basisHash(store.layers.lexicon.get(id).rec);
  else if (type === 'sentences') for (const s of slots) base[s.id] = basisHash(store.layers.lexicon.get(s.entry).rec);
  else for (const id of ids) base[id] = contentHash(store.layers[layer].get(id).rec);
  return base;
}

function toMarkdown(packet, a) {
  const lines = [
    `# Packet ${packet.packet_id} — ${packet.type} (${packet.layer})`, '',
    `Role: ${a.role || '(unset)'}`,
    `Prompt: **${packet.prompt_ref || 'TODO — attach the existing agent prompt for this role'}**`,
    packet.reviewer_hint ? `Note: ${packet.reviewer_hint}` : null,
    '',
    '## Output contract', '',
    ...packet.output_contract.rules.map((r) => `- ${r}`), '',
    'Shape of each line:', '```json', JSON.stringify(packet.output_contract.shape), '```', '',
    `## Input (${packet.input.length} item(s))`, '', '```json', JSON.stringify(packet.input, null, 2), '```', '',
    '---', `_Paste this file's Input and Output contract to the agent above, alongside its existing prompt. Save the reply as pure JSONL, then:_`, '',
    '```', `npm run apply -- --packet packets/${packet.packet_id}.json --output <reply.jsonl> --by <actor>`, '```', '',
  ].filter((x) => x !== null);
  return lines.join('\n');
}

function main() {
  const a = parseArgs(process.argv);
  if (a.help || !a.type) return help();
  if (a.type === 'review' && !a.layer) { console.error('--type review requires --layer'); process.exit(1); }
  const layer = a.type === 'review' ? a.layer : a.type;

  const store = loadStore(a.root);
  let ids = [], slots = [];
  if (a.type === 'sentences') {
    slots = a.ids
      ? a.ids.map((id) => { const item = store.layers.sentences.get(id); return item ? { id, entry: item.rec.entry, sid: item.rec.sid } : null; }).filter(Boolean)
      : selectSentenceSlots(store, a, (n) => reserve(store, 'x', n));
    ids = slots.map((s) => s.id);
  } else if (a.type === 'gloss-id') {
    ids = a.ids || selectGlossIds(store, a);
  } else {
    ids = selectReviewIds(store, a);
  }
  if (!ids.length) { console.log('nothing to select (0 candidates) — store may already be fully covered for this filter'); return; }

  const [pnum] = reserve(store, 'p', 1);
  const packet_id = fmtPacketId(pnum);
  const { allowed_fields, output_contract } = contractFor(a.type, layer);
  const packet = {
    packet_id, type: a.type, layer, created: today(),
    role: a.role, prompt_ref: a.promptRef, reviewer_hint: a.reviewerHint || null,
    ids, ...(slots.length ? { slots } : {}),
    input: inputFor(store, a.type, layer, ids, slots),
    base: baseFor(store, a.type, layer, ids, slots),
    allowed_fields, output_contract,
  };

  writeFileAtomic(path.join(a.root, 'packets', `${packet_id}.json`), JSON.stringify(packet, null, 2) + '\n');
  writeFileAtomic(path.join(a.root, 'packets', `${packet_id}.md`), toMarkdown(packet, a));
  appendLedger(a.root, { event: 'made', packet_id, type: a.type, layer, n: ids.length, at: today() });
  refreshHandoffFiles(a.root, packet);

  console.log(`${packet_id}: ${ids.length} item(s), type ${a.type}, layer ${layer}`);
  console.log(`  packets/${packet_id}.json (machine)  packets/${packet_id}.md (paste-ready)`);
}

main();
