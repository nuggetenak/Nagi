'use strict';
const fs = require('fs');
const path = require('path');
const { canonLine, sha256 } = require('./canon');

const SHARD_SIZE = 200;
const LAYERS = {
  lexicon: { dir: 'data/lexicon', prefix: 'w' },
  'gloss-id': { dir: 'data/gloss-id', prefix: 'w' },
  sentences: { dir: 'data/sentences', prefix: 'x' },
};
const ID_RE = /^([a-z])-(\d{6})$/;

const today = () => new Date().toISOString().slice(0, 10);
const idNum = (id) => { const m = ID_RE.exec(id); return m ? parseInt(m[2], 10) : NaN; };
const fmtId = (prefix, n) => `${prefix}-${String(n).padStart(6, '0')}`;
const fmtPacketId = (n) => `P-${String(n).padStart(4, '0')}`;

function shardFile(layer, id) {
  const n = idNum(id);
  if (Number.isNaN(n)) throw new Error(`cannot shard invalid id: ${id}`);
  return path.join(LAYERS[layer].dir, String(Math.floor((n - 1) / SHARD_SIZE) + 1).padStart(4, '0') + '.jsonl');
}

function readJsonl(abs) {
  const out = [];
  fs.readFileSync(abs, 'utf8').split('\n').forEach((raw, i) => {
    if (raw.trim() === '') return;
    try { out.push({ rec: JSON.parse(raw), raw, line: i + 1 }); }
    catch (e) { out.push({ error: e.message, raw, line: i + 1 }); }
  });
  return out;
}

function writeFileAtomic(abs, text) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = abs + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, abs);
}

function loadStore(root) {
  const store = { root, layers: {}, parseErrors: [], dups: [], redirects: [] };
  for (const [layer, cfg] of Object.entries(LAYERS)) {
    const map = new Map();
    const dir = path.join(root, cfg.dir);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort() : [];
    for (const f of files) {
      const rel = path.join(cfg.dir, f);
      for (const item of readJsonl(path.join(root, rel))) {
        if (item.error) { store.parseErrors.push({ file: rel, line: item.line, message: item.error }); continue; }
        const id = item.rec && item.rec.id;
        if (typeof id !== 'string') { store.parseErrors.push({ file: rel, line: item.line, message: 'record has no string id' }); continue; }
        if (map.has(id)) { store.dups.push({ layer, id, file: rel, line: item.line }); continue; }
        map.set(id, { rec: item.rec, raw: item.raw, file: rel, line: item.line });
      }
    }
    store.layers[layer] = map;
  }
  const red = path.join(root, 'data/redirects.jsonl');
  if (fs.existsSync(red)) store.redirects = readJsonl(red).filter((x) => x.rec).map((x) => x.rec);
  return store;
}

/** Rewrite one layer canonically (sorted, sharded). Removes shard files that became empty. */
function saveLayer(store, layer) {
  const byFile = new Map();
  for (const [id, item] of store.layers[layer]) {
    const f = shardFile(layer, id);
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(item.rec);
  }
  const dir = path.join(store.root, LAYERS[layer].dir);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    const rel = path.join(LAYERS[layer].dir, f);
    if (!byFile.has(rel)) fs.unlinkSync(path.join(store.root, rel));
  }
  for (const [rel, recs] of byFile) {
    recs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    writeFileAtomic(path.join(store.root, rel), recs.map(canonLine).join('\n') + '\n');
  }
}

// ---- counters: ids are RESERVED by tools (serialised), never invented by agents ----
const countersPath = (root) => path.join(root, 'data/counters.json');
function readCounters(root) {
  const p = countersPath(root);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { w: 0, x: 0, p: 0 };
}
function maxLiveNumber(store, prefix) {
  let max = 0;
  for (const [layer, cfg] of Object.entries(LAYERS)) {
    if (cfg.prefix !== prefix) continue;
    for (const id of store.layers[layer].keys()) max = Math.max(max, idNum(id) || 0);
  }
  for (const r of store.redirects) if (r.id && r.id[0] === prefix) max = Math.max(max, idNum(r.id) || 0);
  return max;
}
/** Reserve `count` numbers for kind w|x|p. Persists immediately. Never reuses a number. */
function reserve(store, kind, count) {
  const c = readCounters(store.root);
  const floor = kind === 'p' ? c.p || 0 : Math.max(c[kind] || 0, maxLiveNumber(store, kind));
  const nums = Array.from({ length: count }, (_, i) => floor + 1 + i);
  c[kind] = floor + count;
  writeFileAtomic(countersPath(store.root), JSON.stringify(c, null, 2) + '\n');
  return nums;
}

// ---- audit: append-only ledger + issue events ----
function appendJsonl(root, rel, obj) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.appendFileSync(abs, JSON.stringify(obj) + '\n');
}
const appendLedger = (root, obj) => appendJsonl(root, 'audit/packets.jsonl', obj);
const appendIssue = (root, obj) => appendJsonl(root, 'audit/issues.jsonl', obj);
function readJsonlIfExists(root, rel) {
  const abs = path.join(root, rel);
  return fs.existsSync(abs) ? readJsonl(abs).filter((x) => x.rec).map((x) => x.rec) : [];
}
const readLedger = (root) => readJsonlIfExists(root, 'audit/packets.jsonl');
/** Replay open/close events -> Map("layer:id" -> last open event). */
function openIssues(root) {
  const open = new Map();
  for (const ev of readJsonlIfExists(root, 'audit/issues.jsonl')) {
    const key = `${ev.layer}:${ev.id}`;
    if (ev.event === 'open') open.set(key, ev);
    else if (ev.event === 'close') open.delete(key);
  }
  return open;
}

module.exports = {
  SHARD_SIZE, LAYERS, ID_RE, today, idNum, fmtId, fmtPacketId, shardFile, readJsonl, writeFileAtomic,
  loadStore, saveLayer, readCounters, reserve, appendLedger, appendIssue, readLedger, openIssues, sha256,
};
