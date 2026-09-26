// recognition.js — show the Japanese word, pick its meaning from 4 options.
// The simplest drill: every entry qualifies, nothing extra needed.
import { primaryMeaning } from "../data.js";

const id = "recognition";
const kind = "choice";
const title = "Word → meaning";
const desc = "See the word, pick what it means";

const eligible = (entries) => entries.filter((e) => e.senses.length > 0);
const keyFor = (entry) => entry.id;

function buildItem(entry, pool) {
  const correct = primaryMeaning(entry.senses[0]);
  const seen = new Set([correct.toLowerCase()]);
  const distractors = [];
  const shuffled = pool.filter((e) => e.id !== entry.id).sort(() => Math.random() - 0.5);
  for (const other of shuffled) {
    if (distractors.length >= 3) break;
    const text = primaryMeaning(other.senses[0]);
    const key = text.toLowerCase();
    if (seen.has(key)) continue; // never offer two options that read the same — an honestly ambiguous choice helps no one
    seen.add(key);
    distractors.push(text);
  }
  const choices = [correct, ...distractors].sort(() => Math.random() - 0.5);
  return {
    entry,
    promptJp: entry.headword,
    promptReading: entry.reading,
    choices: choices.map((text) => ({ text, correct: text === correct })),
  };
}

export default { id, kind, title, desc, eligible, keyFor, buildItem };
