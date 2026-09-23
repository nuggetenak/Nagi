'use strict';
// Canonical serialisation + hashing. Agents can't compute hashes or keep key
// order stable, so tools do it. Everything downstream (status, staleness,
// diffs) relies on these three functions staying boring and deterministic.
const crypto = require('crypto');

function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeysDeep(v[k]);
    return out;
  }
  return v;
}

/** One canonical JSONL line: `id` first, `prov` last, everything else alphabetical. */
function canonLine(rec) {
  const out = {};
  if ('id' in rec) out.id = rec.id;
  for (const k of Object.keys(rec).sort()) {
    if (k === 'id' || k === 'prov') continue;
    out[k] = sortKeysDeep(rec[k]);
  }
  if ('prov' in rec) out.prov = sortKeysDeep(rec.prov);
  return JSON.stringify(out);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Hash of a record's content = everything except `prov`. 16 hex chars. */
function contentHash(rec) {
  const { prov, ...content } = rec; // eslint-disable-line no-unused-vars
  return sha256(JSON.stringify(sortKeysDeep(content))).slice(0, 16);
}

/**
 * Hash of the L1 fields that L2/L3 depend on. When JMdict re-sync (or a human)
 * changes any of these, dependent records automatically fall back to `draft`.
 */
function basisHash(entry) {
  const basis = {
    headword: entry.headword,
    reading: entry.reading,
    pos: entry.pos,
    senses: (entry.senses || []).map((s) => ({ sid: s.sid, en: s.en })),
  };
  return sha256(JSON.stringify(sortKeysDeep(basis))).slice(0, 16);
}

/** "claude/opus-5" -> "claude". Cross-check rule compares families, not models. */
const family = (actor) => (actor ? String(actor).split('/')[0] : null);

module.exports = { sortKeysDeep, canonLine, sha256, contentHash, basisHash, family };
