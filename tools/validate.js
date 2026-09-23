#!/usr/bin/env node
'use strict';
// Hard gate. Exit 1 on any error. Usage: node tools/validate.js [--root DIR] [--all] [--json] [--strict]
const path = require('path');
const { loadStore } = require('./lib/store');
const { makeAjv } = require('./lib/schemas');
const { validateStore } = require('./lib/validate-core');

function parseArgs(argv) {
  const a = { root: path.resolve(__dirname, '..'), all: false, json: false, strict: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') a.root = path.resolve(argv[++i]);
    else if (argv[i] === '--all') a.all = true;
    else if (argv[i] === '--json') a.json = true;
    else if (argv[i] === '--strict') a.strict = true;
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv);
  const store = loadStore(args.root);
  const { errors, warnings, stats } = validateStore(store, { ajv: makeAjv(args.root) });

  if (args.json) {
    console.log(JSON.stringify({ errors, warnings, stats }, null, 2));
  } else {
    console.log('nugget-vocab-core: validate');
    for (const [layer, n] of Object.entries(stats.counts)) {
      const s = stats.status[layer];
      console.log(`  ${layer.padEnd(9)} ${String(n).padStart(6)} records   draft ${s.draft} | checked ${s.checked} | verified ${s.verified}`);
    }
    const c = stats.coverage;
    console.log(`  coverage  gloss ${c.withGloss}/${c.entries} entries | sentences ${c.sentences} (${c.withSentence}/${c.entries} entries)`);
    console.log(`  jmdict join: ${Object.entries(stats.match).map(([k, v]) => `${k} ${v}`).join(' | ') || 'n/a'}   open issues: ${stats.openIssues}`);
    const show = (list, limit) => {
      const perCode = {};
      for (const x of list) {
        perCode[x.code] = (perCode[x.code] || 0) + 1;
        if (args.all || perCode[x.code] <= limit) {
          const where = x.file ? ` ${x.file}${x.line ? ':' + x.line : ''}` : '';
          console.log(`  [${x.code}] ${x.id || ''}${where} ${x.msg}`);
        }
      }
      for (const [code, n] of Object.entries(perCode)) if (!args.all && n > limit) console.log(`  ... [${code}] +${n - limit} more (use --all)`);
    };
    console.log(`\nerrors: ${errors.length}   warnings: ${warnings.length}`);
    show(errors, 25);
    show(warnings, 5);
  }
  process.exit(errors.length || (args.strict && warnings.length) ? 1 : 0);
}

main();
