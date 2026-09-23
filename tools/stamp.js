#!/usr/bin/env node
'use strict';
// For a record hand-edited outside the packet flow (fixing a typo directly
// in the JSONL, say). Re-stamps `made` so status/staleness reflect the new
// content instead of tripping W010 forever. Does NOT add checked/verified —
// a hand edit still needs independent review like anything else.
// Usage: node tools/stamp.js --layer gloss-id --id w-000123 --by human/nugget [--note "fixed typo"]
const path = require('path');
const { loadStore, saveLayer, today } = require('./lib/store');
const { contentHash, basisHash } = require('./lib/canon');

function parseArgs(argv) {
  const a = { root: path.resolve(__dirname, '..') };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--root') a.root = path.resolve(argv[++i]);
    else if (v === '--layer') a.layer = argv[++i];
    else if (v === '--id') a.id = argv[++i];
    else if (v === '--by') a.by = argv[++i];
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv);
  if (!a.layer || !a.id || !a.by) { console.error('usage: node tools/stamp.js --layer L --id ID --by human/nugget'); process.exit(1); }
  const store = loadStore(a.root);
  const item = store.layers[a.layer] && store.layers[a.layer].get(a.id);
  if (!item) { console.error(`${a.layer}/${a.id} not found`); process.exit(1); }
  const hash = contentHash(item.rec);
  const basis = a.layer === 'lexicon' ? null : basisHash(store.layers.lexicon.get(a.layer === 'sentences' ? item.rec.entry : a.id).rec);
  item.rec.prov = { made: { by: a.by, at: today(), hash, ...(basis !== null ? { basis } : {}) } }; // drop stale checked/verified
  saveLayer(store, a.layer);
  console.log(`re-stamped ${a.layer}/${a.id} made by ${a.by} (checked/verified cleared — needs independent review again)`);
}

main();
