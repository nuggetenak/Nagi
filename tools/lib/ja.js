'use strict';
// Japanese text conventions used by the data:
//   ruby  : 漢字《かんじ》  (reading in hiragana, directly after the kanji run)
//   cloze : exactly one {{...}} around the target *as it appears* in the sentence
// Both are LLM-friendly (no offsets to count) and machine-checkable.

const KANJI = '\\u3400-\\u4dbf\\u4e00-\\u9fff々〆';
const KANJI_RE = new RegExp(`[${KANJI}]`);
const KANJI_RUN_RE = new RegExp(`[${KANJI}]+`, 'g');
const RUBY_GROUP_RE = new RegExp(`[${KANJI}]+《([^《》]*)》`, 'g');
const HIRA_RE = /^[\u3041-\u3096\u30fc]+$/;

const kata2hira = (s) => s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const hasKanji = (s) => KANJI_RE.test(s);
const isKanaOnly = (s) => /^[\u3041-\u3096\u30a1-\u30fa\u30fc]+$/.test(s);
const stripRuby = (s) => s.replace(/《[^《》]*》/g, '');
const rubyToKana = (s) => s.replace(RUBY_GROUP_RE, '$1');

/** Returns a list of human-readable problems (empty = OK). */
function rubyProblems(s) {
  const problems = [];
  const cleaned = s.replace(/《([^《》]*)》/g, (all, inner, offset) => {
    if (!HIRA_RE.test(inner)) problems.push(`ruby 《${inner}》 must be hiragana only`);
    const prev = s[offset - 1];
    if (!prev || !KANJI_RE.test(prev)) problems.push(`ruby 《${inner}》 must directly follow a kanji`);
    return '';
  });
  if (/[《》]/.test(cleaned)) problems.push('unbalanced or nested 《》');
  for (const m of s.matchAll(KANJI_RUN_RE)) {
    if (s[m.index + m[0].length] !== '《') problems.push(`kanji "${m[0]}" has no ruby`);
  }
  return problems;
}

/** Parse the single {{target}} marker. */
function parseCloze(ja) {
  const opens = (ja.match(/\{\{/g) || []).length;
  const closes = (ja.match(/\}\}/g) || []).length;
  if (opens !== 1 || closes !== 1) {
    return { error: `need exactly one {{...}} marker (found ${opens} open / ${closes} close)` };
  }
  const m = ja.match(/^([^{}]*)\{\{([^{}]+)\}\}([^{}]*)$/);
  if (!m) return { error: 'malformed {{...}} marker (nested/extra braces or empty target)' };
  const [, before, target, after] = m;
  return {
    before, target, after,
    surface: stripRuby(target),                    // what the learner types for a kanji answer
    kana: rubyToKana(target),                      // kana-only accepted answer
    plain: stripRuby(before + target + after),     // sentence without ruby/markers
    kanaText: rubyToKana(before + target + after), // full sentence in kana (e.g. for TTS)
  };
}

module.exports = { KANJI_RE, HIRA_RE, kata2hira, hasKanji, isKanaOnly, stripRuby, rubyToKana, rubyProblems, parseCloze };
