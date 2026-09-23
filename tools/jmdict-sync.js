#!/usr/bin/env node
'use strict';
// Refreshes L1 content (pos/senses/tags) against a newer JMdict release.
// Run `node tools/fetch-jmdict.js --tag NEW_TAG` first (updates manifest.json),
// then this. headword/reading/id are identity and are never changed here —
// only the JMdict-sourced descriptive fields move. A changed hash naturally
// invalidates old checked/verified stamps (status falls back to draft), so
// anything JMdict actually revised gets re-reviewed instead of silently
// carrying a stale sign-off forward.
// Usage: node tools/jmdict-sync.js [--jmdict PATH] [--dry-run]
const fs = require('fs');
const path = require('path');
const { loadStore, saveLayer, writeFileAtomic, today } = require('./lib/store');
const { loadJmdict, buildIndex, entryFromWord } = require('./lib/jmdict');
const { contentHash, basisHash } = require('./lib/canon');
const { refreshHandoffFiles } = require('./lib/handoff');

function parseArgs(argv) {
  const a = { root: path.resolve(__dirname, '..'), dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--root') a.root = path.resolve(argv[++i]);
    else if (v === '--jmdict') a.jmdict = argv[++i];
    else if (v === '--dry-run') a.dryRun = true;
  }
  return a;
}

const sameJson = (x, y) => JSON.stringify(x) === JSON.stringify(y);

function main() {
  const a = parseArgs(process.argv);
  const manifest = JSON.parse(fs.readFileSync(path.join(a.root, 'data/seed/manifest.json'), 'utf8'));
  const jmdictPath = a.jmdict || path.join(a.root, manifest.jmdict.json_file);
  if (!fs.existsSync(jmdictPath)) { console.error(`missing ${jmdictPath}\nrun: node tools/fetch-jmdict.js --tag <new tag>`); process.exit(1); }

  const { words, meta } = loadJmdict(jmdictPath);
  console.log(`loaded JMdict ${meta.version} (${meta.dictDate}), ${words.length} words`);
  const idx = buildIndex(words);
  const store = loadStore(a.root);

  let unchanged = 0, updated = 0, vanished = [];
  for (const [id, item] of store.layers.lexicon) {
    const rec = item.rec;
    if (rec.jmdict.seq == null) continue;
    const word = idx.byId.get(String(rec.jmdict.seq));
    if (!word) { vanished.push({ id, headword: rec.headword, reading: rec.reading, seq: rec.jmdict.seq }); continue; }

    const fresh = entryFromWord(word, {
      headword: rec.headword, reading: rec.reading,
      altForms: rec.alt_forms || [], altReadings: rec.alt_readings || [],
      list: null, jmdictMatch: rec.jmdict.match, maxSenses: Math.max(rec.senses.length, 1),
    });
    const before = { pos: rec.pos, senses: rec.senses, tags: rec.tags || [], senses_total: rec.jmdict.senses_total };
    const after = { pos: fresh.pos, senses: fresh.senses, tags: fresh.tags || [], senses_total: fresh.jmdict.senses_total };
    if (sameJson(before, after)) { unchanged++; continue; }

    rec.pos = fresh.pos;
    rec.senses = fresh.senses;
    if (fresh.tags) rec.tags = fresh.tags; else delete rec.tags;
    rec.jmdict.senses_total = fresh.jmdict.senses_total;
    const hash = contentHash(rec);
    rec.prov = { made: { by: 'tool/jmdict-sync', at: today(), hash, basis: basisHash(rec) } }; // old checked/verified are now invalid; drop rather than leave dead
    updated++;
  }

  console.log(`unchanged ${unchanged}, updated ${updated}, vanished ${vanished.length}`);

  if (a.dryRun) { console.log('--dry-run: no files written'); return; }
  if (updated) saveLayer(store, 'lexicon');

  const lines = [
    '# JMdict sync report', '', `_${today()} — JMdict ${meta.version} (${meta.dictDate})._`, '',
    `- unchanged: ${unchanged}`, `- updated (pos/senses/tags refreshed, re-review needed): ${updated}`, `- vanished from JMdict (needs a human decision): ${vanished.length}`, '',
  ];
  if (vanished.length) {
    lines.push('## Vanished', '', 'These entries reference a JMdict sequence number that no longer exists in the new release. Content is UNTOUCHED — decide by hand whether to retire, re-anchor, or keep as legacy.', '');
    for (const v of vanished) lines.push(`- \`${v.id}\` ${v.headword} (${v.reading}) — was jmdict:${v.seq}`);
  }
  writeFileAtomic(path.join(a.root, 'data/seed/sync-report.md'), lines.join('\n') + '\n');
  refreshHandoffFiles(a.root, null);
  console.log('wrote data/seed/sync-report.md');
}

main();
