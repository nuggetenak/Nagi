'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rubyProblems, parseCloze, kata2hira, isKanaOnly, hasKanji } = require('../tools/lib/ja');

test('rubyProblems: accepts fully-annotated sentence', () => {
  assert.deepEqual(rubyProblems('今日《きょう》は{{経験《けいけん》}}した。'), []);
});

test('rubyProblems: flags a kanji run missing ruby', () => {
  const problems = rubyProblems('今日は{{経験《けいけん》}}した。'); // 今日 has no ruby
  assert.ok(problems.some((p) => p.includes('今日')), problems.join('; '));
});

test('rubyProblems: flags non-hiragana inside ruby', () => {
  const problems = rubyProblems('経験《ケイケン》した。');
  assert.ok(problems.some((p) => p.includes('hiragana')));
});

test('rubyProblems: flags unbalanced brackets', () => {
  assert.ok(rubyProblems('経験《けいけんした。').length > 0);
});

test('parseCloze: exactly one marker, extracts target/surface/kana/plain', () => {
  const p = parseCloze('私《わたし》は{{経験《けいけん》}}がある。');
  assert.equal(p.error, undefined);
  assert.equal(p.surface, '経験');
  assert.equal(p.kana, 'けいけん');
  assert.equal(p.plain, '私は経験がある。');
});

test('parseCloze: rejects zero or multiple markers', () => {
  assert.ok(parseCloze('no marker here').error);
  assert.ok(parseCloze('{{a}} and {{b}}').error);
});

test('kata2hira / isKanaOnly / hasKanji basics', () => {
  assert.equal(kata2hira('ケイケン'), 'けいけん');
  assert.equal(isKanaOnly('しかも'), true);
  assert.equal(isKanaOnly('経験'), false);
  assert.equal(hasKanji('経験'), true);
  assert.equal(hasKanji('しかも'), false);
});
