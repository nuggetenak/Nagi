'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { canonLine, contentHash, basisHash, family } = require('../tools/lib/canon');

test('canonLine: id first, prov last, rest alphabetical', () => {
  const rec = { senses: [{ sid: 's1', en: ['x'] }], id: 'w-000001', headword: 'a', prov: { made: { by: 't', at: '1' } } };
  const line = canonLine(rec);
  const parsed = JSON.parse(line);
  assert.deepEqual(Object.keys(parsed), ['id', 'headword', 'senses', 'prov']);
});

test('contentHash ignores key order and ignores prov', () => {
  const a = { id: 'w-1', headword: 'x', reading: 'y', prov: { made: { by: 'p', at: 'q' } } };
  const b = { reading: 'y', prov: { made: { by: 'different', at: 'also-different' } }, headword: 'x', id: 'w-1' };
  assert.equal(contentHash(a), contentHash(b));
});

test('contentHash changes when content changes', () => {
  const a = { id: 'w-1', headword: 'x' };
  const b = { id: 'w-1', headword: 'y' };
  assert.notEqual(contentHash(a), contentHash(b));
});

test('basisHash depends only on headword/reading/pos/senses', () => {
  const base = { headword: '経験', reading: 'けいけん', pos: ['n'], senses: [{ sid: 's1', en: ['experience'] }], lists: [{ src: 'a', level: 'N3' }] };
  const changedLists = { ...base, lists: [{ src: 'b', level: 'N2' }] };
  const changedSense = { ...base, senses: [{ sid: 's1', en: ['a different meaning'] }] };
  assert.equal(basisHash(base), basisHash(changedLists), 'lists must not affect basis');
  assert.notEqual(basisHash(base), basisHash(changedSense), 'sense text must affect basis');
});

test('family() extracts provider prefix', () => {
  assert.equal(family('claude/opus-5'), 'claude');
  assert.equal(family('human/nugget'), 'human');
  assert.equal(family(null), null);
});
