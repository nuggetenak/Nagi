'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeFixtureRoot, REPO_ROOT } = require('./fixtures/mini-store');
const { loadStore } = require('../tools/lib/store');
const { statusOf } = require('../tools/lib/status');
const { openIssues } = require('../tools/lib/store');

const T = (name) => path.join(REPO_ROOT, 'tools', name);
const run = (script, args) => execFileSync('node', [T(script), ...args], { encoding: 'utf8' });
const latestPacket = (root) => fs.readdirSync(path.join(root, 'packets')).filter((f) => f.endsWith('.json')).sort().pop();
const writeJsonl = (file, objs) => fs.writeFileSync(file, objs.map((o) => JSON.stringify(o)).join('\n') + '\n');

test('full lifecycle: make gloss packet -> apply -> review packet -> apply (pass+fail) -> build', () => {
  const root = makeFixtureRoot();

  // 1) cut a gloss-id packet for all 3 entries
  run('make-packet.js', ['--root', root, '--type', 'gloss-id', '--n', '3', '--prompt-ref', 'agents/test.md', '--role', 'Test']);
  const p1 = JSON.parse(fs.readFileSync(path.join(root, 'packets', latestPacket(root)), 'utf8'));
  assert.equal(p1.type, 'gloss-id');
  assert.deepEqual(p1.ids.sort(), ['w-000001', 'w-000002', 'w-000003']);

  // 2) a well-formed reply
  const reply1 = path.join(root, 'reply1.jsonl');
  writeJsonl(reply1, [
    { id: 'w-000001', senses: [{ sid: 's1', gloss: ['pengalaman'] }] },
    { id: 'w-000002', senses: [{ sid: 's1', gloss: ['konfirmasi', 'pengecekan'] }] },
    { id: 'w-000003', senses: [{ sid: 's1', gloss: ['stasiun'] }] },
  ]);
  const out1 = run('apply-packet.js', ['--root', root, '--packet', path.join(root, 'packets', p1.packet_id + '.json'), '--output', reply1, '--by', 'claude/test-maker']);
  assert.match(out1, /applied 3, rejected 0, missing 0/);

  let store = loadStore(root);
  assert.equal(store.layers['gloss-id'].size, 3);
  assert.equal(statusOf(store, 'gloss-id', store.layers['gloss-id'].get('w-000001').rec), 'draft');

  // 3) rejection paths on a second gloss packet (ids already covered, force via --ids)
  run('make-packet.js', ['--root', root, '--type', 'gloss-id', '--ids', 'w-000001', '--prompt-ref', 'x']);
  const p2id = latestPacket(root).replace('.json', '');
  const bad = path.join(root, 'bad.jsonl');
  writeJsonl(bad, [{ id: 'w-000001', senses: [{ sid: 's1', gloss: ['pengalaman'] }], note: 'not allowed' }]);
  const out2 = run('apply-packet.js', ['--root', root, '--packet', path.join(root, 'packets', p2id + '.json'), '--output', bad, '--by', 'claude/test-maker']);
  assert.match(out2, /applied 0, rejected 1, missing 0/);
  assert.match(out2, /disallowed field/);

  // 4) stale-base rejection: edit the entry after the packet was cut, then try applying an old reply
  run('make-packet.js', ['--root', root, '--type', 'gloss-id', '--ids', 'w-000002', '--prompt-ref', 'x']);
  const p3id = latestPacket(root).replace('.json', '');
  const lexFile = path.join(root, 'data/lexicon/0001.jsonl');
  fs.writeFileSync(lexFile, fs.readFileSync(lexFile, 'utf8').replace('"confirmation","checking"', '"confirmation"'));
  const staleReply = path.join(root, 'stale.jsonl');
  writeJsonl(staleReply, [{ id: 'w-000002', senses: [{ sid: 's1', gloss: ['konfirmasi'] }] }]);
  const out3 = run('apply-packet.js', ['--root', root, '--packet', path.join(root, 'packets', p3id + '.json'), '--output', staleReply, '--by', 'claude/test-maker']);
  assert.match(out3, /rejected 1/);
  assert.match(out3, /stale/);

  // put w-000002's senses back the way the rest of the test expects
  fs.writeFileSync(lexFile, fs.readFileSync(lexFile, 'utf8').replace('"confirmation"]', '"confirmation","checking"]'));

  // 5) review packet on gloss-id: 2 pass, 1 fail
  run('make-packet.js', ['--root', root, '--type', 'review', '--layer', 'gloss-id', '--n', '3', '--prompt-ref', 'agents/reviewer.md']);
  const p4 = JSON.parse(fs.readFileSync(path.join(root, 'packets', latestPacket(root)), 'utf8'));
  assert.equal(p4.type, 'review');
  const reviewReply = path.join(root, 'review1.jsonl');
  writeJsonl(reviewReply, [
    { id: 'w-000001', verdict: 'pass' },
    { id: 'w-000002', verdict: 'pass' },
    { id: 'w-000003', verdict: 'fail', codes: ['gloss-wrong'], note: 'stasiun should be tempat pemberhentian? check nuance' },
  ]);
  const out4 = run('apply-packet.js', ['--root', root, '--packet', path.join(root, 'packets', p4.packet_id + '.json'), '--output', reviewReply, '--by', 'claude/test-reviewer']);
  assert.match(out4, /applied 3, rejected 0, missing 0/);
  assert.match(out4, /pass 2, fail\/issue-opened 1/);

  store = loadStore(root);
  assert.equal(statusOf(store, 'gloss-id', store.layers['gloss-id'].get('w-000001').rec), 'checked');
  assert.equal(statusOf(store, 'gloss-id', store.layers['gloss-id'].get('w-000002').rec), 'checked');
  assert.equal(statusOf(store, 'gloss-id', store.layers['gloss-id'].get('w-000003').rec), 'draft');
  assert.equal(openIssues(root).size, 1);

  // 6) same-actor review is rejected (maker cannot check their own work)
  run('make-packet.js', ['--root', root, '--type', 'review', '--layer', 'gloss-id', '--ids', 'w-000001', '--prompt-ref', 'x']);
  const p5id = latestPacket(root).replace('.json', '');
  const selfReview = path.join(root, 'self.jsonl');
  writeJsonl(selfReview, [{ id: 'w-000001', verdict: 'pass' }]);
  const out5 = run('apply-packet.js', ['--root', root, '--packet', path.join(root, 'packets', p5id + '.json'), '--output', selfReview, '--by', 'claude/test-maker']);
  assert.match(out5, /rejected 1/);
  assert.match(out5, /same actor/);

  // 7) HANDOFF.md / PROGRESS.md reflect the run
  const handoff = fs.readFileSync(path.join(root, 'HANDOFF.md'), 'utf8');
  assert.match(handoff, /checked 2/);
  const progress = fs.readFileSync(path.join(root, 'PROGRESS.md'), 'utf8');
  assert.match(progress, /claude\/test-reviewer/);

  // 8) build compiles the bundle
  run('build.js', ['--root', root]);
  const bundle = JSON.parse(fs.readFileSync(path.join(root, 'data/dist/n3-core.json'), 'utf8'));
  assert.equal(bundle.counts.entries, 3);
  const w1 = bundle.entries.find((e) => e.id === 'w-000001');
  assert.equal(w1.senses[0].id[0], 'pengalaman');
});

test('stamp.js clears W010 after a hand edit', () => {
  const root = makeFixtureRoot();
  const f = path.join(root, 'data/lexicon/0001.jsonl');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('"experience"', '"experience","(hand-added nuance)"'));

  let store = loadStore(root);
  const { validateStore } = require('../tools/lib/validate-core');
  const { makeAjv } = require('../tools/lib/schemas');
  let { warnings } = validateStore(store, { ajv: makeAjv(root) });
  assert.ok(warnings.some((w) => w.code === 'W010'));

  run('stamp.js', ['--root', root, '--layer', 'lexicon', '--id', 'w-000001', '--by', 'human/nugget']);
  store = loadStore(root);
  ({ warnings } = validateStore(store, { ajv: makeAjv(root) }));
  assert.ok(!warnings.some((w) => w.code === 'W010'));
});
