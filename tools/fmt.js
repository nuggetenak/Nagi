#!/usr/bin/env node
'use strict';
// Canonicalise every JSONL shard (sorted by id, keys ordered, one record per line).
// Usage: node tools/fmt.js [--check] [--root DIR]
const path = require('path');
const { loadStore, saveLayer, LAYERS } = require('./lib/store');
const { canonLine } = require('./lib/canon');

const check = process.argv.includes('--check');
const ri = process.argv.indexOf('--root');
const root = ri > 0 ? path.resolve(process.argv[ri + 1]) : path.resolve(__dirname, '..');
const store = loadStore(root);
if (store.parseErrors.length) {
  for (const p of store.parseErrors) console.error(`${p.file}:${p.line} ${p.message}`);
  process.exit(1);
}
let dirty = 0;
for (const layer of Object.keys(LAYERS)) {
  for (const item of store.layers[layer].values()) if (item.raw !== canonLine(item.rec)) dirty++;
  if (!check) saveLayer(store, layer);
}
console.log(check ? `${dirty} record(s) not canonical` : `formatted (${dirty} record(s) changed)`);
process.exit(check && dirty ? 1 : 0);
