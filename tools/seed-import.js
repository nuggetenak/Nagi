#!/usr/bin/env node
'use strict';
// Builds data/lexicon/*.jsonl from data/seed/n3-public-list.csv + JMdict.
// Content (reading validity, POS, English senses) is always taken from
// JMdict — the CSV only selects WHICH headwords count as N3 and tags the
// entry with that source. Idempotent: re-running adds a `lists[]` tag to an
// existing entry instead of duplicating it, so a second list (N2, a second
// N3 source for cross-checking, ...) can be layered in later with the same
// command. Anything that can't be resolved automatically is written to
// data/seed/unresolved.jsonl + import-report.md for manual disposition —
// nothing is silently dropped.
const fs = require('fs');
const path = require('path');
const { loadStore, saveLayer, reserve, fmtId, today, writeFileAtomic } = require('./lib/store');
const { parseCsv, loadJmdict, buildIndex, normalizeRow, matchRow, entryFromWord } = require('./lib/jmdict');
const { contentHash, basisHash } = require('./lib/canon');
const { kata2hira } = require('./lib/ja');
const { makeAjv } = require('./lib/schemas');
const { validateStore } = require('./lib/validate-core');
const { refreshHandoffFiles } = require('./lib/handoff');

function parseArgs(argv) {
  const a = { root: path.resolve(__dirname, '..'), level: 'N3', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--root') a.root = path.resolve(argv[++i]);
    else if (v === '--csv') a.csv = argv[++i];
    else if (v === '--jmdict') a.jmdict = argv[++i];
    else if (v === '--list-src') a.listSrc = argv[++i];
    else if (v === '--level') a.level = argv[++i];
    else if (v === '--dry-run') a.dryRun = true;
  }
  return a;
}

function pickHeadwordReading(nr, idx, winId) {
  // Find which (form, reading) pair in the CSV row actually produced the winning id;
  // that pair becomes headword/reading. Other forms/readings that ALSO validate
  // against the same word become alt_forms/alt_readings; anything that doesn't is
  // dropped with a note (kept in the report, never silently merged in wrong).
  const notes = [];
  let head = null, read = null;
  outer: for (const f of nr.forms) {
    for (const r of nr.readings) {
      if ((idx.pair.get(`${f}\t${r}`) || new Set()).has(winId)) { head = f; read = r; break outer; }
    }
  }
  if (!head) { // kana-tier match: no kanji pair, first reading that hits the id wins
    for (const r of nr.readings) if ((idx.kana.get(r) || new Set()).has(winId)) { read = r; break; }
    head = nr.forms[0];
    if (kata2hira(head) !== read && !/[\u3400-\u4dbf\u4e00-\u9fff]/.test(head)) notes.push(`kana-tier: headword "${head}" kept as-is, reading "${read}"`);
  }
  const word = idx.byId.get(winId);
  const altForms = [];
  for (const f of nr.forms) {
    if (f === head) continue;
    const ok = word.kanji.some((k) => k.text === f);
    if (ok) altForms.push(f); else notes.push(`dropped form "${f}" (not part of JMdict entry ${winId})`);
  }
  const altReadings = [];
  for (const r of nr.readings) {
    if (r === read) continue;
    const ok = word.kana.some((k) => kata2hira(k.text) === r);
    if (ok) altReadings.push(r); else notes.push(`dropped reading "${r}" (not part of JMdict entry ${winId})`);
  }
  return { head, read, altForms, altReadings, notes };
}

function main() {
  const args = parseArgs(process.argv);
  const manifest = JSON.parse(fs.readFileSync(path.join(args.root, 'data/seed/manifest.json'), 'utf8'));
  const csvPath = args.csv || path.join(args.root, 'data/seed/n3-public-list.csv');
  const jmdictPath = args.jmdict || path.join(args.root, manifest.jmdict.json_file);
  const listSrc = args.listSrc || manifest.n3_list.repo;

  if (!fs.existsSync(jmdictPath)) {
    console.error(`missing ${jmdictPath}\nrun: node tools/fetch-jmdict.js --tag ${manifest.jmdict.tag}`);
    process.exit(1);
  }

  console.log('loading JMdict ...');
  const { words, meta } = loadJmdict(jmdictPath);
  console.log(`  ${words.length} words, version ${meta.version} (${meta.dictDate})`);
  console.log('indexing ...');
  const idx = buildIndex(words);

  console.log('loading CSV ...');
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  console.log(`  ${rows.length} rows`);

  const store = loadStore(args.root);
  const byJmdictSeq = new Map();
  for (const [id, item] of store.layers.lexicon) if (item.rec.jmdict && item.rec.jmdict.seq != null) byJmdictSeq.set(item.rec.jmdict.seq, id);

  const tierCount = {};
  const unresolved = [];
  const toCreate = []; // { content } content has no id/prov yet
  const seenThisRun = new Set(); // jmdict word id -> w-id, catches dup rows within this CSV

  for (const raw of rows) {
    const nr = normalizeRow(raw);
    if (!nr.forms.length || !nr.readings.length) { unresolved.push({ raw, reason: 'empty expression/reading after cleanup' }); continue; }
    const m = matchRow(nr, idx);
    tierCount[m.status] = (tierCount[m.status] || 0) + 1;
    if (m.status === 'none' || m.status === 'ambiguous') {
      unresolved.push({ raw, reason: m.status, candidates: m.candidates || [] });
      continue;
    }
    const seq = parseInt(m.id, 10);
    const listTag = { src: listSrc, level: args.level, ref: nr.guid || undefined, gloss: nr.meaning || undefined };

    if (byJmdictSeq.has(seq)) {
      const wid = byJmdictSeq.get(seq);
      const item = store.layers.lexicon.get(wid);
      const has = item.rec.lists.some((l) => l.src === listTag.src && l.level === listTag.level);
      if (!has) {
        item.rec.lists.push(listTag);
        item.rec.prov = { ...item.rec.prov, made: { ...item.rec.prov.made, hash: contentHash(item.rec) } };
      }
      continue;
    }
    if (seenThisRun.has(seq)) {
      const found = toCreate.find((c) => c.content.jmdict.seq === seq);
      if (found && !found.content.lists.some((l) => l.src === listTag.src && l.level === listTag.level)) found.content.lists.push(listTag);
      continue;
    }

    const { head, read, altForms, altReadings, notes } = pickHeadwordReading(nr, idx, m.id);
    if (notes.length) unresolved.push({ raw, reason: 'partial-merge-notes', notes, resolvedTo: seq });
    const content = entryFromWord(idx.byId.get(m.id), {
      headword: head, reading: read, altForms, altReadings, list: listTag, jmdictMatch: m.status,
    });
    toCreate.push({ content, seq });
    seenThisRun.add(seq);
  }

  console.log('\nmatch tiers:', tierCount);
  console.log(`resolved: ${toCreate.length} new entries, ${byJmdictSeq.size ? '(merged into existing where already present)' : ''}`);
  console.log(`unresolved: ${unresolved.filter((u) => u.reason === 'none' || u.reason === 'ambiguous' || u.reason.includes('empty')).length} row(s) need manual disposition`);

  if (args.dryRun) { console.log('\n--dry-run: no files written'); return; }

  const ids = reserve(store, 'w', toCreate.length);
  toCreate.forEach(({ content }, i) => {
    const id = fmtId('w', ids[i]);
    const withId = { id, ...content };
    const basis = basisHash(withId);
    const hash = contentHash(withId);
    const rec = { ...withId, prov: { made: { by: 'tool/seed-import', at: today(), hash, basis } } };
    store.layers.lexicon.set(id, { rec, raw: null, file: null, line: null });
  });
  saveLayer(store, 'lexicon');

  const reportLines = [
    '# Seed import report', '', `_Generated by \`tools/seed-import.js\` on ${today()}._`, '',
    `- CSV: \`${path.relative(args.root, csvPath)}\` (${rows.length} rows)`,
    `- JMdict: ${meta.version} (${meta.dictDate})`,
    `- Created: ${toCreate.length} new lexicon entries`,
    `- Match tiers: ${Object.entries(tierCount).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    '', '## Needs manual disposition', '',
    ...unresolved.map((u) => u.reason === 'partial-merge-notes'
      ? `- \`${u.raw.expression}\`/\`${u.raw.reading}\` → resolved to jmdict:${u.resolvedTo}, but: ${u.notes.join('; ')}`
      : `- \`${u.raw.expression}\`/\`${u.raw.reading}\` — **${u.reason}**${u.candidates && u.candidates.length ? ` (jmdict candidates: ${u.candidates.join(', ')})` : ''} — "${u.raw.meaning}"`),
    '',
  ];
  writeFileAtomic(path.join(args.root, 'data/seed/import-report.md'), reportLines.join('\n'));
  writeFileAtomic(path.join(args.root, 'data/seed/unresolved.jsonl'), unresolved.map((u) => JSON.stringify(u)).join('\n') + (unresolved.length ? '\n' : ''));

  const fresh = loadStore(args.root);
  const { errors, warnings, stats } = validateStore(fresh, { ajv: makeAjv(args.root) });
  console.log(`\nvalidate after import: ${errors.length} error(s), ${warnings.length} warning(s)`);
  console.log(`lexicon: ${stats.counts.lexicon} (checked ${stats.status.lexicon.checked}, draft ${stats.status.lexicon.draft})`);

  refreshHandoffFiles(args.root, null);
  console.log('\nwrote data/seed/import-report.md, data/seed/unresolved.jsonl, HANDOFF.md, PROGRESS.md');
}

main();
