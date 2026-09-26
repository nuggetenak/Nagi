// state.js — the ONLY module that touches localStorage. No backend yet (that's
// deliberate, see docs); when sync/accounts arrive later, this is the one
// file that changes, not every drill module.
const PREFIX = "nagi:";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full or unavailable (private browsing) — fail quietly, app still works this session
  }
}

/** One progress record per (mode, entry[, sense]) key. `{box, due, seen, correct}`. */
function progressKey(mode, entryId, sid) {
  return `progress:${mode}:${entryId}${sid ? ":" + sid : ""}`;
}

function getProgress(mode, entryId, sid) {
  return readJSON(progressKey(mode, entryId, sid), null);
}

function setProgress(mode, entryId, sid, record) {
  writeJSON(progressKey(mode, entryId, sid), record);
}

/** All progress records for a mode, as a Map keyed by the same suffix used above. */
function getAllProgress(mode) {
  const out = new Map();
  const prefix = PREFIX + `progress:${mode}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      try { out.set(key.slice(prefix.length), JSON.parse(localStorage.getItem(key))); } catch { /* skip corrupt entry */ }
    }
  }
  return out;
}

export { getProgress, setProgress, getAllProgress, readJSON, writeJSON };
