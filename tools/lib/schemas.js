'use strict';
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const SCHEMA_FILES = ['common', 'lexicon', 'gloss-id', 'sentences', 'packet'];

/** One Ajv instance with every schema registered under https://vocab.invalid/schema/<name>.json */
function makeAjv(root) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  for (const name of SCHEMA_FILES) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(root, 'schema', `${name}.schema.json`), 'utf8')));
  }
  return ajv;
}

const validatorFor = (ajv, name) => ajv.getSchema(`https://vocab.invalid/schema/${name}.json`);
const errorTexts = (errors) => (errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`);

module.exports = { makeAjv, validatorFor, errorTexts };
