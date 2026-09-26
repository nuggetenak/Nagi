// cloze.js — fill in the blank, multiple choice. Only as available as the
// sentence data is: eligible() is the single source of truth both the mode
// picker and the session screen use to decide whether this drill can run at
// all right now. No sentences yet -> this mode reports 0 and disables itself,
// nothing else has to special-case "empty."
const id = "cloze";
const kind = "choice";
const title = "Cloze";
const desc = "Fill the blank in a sentence";

const eligible = (entries) => entries.filter((e) => e.sentences && e.sentences.length > 0);
// Progress is tracked per ENTRY, not per specific sentence — we're asking
// "does the learner know this word in context," and which of its sentences
// gets drawn this time is an implementation detail, not a separate fact to
// schedule. Keeps this the same shape as recognition/recall's keyFor.
const keyFor = (entry) => entry.id;

function buildItem(entry, pool) {
  const sentence = entry.sentences[Math.floor(Math.random() * entry.sentences.length)];
  const correct = sentence.target;
  const seen = new Set([correct]);
  const distractors = [];
  const shuffled = pool.filter((e) => e.id !== entry.id).sort(() => Math.random() - 0.5);
  for (const other of shuffled) {
    if (distractors.length >= 3) break;
    if (seen.has(other.headword)) continue;
    seen.add(other.headword);
    distractors.push(other.headword);
  }
  const choices = [correct, ...distractors].sort(() => Math.random() - 0.5);
  return {
    entry,
    sentence,
    ja: sentence.ja,
    translation: sentence.tr && (sentence.tr.en || sentence.tr.id),
    choices: choices.map((text) => ({ text, correct: text === correct })),
  };
}

export default { id, kind, title, desc, eligible, keyFor, buildItem };
