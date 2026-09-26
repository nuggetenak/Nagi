// recall.js — ONE engine for two directions. Both are "try to produce it,
// then reveal and grade yourself" — typed-answer checking is a trap (IME
// availability varies wildly across the devices this needs to run on), so
// self-grading is the honest, device-agnostic choice for production drills.
import { primaryMeaning } from "../data.js";

const eligible = (entries) => entries.filter((e) => e.senses.length > 0);

/** direction: "meaning-to-word" shows the meaning, reveals headword+reading.
 *  direction: "word-to-reading" shows the headword, reveals the reading. */
function makeDirection(direction) {
  const id = direction === "meaning-to-word" ? "meaning-to-word" : "word-to-reading";
  // Progress is namespaced by mode already (state.js keys on `drill.id`), so
  // the key here only needs to identify the entry — no need to repeat the
  // direction inside it too.
  const keyFor = (entry) => entry.id;

  function buildItem(entry) {
    if (direction === "meaning-to-word") {
      return {
        entry,
        promptLabel: "What word means this?",
        promptText: primaryMeaning(entry.senses[0]),
        promptIsJp: false,
        revealJp: entry.headword,
        revealReading: entry.reading,
      };
    }
    return {
      entry,
      promptLabel: "What's the reading?",
      promptText: entry.headword,
      promptIsJp: true,
      revealJp: entry.reading,
      revealReading: null,
      revealMeaning: primaryMeaning(entry.senses[0]),
    };
  }

  return {
    id,
    kind: "recall",
    title: direction === "meaning-to-word" ? "Meaning → word" : "Word → reading",
    desc: direction === "meaning-to-word" ? "Recall the word for a meaning, then check yourself" : "Recall a kanji word's reading, then check yourself",
    eligible,
    keyFor,
    buildItem,
  };
}

export const meaningToWord = makeDirection("meaning-to-word");
export const wordToReading = makeDirection("word-to-reading");
