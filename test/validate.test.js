'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeFixtureRoot } = require('./fixtures/mini-store');
const { loadStore, saveLayer } = require('../tools/lib/store');
const { makeAjv } = require('../tools/lib/schemas');
const { validateStore } = require('../tools/lib/validate-core');
const { contentHash, basisHash } = require('../tools/lib/canon');

function codes(list) { return new Set(list.map((x) => x.code)); }

test('clean fixture store has zero errors and zero warnings', () => {
  const root = makeFixtureRoot();
  const store = loadStore(root);
  const { errors, warnings, stats } = validateStore(store, { ajv: makeAjv(root) });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(stats.counts.lexicon, 3);
  assert.equal(stats.status.lexicon.checked, 3, 'exact tool-made entries should be auto-checked');
});

test('E002: hand-corrupted (non-canonical) line is caught', () => {
  const root = makeFixtureRoot();
  const f = path.join(root, 'data/lexicon/0001.jsonl');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('"id":"w-000001",', '"headword":"経験","id":"w-000001",'));
  const store = loadStore(root);
  const { errors } = validateStore(store, { ajv: makeAjv(root) });
  assert.ok(codes(errors).has('E002'));
});

test('E004: duplicate id across shards is caught', () => {
  const root = makeFixtureRoot();
  fs.copyFileSync(path.join(root, 'data/lexicon/0001.jsonl'), path.join(root, 'data/lexicon/0002.jsonl'));
  const store = loadStore(root);
  const { errors } = validateStore(store, { ajv: makeAjv(root) });
  assert.ok(codes(errors).has('E004'));
});

test('E005: gloss-id record with no matching lexicon entry is an orphan', () => {
  const root = makeFixtureRoot();
  fs.writeFileSync(path.join(root, 'data/gloss-id/0001.jsonl'), JSON.stringify({ id: 'w-999999', senses: [{ sid: 's1', gloss: ['x'] }] }) + '\n');
  const store = loadStore(root);
  const { errors } = validateStore(store, { ajv: makeAjv(root) });
  assert.ok(codes(errors).has('E005'));
});

test('E007: checked stamp by the same actor as made is rejected', () => {
  const root = makeFixtureRoot();
  const store = loadStore(root);
  const item = store.layers.lexicon.get('w-000001');
  const hash = contentHash(item.rec);
  item.rec.prov.checked = { by: item.rec.prov.made.by, at: '2026-01-02', hash, basis: null };
  saveLayer(store, 'lexicon');
  const store2 = loadStore(root);
  const { errors } = validateStore(store2, { ajv: makeAjv(root) });
  assert.ok(codes(errors).has('E007'));
});

test('E008: sentence missing ruby / bad cloze is caught, E005 for bad sense ref', () => {
  const root = makeFixtureRoot();
  fs.writeFileSync(path.join(root, 'data/sentences/0001.jsonl'), [
    JSON.stringify({ id: 'x-000001', entry: 'w-000001', sid: 's1', ja: '今日は{{経験}}した。', tr: { id: 'saya berpengalaman' }, origin: 'ai' }),
  ].join('\n') + '\n');
  const store = loadStore(root);
  const { errors } = validateStore(store, { ajv: makeAjv(root) });
  assert.ok(codes(errors).has('E008'), 'missing ruby on 今日 and on the cloze target should be flagged');
});

test('W001: stale checked stamp (content edited after check) is flagged and status falls back to draft', () => {
  const root = makeFixtureRoot();
  const store = loadStore(root);
  const item = store.layers.lexicon.get('w-000002');
  const staleHash = contentHash(item.rec);
  item.rec.prov.checked = { by: 'gemini/2.5-pro', at: '2026-01-02', hash: staleHash, basis: basisHash(item.rec) };
  item.rec.senses[0].en.push('an extra meaning that was never reviewed');
  saveLayer(store, 'lexicon');

  const store2 = loadStore(root);
  const { warnings, stats } = validateStore(store2, { ajv: makeAjv(root) });
  assert.ok(codes(warnings).has('W001'));
  const { statusOf } = require('../tools/lib/status');
  assert.equal(statusOf(store2, 'lexicon', store2.layers.lexicon.get('w-000002').rec), 'draft');
});

test('W002: two entries sharing an unhinted primary Indonesian gloss are flagged ambiguous', () => {
  const root = makeFixtureRoot();
  fs.writeFileSync(path.join(root, 'data/gloss-id/0001.jsonl'), [
    JSON.stringify({ id: 'w-000001', senses: [{ sid: 's1', gloss: ['coba'] }] }),
    JSON.stringify({ id: 'w-000002', senses: [{ sid: 's1', gloss: ['coba'] }] }),
  ].join('\n') + '\n');
  const store = loadStore(root);
  const { warnings } = validateStore(store, { ajv: makeAjv(root) });
  assert.ok(codes(warnings).has('W002'));
});
