// data.js — the ONLY module that knows the compiled bundle's shape.
// Everything else asks this module for entries; nothing else touches fetch()
// or the JSON structure directly. Swapping the data source later (a real
// backend, IndexedDB, whatever) means editing this one file.
const BUNDLE_URL = "./data/n3-core.json";
const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

let _bundle = null;

async function loadBundle() {
  if (_bundle) return _bundle;
  const res = await fetch(BUNDLE_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`could not load vocabulary data (${res.status})`);
  _bundle = await res.json();
  return _bundle;
}

/** [{level, count, sentenceCount}] for all five JLPT levels, populated or not. */
async function getLevelCatalog() {
  const bundle = await loadBundle();
  const counts = Object.fromEntries(LEVELS.map((l) => [l, { count: 0, sentenceCount: 0 }]));
  for (const entry of bundle.entries) {
    for (const list of entry.lists) {
      if (!counts[list.level]) continue;
      counts[list.level].count++;
      if (entry.sentences && entry.sentences.length) counts[list.level].sentenceCount++;
    }
  }
  return LEVELS.map((level) => ({ level, ...counts[level] }));
}

/** All entries tagged with `level`. */
async function getEntriesForLevel(level) {
  const bundle = await loadBundle();
  return bundle.entries.filter((e) => e.lists.some((l) => l.level === level));
}

async function getEntryById(id) {
  const bundle = await loadBundle();
  return bundle.entries.find((e) => e.id === id) || null;
}

/** Meaning shown to the learner for one sense: a hand-simplified gloss if one exists yet (none do today — this layer is optional, deferred), else JMdict's own English. */
function primaryMeaning(sense) {
  if (sense.id && sense.id.length) return sense.id[0];
  return sense.en[0];
}

export { getLevelCatalog, getEntriesForLevel, getEntryById, primaryMeaning, LEVELS };
