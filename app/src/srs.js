// srs.js — deliberately NOT full FSRS. A plain Leitner-style box ladder: pure
// functions, no dependency, easy to read top to bottom. If this app ever
// wants real FSRS (nagi's other sibling project already uses ts-fsrs), this
// is the one file that gets replaced — nothing else knows how scheduling works.
const BOX_INTERVAL_MS = [
  0, // box 0: due immediately (new or just-missed)
  10 * 60_000, // box 1: 10 min
  8 * 60 * 60_000, // box 2: 8 hours
  1 * 86_400_000, // box 3: 1 day
  3 * 86_400_000, // box 4: 3 days
  7 * 86_400_000, // box 5: 7 days
  21 * 86_400_000, // box 6: 21 days
];
const MAX_BOX = BOX_INTERVAL_MS.length - 1;

function freshRecord() {
  return { box: 0, due: 0, seen: 0, correct: 0 };
}

/** Next record after a grade. `correct` is a boolean (recall self-grade or multiple-choice result). */
function grade(record, correct, now = Date.now()) {
  const r = record ? { ...record } : freshRecord();
  r.seen += 1;
  r.correct += correct ? 1 : 0;
  r.box = correct ? Math.min(r.box + 1, MAX_BOX) : 0;
  r.due = now + BOX_INTERVAL_MS[r.box];
  return r;
}

/**
 * Build a session queue: due items first (oldest-due first), then new items
 * (no record yet), capped at `limit`. `items` is any array; `keyOf` extracts
 * the progress lookup key for each.
 */
function buildQueue(items, progressByKey, keyOf, limit, now = Date.now()) {
  const due = [];
  const fresh = [];
  for (const item of items) {
    const rec = progressByKey.get(keyOf(item));
    if (!rec) fresh.push(item);
    else if (rec.due <= now) due.push({ item, due: rec.due });
  }
  due.sort((a, b) => a.due - b.due);
  const queue = due.map((d) => d.item);
  for (const item of fresh) {
    if (queue.length >= limit) break;
    queue.push(item);
  }
  return queue.slice(0, limit);
}

export { freshRecord, grade, buildQueue, MAX_BOX };
