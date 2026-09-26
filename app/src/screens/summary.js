import { el, mount, setTopbar } from "../ui.js";
import { navigate } from "../router.js";

async function render({ level, mode }) {
  setTopbar({ back: () => navigate(`/levels/${level}`) });
  let result = { correct: 0, total: 0 };
  try { result = JSON.parse(sessionStorage.getItem("nagi:lastResult")) || result; } catch { /* use default */ }

  mount(
    el("div", { class: "summary" }, [
      el("p", { class: "hero__tagline" }, "Session done"),
      el("div", { class: "summary__score" }, `${result.correct}/${result.total}`),
      el("div", { class: "summary__row" }, [
        el("a", { class: "btn btn--quiet", href: `#/levels/${level}`, onClick: (e) => { e.preventDefault(); navigate(`/levels/${level}`); } }, "Other drills"),
        el("a", { class: "btn btn--primary", href: `#/levels/${level}/${mode}`, onClick: (e) => { e.preventDefault(); navigate(`/levels/${level}/${mode}`); } }, "Study again"),
      ]),
    ])
  );
}

export default render;
