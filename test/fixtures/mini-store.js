'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { canonLine, contentHash, basisHash } = require('../../tools/lib/canon');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Creates a fresh temp dir with schema/ copied in and a tiny 3-entry lexicon
 * (all exact JMdict matches, so status starts at "checked"). Returns the root path.
 */
function makeFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nvc-test-'));
  fs.cpSync(path.join(REPO_ROOT, 'schema'), path.join(root, 'schema'), { recursive: true });
  for (const d of ['data/lexicon', 'data/gloss-id', 'data/sentences', 'packets', 'audit']) fs.mkdirSync(path.join(root, d), { recursive: true });

  const contents = [
    { headword: '経験', reading: 'けいけん', pos: ['n', 'vs', 'vt'], lists: [{ src: 'test-fixture', level: 'N3' }], jmdict: { seq: 1251270, match: 'exact', senses_total: 1 }, senses: [{ sid: 's1', en: ['experience'] }] },
    { headword: '確認', reading: 'かくにん', pos: ['n', 'vs', 'vt'], lists: [{ src: 'test-fixture', level: 'N3' }], jmdict: { seq: 1210320, match: 'exact', senses_total: 1 }, senses: [{ sid: 's1', en: ['confirmation', 'checking'] }] },
    { headword: '駅', reading: 'えき', pos: ['n'], lists: [{ src: 'test-fixture', level: 'N3' }], jmdict: { seq: 1191430, match: 'exact', senses_total: 1 }, senses: [{ sid: 's1', en: ['station'] }] },
  ];
  const recs = contents.map((content, i) => {
    const id = `w-${String(i + 1).padStart(6, '0')}`;
    const withId = { id, ...content };
    const hash = contentHash(withId);
    const basis = basisHash(withId);
    return { ...withId, prov: { made: { by: 'tool/seed-import', at: '2026-01-01', hash, basis } } };
  });
  fs.writeFileSync(path.join(root, 'data/lexicon/0001.jsonl'), recs.map(canonLine).join('\n') + '\n');
  fs.writeFileSync(path.join(root, 'data/counters.json'), JSON.stringify({ w: 3, x: 0, p: 0 }, null, 2) + '\n');
  return root;
}

module.exports = { makeFixtureRoot, REPO_ROOT };
