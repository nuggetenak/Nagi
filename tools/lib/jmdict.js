'use strict';
// JMdict (jmdict-simplified JSON) + public JLPT list helpers, shared by
// seed-import.js and jmdict-sync.js.
//
// Matching tiers (measured on the real N3 list + JMdict 3.6.2, see docs/BLUEPRINT.md):
//   exact      one JMdict entry matches (headword, reading)            -> mechanically checked
//   gloss      several match, exactly one overlaps the list's English  -> needs review
//   common     several match, exactly one is flagged "common"          -> needs review
//   ambiguous  several match, cannot pick                              -> manual queue
//   none       no match                                                -> manual queue
const fs = require('fs');
const { kata2hira, isKanaOnly } = require('./ja');

// ---------- CSV (RFC 4180-ish, enough for the public list) ----------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  const keys = head.map((h) => h.trim());
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(keys.map((k, j) => [k, r[j] === undefined ? '' : r[j]])));
}

// ---------- JMdict ----------
function loadJmdict(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { meta: { version: d.version, dictDate: d.dictDate }, words: d.words };
}

function buildIndex(words) {
  const pair = new Map(); // "kanji\tkanaHira" -> Set(word id)
  const kana = new Map(); // kanaHira -> Set(word id)
  const byId = new Map();
  const add = (m, k, id) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(id); };
  for (const w of words) {
    byId.set(w.id, w);
    for (const r of w.kana) {
      const rk = kata2hira(r.text);
      add(kana, rk, w.id);
      const ks = r.appliesToKanji.includes('*') ? w.kanji : w.kanji.filter((k) => r.appliesToKanji.includes(k.text));
      for (const k of ks) add(pair, `${k.text}\t${rk}`, w.id);
    }
  }
  return { pair, kana, byId };
}

// ---------- list rows ----------
const STOP = new Set('to a an the of be or and in on for with one s ones something someone etc usu esp'.split());
const tokens = (s) => new Set((String(s).toLowerCase().match(/[a-z]+/g) || []).filter((t) => t.length > 2 && !STOP.has(t)));
const glossTokens = (w) => {
  const t = new Set();
  for (const s of w.sense) for (const g of s.gloss) for (const x of tokens(g.text)) t.add(x);
  return t;
};
const isCommon = (w) => w.kanji.some((k) => k.common) || w.kana.some((k) => k.common);

/** "しまった (かん)" -> ["しまった"]; "在る; 有る" -> ["在る","有る"] */
const cleanField = (s) => String(s).trim().replace(/\s*[(（][^)）]*[)）]\s*$/, '').split(/[;；]/).map((x) => x.trim()).filter(Boolean);

function normalizeRow(row) {
  return {
    forms: cleanField(row.expression),
    readings: cleanField(row.reading).map(kata2hira),
    meaning: (row.meaning || '').trim(),
    guid: (row.guid || '').trim(),
  };
}

function matchRow(nr, idx) {
  const cand = new Set();
  for (const f of nr.forms) for (const r of nr.readings) for (const id of idx.pair.get(`${f}\t${r}`) || []) cand.add(id);
  let tier = 'pair';
  if (cand.size === 0 && nr.forms.length && nr.forms.every(isKanaOnly)) {
    tier = 'kana';
    for (const r of nr.readings) for (const id of idx.kana.get(r) || []) cand.add(id);
  }
  const candidates = [...cand];
  if (cand.size === 0) return { status: 'none', candidates };
  if (cand.size === 1) return { status: 'exact', id: candidates[0], tier, candidates };
  const mt = tokens(nr.meaning);
  const scored = candidates.map((id) => ({ id, score: [...glossTokens(idx.byId.get(id))].filter((t) => mt.has(t)).length }));
  const best = Math.max(...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === best);
  if (best > 0 && top.length === 1) return { status: 'gloss', id: top[0].id, tier, candidates };
  const common = candidates.filter((id) => isCommon(idx.byId.get(id)));
  if (common.length === 1) return { status: 'common', id: common[0], tier, candidates };
  return { status: 'ambiguous', candidates };
}

const samePos = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Build the L1 content (without id/prov) from a JMdict word. Deterministic; reused by sync. */
function entryFromWord(word, { headword, reading, altForms = [], altReadings = [], list, jmdictMatch, maxSenses = 3 }) {
  const readingsHira = [reading, ...altReadings];
  const applies = (s) =>
    (s.appliesToKanji.includes('*') || s.appliesToKanji.includes(headword) || altForms.some((f) => s.appliesToKanji.includes(f))) &&
    (s.appliesToKana.includes('*') || s.appliesToKana.some((k) => readingsHira.includes(kata2hira(k))));
  const usable = word.sense.filter(applies);
  const used = usable.length ? usable : word.sense;
  const pos = used[0].partOfSpeech.length ? used[0].partOfSpeech : ['unc'];
  const tagSet = new Set();
  for (const s of used.slice(0, maxSenses)) for (const m of s.misc) tagSet.add(m);
  const matchedKanji = word.kanji.find((k) => k.text === headword);
  const matchedKana = word.kana.find((k) => kata2hira(k.text) === reading);
  if ((matchedKanji && matchedKanji.common) || (matchedKana && matchedKana.common)) tagSet.add('common');

  const entry = {
    headword,
    reading,
    pos: [...pos],
    lists: list ? [list] : [],
    jmdict: { seq: parseInt(word.id, 10), match: jmdictMatch, senses_total: used.length },
    senses: used.slice(0, maxSenses).map((s, i) => {
      const o = { sid: `s${i + 1}`, en: s.gloss.map((g) => g.text).slice(0, 4) };
      if (!samePos(s.partOfSpeech, pos)) o.pos = [...s.partOfSpeech];
      return o;
    }),
  };
  if (altForms.length) entry.alt_forms = altForms;
  if (altReadings.length) entry.alt_readings = altReadings;
  if (tagSet.size) entry.tags = [...tagSet].sort();
  return entry;
}

module.exports = { parseCsv, loadJmdict, buildIndex, normalizeRow, matchRow, entryFromWord, isCommon, samePos };
