// smoke.mjs — jsdom (30.x) doesn't execute <script type="module"> tags (a
// known, documented gap — see HTMLScriptElement-impl.js's own TODO), so
// this drives the app a different way: jsdom supplies a real `document`/
// `window`/`location`, and Node's OWN native ESM loader imports the actual
// source files directly (the same files the browser will run, completely
// unmodified) against those globals. One process, no server, no bundler,
// no jsdom module-script gap in the way.
import pkg from "jsdom";
const { JSDOM } = pkg;
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ok  - ${msg}`); else { console.log(`  FAIL - ${msg}`); failures++; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

/** Fresh app instance: new jsdom document + fresh globals + a fresh import of every module
 *  (via a cache-busting query string, since Node's ESM cache is otherwise permanent per URL). */
async function boot({ hash = "" } = {}) {
  const html = readFileSync(path.join(APP_DIR, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: `https://nagi.local/${hash}`, pretendToBeVisual: true });

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  // Node has its own built-in, read-only `navigator` (no serviceWorker on
  // it) — leave it as-is rather than fight the getter; main.js's
  // `"serviceWorker" in navigator` check correctly evaluates false either way.
  globalThis.sessionStorage = makeLocalStorage();

  globalThis.fetch = async (url) => {
    const rel = decodeURIComponent(new URL(url, "https://nagi.local/app/").pathname).replace(/^\/app\//, "");
    const file = path.join(APP_DIR, rel);
    try {
      const body = readFileSync(file, "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    } catch {
      return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
    }
  };

  const bust = `?t=${Date.now()}_${Math.random()}`;
  await import(path.join(APP_DIR, "src/main.js") + bust);
  await sleep(300);
  return dom;
}
globalThis.localStorage = makeLocalStorage(); // persists across boot() calls in this file, like a real browser session

const $ = (dom, sel) => dom.window.document.querySelector(sel);
const $$ = (dom, sel) => [...dom.window.document.querySelectorAll(sel)];
const click = (node) => node.dispatchEvent(new dom_Event("click", { bubbles: true }));
let dom_Event; // set per-boot from that dom's own window, so events are recognized by that document

async function main() {
  console.log("smoke test (real modules via Node ESM, DOM via jsdom, no server)");

  let dom = await boot();
  dom_Event = dom.window.Event;
  ok(dom.window.document.getElementById("screen").textContent.includes("nagi"), "home renders wordmark/tagline");
  ok(/\d/.test(($(dom, ".stat__n") || {}).textContent || ""), "home shows a word count stat");

  click($(dom, 'a[href="#/levels"]'));
  await sleep(200);
  const tiles = $$(dom, ".level-tile");
  ok(tiles.length === 5, `level picker shows 5 tiles (got ${tiles.length})`);
  const n3 = tiles.find((t) => t.textContent.includes("N3"));
  ok(n3 && !n3.hasAttribute("disabled"), "N3 tile is enabled");
  const others = tiles.filter((t) => t !== n3);
  ok(others.every((t) => t.hasAttribute("disabled")), "N4/N5/N2/N1 tiles are disabled (no data yet)");

  click(n3);
  await sleep(200);
  const modeCards = $$(dom, ".mode-card");
  ok(modeCards.length === 4, `mode picker shows 4 drills (got ${modeCards.length})`);
  const clozeCard = modeCards.find((c) => c.textContent.includes("Cloze"));
  ok(clozeCard && clozeCard.hasAttribute("disabled"), "Cloze is disabled with 0 sentences in the data");
  const recogCard = modeCards.find((c) => c.textContent.includes("Word → meaning"));
  ok(recogCard && !recogCard.hasAttribute("disabled"), "Word → meaning is enabled");
  const m2wCard = modeCards.find((c) => c.textContent.includes("Meaning → word"));
  const w2rCard = modeCards.find((c) => c.textContent.includes("Word → reading"));
  ok(m2wCard && !m2wCard.hasAttribute("disabled"), "Meaning → word is enabled");
  ok(w2rCard && !w2rCard.hasAttribute("disabled"), "Word → reading is enabled");

  click(recogCard);
  await sleep(200);
  ok($(dom, ".card__jp") !== null, "session shows a Japanese prompt");
  ok($$(dom, ".choice").length === 4, "recognition shows 4 choices");

  for (let i = 0; i < 3; i++) {
    const choices = $$(dom, ".choice");
    click(choices[0]);
    await sleep(60);
    const next = $$(dom, "main button").find((b) => b.textContent === "Next");
    ok(next && next.style.visibility !== "hidden", `item ${i + 1}: Next button appears after answering`);
    ok($$(dom, ".choice[disabled]").length === 4, `item ${i + 1}: all choices disabled after answering`);
    click(next);
    await sleep(100);
  }
  ok($(dom, ".progress-track__fill").style.width !== "0%", "progress bar advanced");

  click($(dom, ".topbar__back"));
  await sleep(150);
  const recallCard = $$(dom, ".mode-card").find((c) => c.textContent.includes("Meaning → word"));
  click(recallCard);
  await sleep(150);
  ok($(dom, ".card__prompt-label") !== null, "recall session shows a prompt label");
  const showBtn = $$(dom, "main button").find((b) => b.textContent === "Show answer");
  ok(!!showBtn, "Show answer button present");
  click(showBtn);
  await sleep(80);
  ok($(dom, ".card__jp").textContent.length > 0, "reveal shows the Japanese word");
  const knewIt = $$(dom, "main button").find((b) => b.textContent === "Knew it");
  ok(!!knewIt, "grade buttons appear after reveal");
  click(knewIt);
  await sleep(120);
  ok($(dom, ".card__prompt-label") !== null || $(dom, ".empty__title") !== null, "advanced after grading (or queue ended — both valid)");

  const savedKeys = [];
  for (let i = 0; i < globalThis.localStorage.length; i++) savedKeys.push(globalThis.localStorage.key(i));
  ok(savedKeys.some((k) => k.startsWith("nagi:progress:meaning-to-word:")), `SRS progress persisted to localStorage (keys: ${savedKeys.join(", ") || "none"})`);

  dom = await boot({ hash: "#/levels/N3/recognition" });
  dom_Event = dom.window.Event;
  await sleep(300);
  let rounds = 0;
  while (rounds++ < 25) {
    const choices = $$(dom, ".choice");
    if (choices.length === 0) break;
    click(choices[rounds % choices.length]);
    await sleep(20);
    const next = $$(dom, "main button").find((b) => b.textContent === "Next");
    if (!next) break;
    click(next);
    await sleep(30);
  }
  await sleep(200);
  const score = ($(dom, ".summary__score") || {}).textContent || "";
  ok(/^\d+\/\d+$/.test(score), `summary shows X/Y score after a full session (got "${score}")`);

  console.log(failures === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${failures} SMOKE TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("smoke test crashed:", e); process.exit(1); });
