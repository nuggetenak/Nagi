'use strict';
// Status is DERIVED, never stored. A record is only as trustworthy as the
// hashes in its stamps say: edit the content and every earlier check goes stale
// automatically, with no tool discipline required.
//   draft    : made, but no valid cross-family check for the CURRENT content
//   checked  : reviewed pass by a different model family for current content (+ current L1 basis)
//   verified : human pass for current content
const { contentHash, basisHash, family } = require('./canon');

/** null = layer has no dependency (L1); undefined = orphan (L1 entry missing); string = basis hash */
function basisFor(store, layer, rec) {
  if (layer === 'lexicon') return null;
  const e = store.layers.lexicon.get(layer === 'sentences' ? rec.entry : rec.id);
  return e ? basisHash(e.rec) : undefined;
}

function stampValid(stamp, hash, basis) {
  if (!stamp || stamp.hash !== hash || basis === undefined) return false;
  return basis === null || stamp.basis === basis;
}

function statusOf(store, layer, rec) {
  const prov = rec.prov || {};
  const hash = contentHash(rec);
  const basis = basisFor(store, layer, rec);
  if (stampValid(prov.verified, hash, basis) && family(prov.verified.by) === 'human') return 'verified';
  if (stampValid(prov.checked, hash, basis) && prov.made && prov.checked.by !== prov.made.by) return 'checked';
  // L1 exact joins to the authoritative source are mechanically checked (only while untouched since the tool made them)
  if (layer === 'lexicon' && rec.jmdict && rec.jmdict.match === 'exact' && prov.made
      && family(prov.made.by) === 'tool' && prov.made.hash === hash) return 'checked';
  return 'draft';
}

const STATUS_ORDER = { draft: 0, checked: 1, verified: 2 };
const atLeast = (status, min) => STATUS_ORDER[status] >= STATUS_ORDER[min];

module.exports = { basisFor, stampValid, statusOf, atLeast, STATUS_ORDER };
