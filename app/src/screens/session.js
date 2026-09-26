import { el, mount, setTopbar, renderRuby } from "../ui.js";
import { navigate } from "../router.js";
import { getEntriesForLevel } from "../data.js";
import { getAllProgress, setProgress } from "../state.js";
import { buildQueue, grade } from "../srs.js";
import { byId } from "../drills/registry.js";

const SESSION_SIZE = 20;

async function render({ level, mode }) {
  const drill = byId(mode);
  if (!drill) return navigate(`/levels/${level}`);

  const allEntries = await getEntriesForLevel(level);
  const pool = drill.eligible(allEntries);
  const progress = getAllProgress(drill.id);
  const queue = buildQueue(pool, progress, drill.keyFor, SESSION_SIZE);

  if (queue.length === 0) {
    setTopbar({ back: () => navigate(`/levels/${level}`), meta: `${level} · ${drill.title}` });
    return mount(
      el("div", { class: "empty" }, [
        el("div", { class: "empty__title" }, "Nothing due right now"),
        el("p", {}, "Everything in this drill is scheduled for later. Come back after some time has passed, or explore another mode."),
        el("a", { class: "btn btn--quiet mt-4", href: `#/levels/${level}`, onClick: (e) => { e.preventDefault(); navigate(`/levels/${level}`); } }, "Back to modes"),
      ])
    );
  }

  const session = { index: 0, correct: 0, total: queue.length };

  function finish() {
    navigate(`/levels/${level}/${mode}/summary`);
    sessionStorage.setItem("nagi:lastResult", JSON.stringify({ correct: session.correct, total: session.total, level, mode }));
  }

  function onAnswer(entry, isCorrect) {
    const key = drill.keyFor(entry); // == entry.id for every drill; mode namespace disambiguates the rest
    const rec = grade(progress.get(key), isCorrect);
    progress.set(key, rec);
    setProgress(drill.id, entry.id, null, rec);
    if (isCorrect) session.correct++;
    session.index++;
    if (session.index >= queue.length) finish();
    else renderCurrent();
  }

  function progressBar() {
    const pct = Math.round((session.index / session.total) * 100);
    return el("div", { class: "progress-track" }, [el("div", { class: "progress-track__fill", style: `width:${pct}%` })]);
  }

  function renderChoiceCard(item, prompt) {
    let answered = false;
    let wasCorrect = false;
    const buttonByChoice = new Map();
    const choiceButtons = item.choices.map((choice) => {
      const btn = el(
        "button",
        {
          class: "choice",
          onClick: () => {
            if (answered) return;
            answered = true;
            wasCorrect = choice.correct;
            for (const c of item.choices) {
              const b = buttonByChoice.get(c);
              b.setAttribute("disabled", "");
              if (c.correct) b.dataset.state = "correct";
              else if (c === choice) b.dataset.state = "incorrect";
            }
            nextBtn.style.visibility = "visible";
          },
        },
        choice.text
      );
      buttonByChoice.set(choice, btn);
      return btn;
    });
    const nextBtn = el("button", { class: "btn btn--primary btn--block mt-4", style: "visibility:hidden", onClick: () => onAnswer(item.entry, wasCorrect) }, "Next");
    return el("div", {}, [
      el("div", { class: "card" }, [prompt, el("div", { class: "choice-grid" }, choiceButtons)]),
      nextBtn,
    ]);
  }

  function renderRecallCard(item) {
    let revealed = false;
    const reveal = el("div", { class: "card__answer-reveal center", style: "display:none" }, [
      el("div", { class: "card__jp jp" }, item.revealJp),
      item.revealReading ? el("div", { class: "card__reading jp" }, item.revealReading) : null,
      item.revealMeaning ? el("div", { class: "card__meaning", style: "font-size:1rem;color:var(--ink-soft);margin-top:6px" }, item.revealMeaning) : null,
    ]);
    const showBtn = el("button", { class: "btn btn--quiet mt-4", onClick: () => { revealed = true; reveal.style.display = "flex"; showBtn.style.display = "none"; grades.style.display = "flex"; } }, "Show answer");
    const grades = el("div", { class: "grade-row", style: "display:none" }, [
      el("button", { class: "btn btn--bad", onClick: () => onAnswer(item.entry, false) }, "Didn't know it"),
      el("button", { class: "btn btn--good", onClick: () => onAnswer(item.entry, true) }, "Knew it"),
    ]);
    return el("div", { class: "card" }, [
      el("div", { class: "card__prompt-label" }, item.promptLabel),
      el("div", { class: item.promptIsJp ? "card__jp jp" : "card__meaning" }, item.promptText),
      reveal,
      showBtn,
      grades,
    ]);
  }

  function renderCurrent() {
    setTopbar({ back: () => navigate(`/levels/${level}`), meta: `${level} · ${session.index + 1}/${session.total}` });
    const entry = queue[session.index];
    if (drill.kind === "choice") {
      const item = drill.buildItem(entry, pool);
      const prompt =
        drill.id === "cloze"
          ? el("div", { class: "card__sentence jp", html: renderRuby(item.ja, { blank: "hide" }) })
          : el("div", {}, [el("div", { class: "card__jp jp" }, item.promptJp), el("div", { class: "card__reading jp" }, item.promptReading)]);
      mount(el("div", {}, [progressBar(), renderChoiceCard(item, prompt)]));
    } else {
      const item = drill.buildItem(entry);
      mount(el("div", {}, [progressBar(), renderRecallCard(item)]));
    }
  }

  renderCurrent();
}

export default render;
