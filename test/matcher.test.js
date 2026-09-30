'use strict';
// Seed-list quirks: rows that only match after a cleanup, and rows that must keep matching as written.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIndex, normalizeRow, matchRow } = require('../tools/lib/jmdict');

const word = (id, kanji, kana, gloss) => ({
  id,
  kanji: kanji.map((text) => ({ text, common: true, tags: [] })),
  kana: kana.map((text) => ({ text, common: true, appliesToKanji: ['*'], appliesToKana: ['*'], tags: [] })),
  sense: [{ partOfSpeech: ['n'], appliesToKanji: ['*'], appliesToKana: ['*'], misc: [], gloss: [{ lang: 'eng', text: gloss }] }],
});
const idx = buildIndex([
  word('1', ['運動'], ['うんどう'], 'exercise'),
  word('2', [], ['けんか'], 'quarrel'),
  word('3', ['愛する'], ['あいする'], 'to love'),
  word('4', ['区'], ['く'], 'ward'),
  word('5', ['御'], ['ご'], 'honorific prefix'),
  word('6', [], ['かまう'], 'to mind'),
]);
const run = (expression, reading, meaning = '') => matchRow(normalizeRow({ expression, reading, meaning }), idx);

test('suru in the reading column: matches the noun, and reports the cleaned row', () => {
  const m = run('運動', 'うんどうする', 'exercise');
  assert.equal(m.status, 'exact');
  assert.equal(m.id, '1');
  assert.equal(m.via, 'suru');
  assert.deepEqual(m.row.readings, ['うんどう']);
});

test('kana-only suru row (expression and reading both end in する)', () => {
  const m = run('けんかする', 'けんかする', 'quarrel');
  assert.equal(m.id, '2');
  assert.equal(m.via, 'suru');
});

test('a real verb ending in する keeps matching as written (no cleanup, no via)', () => {
  const m = run('愛する', 'あいする', 'to love');
  assert.equal(m.status, 'exact');
  assert.equal(m.id, '3');
  assert.equal(m.via, undefined);
});

test('affix rows match the base word but are never "exact" (they need another actor)', () => {
  const m = run('～区', '～く', 'ward');
  assert.equal(m.id, '4');
  assert.equal(m.via, 'affix');
  assert.equal(m.status, 'manual');
  const p = run('御～', 'ご～', 'honorific');
  assert.equal(p.id, '5');
  assert.equal(p.status, 'manual');
});

test('blank reading + kana expression: the expression is its own reading', () => {
  const nr = normalizeRow({ expression: 'かまう', reading: '', meaning: 'to mind' });
  assert.deepEqual(nr.readings, ['かまう']);
  assert.equal(matchRow(nr, idx).id, '6');
});

test('patterns that are not a single word stay unresolved', () => {
  assert.equal(run('いくら～ても', 'いくら～ても').status, 'none');
});
