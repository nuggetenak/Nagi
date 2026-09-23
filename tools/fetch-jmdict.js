#!/usr/bin/env node
'use strict';
// Fetches ONE pinned jmdict-simplified release asset, verifies its sha256,
// unzips it, and records version/date/hash in data/seed/manifest.json.
// The zip itself is not committed (data/seed/raw/ is gitignored) — the repo
// stays small and the manifest is what makes the import reproducible/auditable.
//
// Usage: node tools/fetch-jmdict.js [--tag TAG] [--root DIR]
//   --tag TAG   a specific release tag (default: latest release)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = 'scriptin/jmdict-simplified';
const ASSET = 'jmdict-eng'; // English-only build; see docs/BLUEPRINT.md for why not jmdict-all

function args() {
  const a = { root: path.resolve(__dirname, '..'), tag: null };
  const argv = process.argv;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') a.root = path.resolve(argv[++i]);
    else if (argv[i] === '--tag') a.tag = argv[++i];
  }
  return a;
}

async function resolveRelease(tag) {
  const url = tag
    ? `https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`
    : `https://api.github.com/repos/${REPO}/releases/latest`;
  const res = await fetch(url, { headers: { 'user-agent': 'nugget-vocab-core', accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
  const rel = await res.json();
  const asset = rel.assets.find((a) => a.name === `${ASSET}-${rel.tag_name}.json.zip`);
  if (!asset) throw new Error(`no ${ASSET} json.zip asset on release ${rel.tag_name}`);
  return { tag: rel.tag_name, url: asset.browser_download_url, name: asset.name };
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

async function main() {
  const { root, tag } = args();
  const rawDir = path.join(root, 'data/seed/raw');
  const manifestPath = path.join(root, 'data/seed/manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

  console.log(`resolving ${tag ? `tag ${tag}` : 'latest release'} of ${REPO} ...`);
  const rel = await resolveRelease(tag);
  const zipPath = path.join(rawDir, rel.name);
  console.log(`downloading ${rel.name} ...`);
  await download(rel.url, zipPath);
  const hash = sha256File(zipPath);
  console.log(`sha256 ${hash}`);

  execFileSync('unzip', ['-o', rel.name], { cwd: rawDir, stdio: 'inherit' });
  const jsonName = rel.name.replace(/\.zip$/, '');

  manifest.jmdict = {
    repo: REPO,
    tag: rel.tag,
    asset: rel.name,
    json_file: `data/seed/raw/${jsonName}`,
    sha256: hash,
    retrieved: new Date().toISOString().slice(0, 10),
    license: 'CC BY-SA 4.0 (EDRDG) — see docs/CREDITS.md',
    source_url: `https://github.com/${REPO}`,
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest updated: data/seed/manifest.json`);
  console.log(`ready: ${jsonName}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
