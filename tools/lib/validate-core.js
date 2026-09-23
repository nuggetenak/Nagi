'use strict';
// The hard gate. Errors (E***) block merge/apply; warnings (W***) are
// observations for humans/agents to act on and never block.
//
//   E001 schema / JSON            E006 id reused (live id also in redirects)
//   E002 not canonical formatting E007 provenance invariant broken
//   E003 bad id / wrong shard     E008 ruby / cloze syntax in sentence
//   E004 duplicate id             E009 kana-only headword != reading
//   E005 orphan / bad reference   E010 duplicate sense id in an entry
//   W001 stale check stamp (record demoted)   W006 JMdict join not exact (needs review)
//   W002 duplicate primary gloss (ambiguous)   W008 cloze target unrelated to entry
//   W004 L1 sense has no L2 gloss              W010 edited outside a packet (re-stamp it)
const { canonLine, contentHash, family } = require('./canon');
const { LAYERS, ID_RE, shardFile, openIssues } = require('./store');
const { validatorFor, errorTexts } = require('./schemas');
const { statusOf, stampValid, basisFor } = require('./status');
const { rubyProblems, parseCloze, hasKanji, kata2hira, KANJI_RE } = require('./ja');

function targetRelated(parsed, entry) {
  const surface = parsed.surface;
  const kana = kata2hira(parsed.kana);
  for (const f of [entry.headword, ...(entry.alt_forms || [])]) {
    if (hasKanji(f)) {
      if ([...f].some((c) => KANJI_RE.test(c) && surface.includes(c))) return true;
    } else if (surface.includes(f.slice(0, Math.max(1, f.length - 2)))) return true;
  }
  for (const r of [entry.reading, ...(entry.alt_readings || [])]) {
    if (kana.includes(kata2hira(r).slice(0, Math.max(1, r.length - 2)))) return true;
  }
  return false;
}

function validateStore(store, { ajv, checkFormat = true } = {}) {
  const errors = [];
  const warnings = [];
  const E = (code, msg, ctx = {}) => errors.push({ code, msg, ...ctx });
  const W = (code, msg, ctx = {}) => warnings.push({ code, msg, ...ctx });
  const lex = store.layers.lexicon;
  const gloss = store.layers['gloss-id'];
  const sents = store.layers.sentences;

  for (const p of store.parseErrors) E('E001', `invalid JSON: ${p.message}`, p);
  for (const d of store.dups) E('E004', `duplicate id ${d.id} in layer ${d.layer}`, d);

  // ---- per-record: schema, id shape, formatting, provenance ----
  for (const [layer, cfg] of Object.entries(LAYERS)) {
    const validate = validatorFor(ajv, layer);
    for (const [id, item] of store.layers[layer]) {
      const ctx = { layer, id, file: item.file, line: item.line };
      const rec = item.rec;
      if (!validate(rec)) for (const t of errorTexts(validate.errors)) E('E001', t, ctx);
      if (!ID_RE.test(id) || id[0] !== cfg.prefix) { E('E003', `id ${id} does not fit layer ${layer}`, ctx); continue; }
      if (checkFormat && item.raw != null) {
        if (item.raw !== canonLine(rec)) E('E002', 'not canonical (run: npm run fmt)', ctx);
        if (item.file !== shardFile(layer, id)) E('E003', `wrong shard file, expected ${shardFile(layer, id)}`, ctx);
      }
      const prov = rec.prov || {};
      if (prov.checked && !prov.made) E('E007', 'checked stamp without made stamp', ctx);
      if (prov.checked && prov.made && prov.checked.by === prov.made.by) {
        E('E007', `checked.by "${prov.checked.by}" equals made.by (needs an independent actor)`, ctx);
      }
      if (prov.verified && family(prov.verified.by) !== 'human') E('E007', 'verified stamp must be by human/*', ctx);
      const hash = contentHash(rec);
      const basis = basisFor(store, layer, rec);
      for (const kind of ['checked', 'verified']) {
        if (prov[kind] && !stampValid(prov[kind], hash, basis)) {
          W('W001', `${kind} stamp is stale (content or L1 basis changed) -> status draft`, ctx);
        }
      }
      if (prov.made && prov.made.hash && prov.made.hash !== hash) {
        W('W010', 'edited outside a packet since made (run tools/stamp.js --made after hand edits)', ctx);
      }
    }
  }

  // ---- ids reused after tombstoning ----
  for (const r of store.redirects) {
    const live = r.id && (r.id[0] === 'x' ? sents.has(r.id) : lex.has(r.id) || gloss.has(r.id));
    if (live) E('E006', `id ${r.id} is in redirects.jsonl but also live (ids are never reused)`, { id: r.id });
  }

  // ---- L1 rules ----
  for (const [id, { rec, file, line }] of lex) {
    const ctx = { layer: 'lexicon', id, file, line };
    if (typeof rec.headword === 'string' && typeof rec.reading === 'string'
        && !hasKanji(rec.headword) && kata2hira(rec.headword) !== rec.reading) {
      E('E009', `kana-only headword "${rec.headword}" does not match reading "${rec.reading}"`, ctx);
    }
    const sids = (rec.senses || []).map((s) => s.sid);
    if (new Set(sids).size !== sids.length) E('E010', 'duplicate sense id in entry', ctx);
    if (rec.jmdict && rec.jmdict.match !== 'exact' && statusOf(store, 'lexicon', rec) === 'draft') {
      W('W006', `JMdict join "${rec.jmdict.match}" is not exact and not yet reviewed`, ctx);
    }
  }

  // ---- L2 rules ----
  const primary = new Map(); // normalised primary gloss -> [{id, sid, hint}]
  for (const [id, { rec, file, line }] of gloss) {
    const ctx = { layer: 'gloss-id', id, file, line };
    const entry = lex.get(id);
    if (!entry) { E('E005', 'gloss record has no L1 entry', ctx); continue; }
    const l1 = new Set((entry.rec.senses || []).map((s) => s.sid));
    const l2 = new Set();
    for (const s of rec.senses || []) {
      if (l2.has(s.sid)) E('E010', `duplicate sense ${s.sid} in gloss record`, ctx);
      l2.add(s.sid);
      if (!l1.has(s.sid)) E('E005', `sense ${s.sid} does not exist in L1 entry`, ctx);
      const key = String((s.gloss || [])[0] || '').toLowerCase();
      if (key) { if (!primary.has(key)) primary.set(key, []); primary.get(key).push({ id, sid: s.sid, hint: s.hint }); }
    }
    for (const sid of l1) if (!l2.has(sid)) W('W004', `L1 sense ${sid} has no L2 gloss`, ctx);
  }
  for (const [key, list] of primary) {
    const ids = new Set(list.map((x) => x.id));
    if (ids.size > 1 && list.some((x) => !x.hint)) {
      W('W002', `primary gloss "${key}" shared by ${[...ids].slice(0, 6).join(', ')}${ids.size > 6 ? '…' : ''} -> ambiguous for meaning->word drills (add hint)`, { layer: 'gloss-id', id: [...ids][0] });
    }
  }

  // ---- L3 rules ----
  for (const [id, { rec, file, line }] of sents) {
    const ctx = { layer: 'sentences', id, file, line };
    const entry = lex.get(rec.entry);
    if (!entry) E('E005', `sentence references missing entry ${rec.entry}`, ctx);
    else if (!(entry.rec.senses || []).some((s) => s.sid === rec.sid)) E('E005', `sentence references missing sense ${rec.entry}/${rec.sid}`, ctx);
    if (typeof rec.ja === 'string') {
      for (const p of rubyProblems(rec.ja)) E('E008', p, ctx);
      const parsed = parseCloze(rec.ja);
      if (parsed.error) E('E008', parsed.error, ctx);
      else if (entry && typeof entry.rec.headword === 'string' && typeof entry.rec.reading === 'string' && !targetRelated(parsed, entry.rec)) W('W008', `cloze target "${parsed.surface}" looks unrelated to ${entry.rec.headword}`, ctx);
    }
  }

  // ---- stats ----
  const stats = { counts: {}, status: {}, coverage: {}, match: {}, openIssues: openIssues(store.root).size };
  for (const layer of Object.keys(LAYERS)) {
    stats.counts[layer] = store.layers[layer].size;
    stats.status[layer] = { draft: 0, checked: 0, verified: 0 };
    for (const { rec } of store.layers[layer].values()) stats.status[layer][statusOf(store, layer, rec)]++;
  }
  const withSentence = new Set([...sents.values()].map((x) => x.rec.entry));
  stats.coverage = { entries: lex.size, withGloss: gloss.size, withSentence: withSentence.size, sentences: sents.size };
  for (const { rec } of lex.values()) {
    const m = (rec.jmdict && rec.jmdict.match) || 'invalid';
    stats.match[m] = (stats.match[m] || 0) + 1;
  }

  return { errors, warnings, stats };
}

module.exports = { validateStore };
