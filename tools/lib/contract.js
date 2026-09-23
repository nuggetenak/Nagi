'use strict';
// Output contracts embedded in every packet. These are FORMAT rules that the
// apply step enforces mechanically. They are deliberately NOT agent prompts:
// behaviour/persona/quality guidance comes from the existing agent prompts
// (packet.prompt_ref). Keep this file boring.

const REVIEW_CODES = {
  lexicon: ['wrong-entry', 'wrong-reading', 'wrong-pos', 'sense-mismatch', 'other'],
  'gloss-id': ['gloss-wrong', 'gloss-imprecise', 'gloss-unnatural', 'sense-mismatch', 'hint-needed', 'other'],
  sentences: ['ja-unnatural', 'ruby-wrong', 'target-wrong', 'tr-wrong', 'level-too-high', 'ambiguous-blank', 'other'],
};

const COMMON_RULES = [
  'Output JSON Lines only: exactly one JSON object per line, no markdown fences, no commentary, no trailing text.',
  'Return exactly one line for every id/slot listed in the packet. Do not add, drop or rename ids.',
  'Use only the fields listed in the shape. Extra fields (prov, hash, status, origin, entry, sid) are rejected.',
  'Never invent ids. Ids come from the packet.',
];

const CONTRACTS = {
  'gloss-id': {
    allowed: ['id', 'senses'],
    rules: [
      ...COMMON_RULES,
      'Each object: {id, senses:[{sid, gloss:[1-3 strings, each <= 60 chars], hint?: string <= 80 chars}]}.',
      'senses must cover exactly the sids present in the input entry (no more, no fewer).',
      'gloss[0] is the primary Indonesian meaning shown in drills.',
    ],
    shape: { id: 'w-000001', senses: [{ sid: 's1', gloss: ['<indonesian meaning>'], hint: '<optional disambiguation>' }] },
  },
  sentences: {
    allowed: ['id', 'ja', 'tr'],
    rules: [
      ...COMMON_RULES,
      'Each object: {id, ja, tr:{id, en?}} where id is a slot id from packet.slots.',
      'ja: exactly one {{...}} marker around the target word exactly as it appears in the sentence (inflection allowed).',
      'ja: EVERY kanji run must be followed by 《hiragana reading》, inside and outside the marker, e.g. {{経験《けいけん》}}.',
      'ja: no other { } characters; length <= 240 characters including ruby.',
      'tr.id (Indonesian translation) is required; tr.en is optional.',
    ],
    shape: { id: 'x-000001', ja: '<sentence with ruby and one {{target}}>', tr: { id: '<indonesian translation>', en: '<optional english>' } },
  },
  review: {
    allowed: ['id', 'verdict', 'codes', 'note'],
    rules: [
      ...COMMON_RULES,
      'Each object: {id, verdict:"pass"|"fail", codes?:[...], note?: string <= 200 chars}.',
      'codes is REQUIRED when verdict is "fail" and must come from the allowed review codes listed in this packet.',
      'A "pass" means the record is correct as written; do not rewrite records in a review packet.',
    ],
    shape: { id: '<record id>', verdict: 'pass', codes: [], note: '' },
  },
};

function contractFor(type, layer) {
  const c = CONTRACTS[type];
  const out = { format: 'jsonl', rules: [...c.rules], shape: c.shape };
  if (type === 'review') out.rules.push(`Allowed codes for layer "${layer}": ${REVIEW_CODES[layer].join(', ')}.`);
  return { allowed_fields: c.allowed, output_contract: out };
}

module.exports = { REVIEW_CODES, CONTRACTS, contractFor };
