#!/usr/bin/env node
'use strict';
// Compiles data/lexicon + data/gloss-id + data/sentences into ONE
// presentation-ready bundle (data/dist/n3-core.json). This is the seam
// between "audit-grade source of truth" (the JSONL shards: small diffs,
// one fact per line, hash-verified) and "whatever eventually reads this"
// (an offline PWA today, a server-backed app later — same file either way).
// Ruby/cloze parsing happens once here, not on every client.
//
// Usage: node tools/build.js [--min-status draft|checked|verified] [--out FILE]
const path = require('path');
const { loadStore, writeFileAtomic, today } = require('./lib/store');
const { statusOf, atLeast } = require('./lib/status');
const { parseCloze } = require('./lib/ja');
const { sha256 } = require('./lib/canon');

function parseArgs(argv) {
  const a = { root: path.resolve(__dirname, '..'), minStatus: 'draft', out: null };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--root') a.root = path.resolve(argv[++i]);
    else if (v === '--min-status') a.minStatus = argv[++i];
    else if (v === '--out') a.out = argv[++i];
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv);
  const store = loadStore(a.root);
  const lex = store.layers.lexicon, gloss = store.layers['gloss-id'], sents = store.layers.sentences;

  const sentByEntry = new Map();
  for (const { rec } of sents.values()) { if (!sentByEntry.has(rec.entry)) sentByEntry.set(rec.entry, []); sentByEntry.get(rec.entry).push(rec); }

  const entries = [];
  let skippedStatus = 0, badCloze = 0;
  for (const [id, { rec }] of [...lex].sort()) {
    if (!atLeast(statusOf(store, 'lexicon', rec), a.minStatus)) { skippedStatus++; continue; }
    const g = gloss.get(id);
    const glossBySid = new Map(g ? g.rec.senses.map((s) => [s.sid, s]) : []);

    const senses = rec.senses.map((s) => {
      const gs = glossBySid.get(s.sid);
      const o = { sid: s.sid, en: s.en };
      if (s.pos) o.pos = s.pos;
      if (gs) { o.id = gs.gloss; if (gs.hint) o.id_hint = gs.hint; }
      return o;
    });

    const sentences = (sentByEntry.get(id) || []).map((s) => {
      const p = parseCloze(s.ja);
      if (p.error) { badCloze++; return null; }
      return { id: s.id, sid: s.sid, ja: s.ja, target: p.surface, target_kana: p.kana, plain: p.plain, plain_kana: p.kanaText, tr: s.tr };
    }).filter(Boolean);

    const entry = { id, headword: rec.headword, reading: rec.reading, pos: rec.pos, senses };
    if (rec.alt_forms) entry.alt_forms = rec.alt_forms;
    if (rec.alt_readings) entry.alt_readings = rec.alt_readings;
    if (rec.tags) entry.tags = rec.tags;
    entry.lists = rec.lists.map((l) => ({ src: l.src, level: l.level }));
    if (sentences.length) entry.sentences = sentences;
    entry.status = { lexicon: statusOf(store, 'lexicon', rec), gloss: g ? statusOf(store, 'gloss-id', g.rec) : null };
    entries.push(entry);
  }

  const bundle = {
    generated: today(), min_status: a.minStatus,
    counts: { entries: entries.length, with_gloss: entries.filter((e) => e.senses.some((s) => s.id)).length, with_sentence: entries.filter((e) => e.sentences).length },
    entries,
  };
  const build_hash = sha256(JSON.stringify(bundle)).slice(0, 16);
  bundle.build_hash = build_hash;

  const out = a.out || path.join(a.root, 'data/dist/n3-core.json');
  writeFileAtomic(out, JSON.stringify(bundle, null, 2) + '\n');
  console.log(`wrote ${path.relative(a.root, out)}`);
  console.log(`  entries: ${bundle.counts.entries} (skipped ${skippedStatus} below --min-status ${a.minStatus})`);
  console.log(`  with Indonesian gloss: ${bundle.counts.with_gloss}   with sentence: ${bundle.counts.with_sentence}`);
  if (badCloze) console.log(`  WARNING: ${badCloze} sentence(s) had unparseable cloze syntax and were dropped — run npm run validate to see them (E008)`);
}

main();
