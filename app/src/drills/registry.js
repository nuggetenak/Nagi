// registry.js — the single list every screen reads to know what modes
// exist. Adding a future drill (e.g. an antonym/confusable-pairs mode, once
// that data lands) means adding one entry here — home, mode-picker, and
// session.js all stay unchanged because they only ever iterate this list.
import recognition from "./recognition.js";
import { meaningToWord, wordToReading } from "./recall.js";
import cloze from "./cloze.js";

const DRILLS = [recognition, meaningToWord, wordToReading, cloze];

const byId = (id) => DRILLS.find((d) => d.id === id) || null;

export { DRILLS, byId };
