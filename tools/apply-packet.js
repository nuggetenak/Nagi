#!/usr/bin/env node
'use strict';
// Consumes one agent/model's JSONL reply to a packet. Every line is judged on
// its own: a malformed or stale line is rejected and reported by id/reason,
// it never blocks the rest of the batch, and it is never silently dropped —
// rejects show up in the summary and in packets/P-xxxx.md so a fix-up packet
// can target exactly those ids next.
const fs = require('fs');
const path = require('path');
const { loadStore, saveLayer, appendLedger, appendIssue, today } = require('./lib/store');
const { basisHash, contentHash, family } = require('./lib/canon');
const { makeAjv, validatorFor, errorTexts } = require('./lib/schemas');
const { REVIEW_CODES } = require('./lib/contract');
const { refreshHandoffFiles } = require('./lib/handoff');

function parseArgs(argv) {
  const a = { root: path.resolve(__dirname, '..') };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--root') a.root = path.resolve(argv[++i]);
    else if (v === '--packet') a.packet = argv[++i];
    else if (v === '--output') a.output = argv[++i];
    else if (v === '--by') a.by = argv[++i];
    else if (v === '--dry-run') a.dryRun = true;
  }
  return a;
}

function readJsonlLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n').map((l, i) => ({ line: i + 1, raw: l })).filter((x) => x.raw.trim() !== '');
}

function main() {
  const a = parseArgs(process.argv);
  if (!a.packet || !a.output || !a.by) { console.error('usage: node tools/apply-packet.js --packet packets/P-0001.json --output reply.jsonl --by claude/opus-5'); process.exit(1); }
  if (!/^[a-z][a-z0-9-]*\/[A-Za-z0-9._:+-]+$/.test(a.by)) { console.error(`--by "${a.by}" doesn't look like "family/model", e.g. claude/opus-5 or human/nugget`); process.exit(1); }

  const packet = JSON.parse(fs.readFileSync(a.packet, 'utf8'));
  const store = loadStore(a.root);
  const ajv = makeAjv(a.root);
  const layer = packet.layer;
  const isReview = packet.type === 'review';
  const slotOf = new Map((packet.slots || []).map((s) => [s.id, s]));
  const expected = new Set(packet.ids);

  const accepted = [];
  const rejected = [];
  const parsedById = new Map();
  const claimedIds = new Set(); // any expected id that had AT LEAST ONE line naming it, valid or not — keeps "rejected" and "missing" mutually exclusive

  for (const { line, raw } of readJsonlLines(a.output)) {
    let obj;
    try { obj = JSON.parse(raw); } catch (e) { rejected.push({ id: null, line, reason: `invalid JSON: ${e.message}` }); continue; }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) { rejected.push({ id: null, line, reason: 'not a JSON object' }); continue; }
    if (typeof obj.id !== 'string') { rejected.push({ id: null, line, reason: 'missing "id"' }); continue; }
    claimedIds.add(obj.id);
    if (!expected.has(obj.id)) { rejected.push({ id: obj.id, line, reason: 'id not in this packet' }); continue; }
    if (parsedById.has(obj.id)) { rejected.push({ id: obj.id, line, reason: 'duplicate id in output (first occurrence used)' }); continue; }
    const extra = Object.keys(obj).filter((k) => k !== 'id' && !packet.allowed_fields.includes(k));
    if (extra.length) { rejected.push({ id: obj.id, line, reason: `disallowed field(s): ${extra.join(', ')}` }); continue; }
    parsedById.set(obj.id, obj);
  }

  for (const id of expected) {
    const obj = parsedById.get(id);
    if (!obj) continue; // handled as "missing" below

    if (isReview) {
      const target = store.layers[layer].get(id);
      if (!target) { rejected.push({ id, reason: 'target record no longer exists' }); continue; }
      if (packet.base[id] !== contentHash(target.rec)) { rejected.push({ id, reason: 'stale: record content changed since this packet was cut' }); continue; }
      if (obj.verdict !== 'pass' && obj.verdict !== 'fail') { rejected.push({ id, reason: 'verdict must be "pass" or "fail"' }); continue; }
      if (obj.verdict === 'fail') {
        const codes = Array.isArray(obj.codes) ? obj.codes : [];
        const bad = codes.filter((c) => !REVIEW_CODES[layer].includes(c));
        if (!codes.length) { rejected.push({ id, reason: 'verdict "fail" requires at least one code' }); continue; }
        if (bad.length) { rejected.push({ id, reason: `unknown code(s): ${bad.join(', ')}` }); continue; }
      }
      const madeBy = target.rec.prov && target.rec.prov.made && target.rec.prov.made.by;
      if (obj.verdict === 'pass' && madeBy === a.by) { rejected.push({ id, reason: 'reviewer is the same actor that made this record — needs an independent actor' }); continue; }
      accepted.push({ id, kind: 'review', obj, target });
      continue;
    }

    // gloss-id / sentences (make)
    const entryId = layer === 'sentences' ? slotOf.get(id).entry : id;
    const entry = store.layers.lexicon.get(entryId);
    if (!entry) { rejected.push({ id, reason: `no lexicon entry ${entryId} (was it removed?)` }); continue; }
    if (packet.base[id] !== basisHash(entry.rec)) { rejected.push({ id, reason: 'stale: lexicon entry changed since this packet was cut (re-cut the packet)' }); continue; }

    let candidate;
    if (packet.type === 'gloss-id') candidate = { id, senses: obj.senses };
    else candidate = { id, entry: entryId, sid: slotOf.get(id).sid, ja: obj.ja, tr: obj.tr, origin: family(a.by) === 'human' ? 'human' : 'ai' };

    const validate = validatorFor(ajv, packet.type);
    if (!validate(candidate)) { rejected.push({ id, reason: errorTexts(validate.errors).join('; ') }); continue; }
    if (packet.type === 'gloss-id') {
      const l1sids = new Set(entry.rec.senses.map((s) => s.sid));
      const l2sids = candidate.senses.map((s) => s.sid);
      if (new Set(l2sids).size !== l2sids.length) { rejected.push({ id, reason: 'duplicate sense id' }); continue; }
      const bad = l2sids.filter((s) => !l1sids.has(s));
      if (bad.length) { rejected.push({ id, reason: `sense id(s) not on this entry: ${bad.join(', ')}` }); continue; }
      const missing = [...l1sids].filter((s) => !l2sids.includes(s));
      if (missing.length) { rejected.push({ id, reason: `missing gloss for sense(s): ${missing.join(', ')}` }); continue; }
    }
    accepted.push({ id, kind: 'make', candidate, entry });
  }

  const missing = [...expected].filter((id) => !claimedIds.has(id));

  if (a.dryRun) {
    console.log(`dry-run: would apply ${accepted.length}, reject ${rejected.length}, missing ${missing.length}`);
    for (const r of rejected) console.log(`  reject ${r.id || '(no id)'}${r.line ? ` line ${r.line}` : ''}: ${r.reason}`);
    return;
  }

  let openedIssues = 0, passCount = 0;
  for (const item of accepted) {
    if (item.kind === 'make') {
      const hash = contentHash(item.candidate);
      const basis = basisHash(item.entry.rec);
      const rec = { ...item.candidate, prov: { made: { by: a.by, at: today(), packet: packet.packet_id, hash, basis } } };
      store.layers[layer].set(item.id, { rec, raw: null, file: null, line: null });
    } else {
      const rec = item.target.rec;
      const hash = contentHash(rec);
      const basis = layer === 'lexicon' ? null : basisHash(store.layers.lexicon.get(layer === 'sentences' ? rec.entry : item.id).rec);
      const stamp = { by: a.by, at: today(), packet: packet.packet_id, hash, ...(basis !== null ? { basis } : {}) };
      if (item.obj.verdict === 'pass') {
        rec.prov = { ...rec.prov, [family(a.by) === 'human' ? 'verified' : 'checked']: stamp };
        passCount++;
      } else {
        appendIssue(a.root, { event: 'open', layer, id: item.id, packet: packet.packet_id, by: a.by, codes: item.obj.codes, note: item.obj.note || '', at: today() });
        openedIssues++;
      }
      store.layers[layer].set(item.id, item.target);
    }
  }
  if (accepted.length) saveLayer(store, layer);

  appendLedger(a.root, {
    event: 'applied', packet_id: packet.packet_id, type: packet.type, layer, by: a.by,
    applied: accepted.length, rejected: rejected.length, missing: missing.length, at: today(),
    ...(isReview ? { pass: passCount, opened_issues: openedIssues } : {}),
  });
  refreshHandoffFiles(a.root, null);

  const mdPath = a.packet.replace(/\.json$/, '.md');
  const resultBlock = [
    '', '## Result', '', `Applied by \`${a.by}\` on ${today()}: **${accepted.length} accepted**, **${rejected.length} rejected**, **${missing.length} missing**.`,
    ...(isReview ? [`Pass: ${passCount}, fail (issue opened): ${openedIssues}.`] : []),
    ...(rejected.length ? ['', '### Rejected', '', ...rejected.map((r) => `- \`${r.id || '(no id)'}\`${r.line ? ` (line ${r.line})` : ''}: ${r.reason}`)] : []),
    ...(missing.length ? ['', '### Missing (no output line for these ids)', '', ...missing.map((id) => `- \`${id}\``)] : []),
    '',
  ].join('\n');
  if (fs.existsSync(mdPath)) fs.appendFileSync(mdPath, resultBlock);

  console.log(`${packet.packet_id}: applied ${accepted.length}, rejected ${rejected.length}, missing ${missing.length}`);
  if (isReview) console.log(`  pass ${passCount}, fail/issue-opened ${openedIssues}`);
  for (const r of rejected.slice(0, 15)) console.log(`  reject ${r.id || '(no id)'}${r.line ? ` line ${r.line}` : ''}: ${r.reason}`);
  if (rejected.length > 15) console.log(`  ... +${rejected.length - 15} more (see ${path.basename(mdPath)})`);
}

main();
