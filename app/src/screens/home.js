import { el, mount, setTopbar } from "../ui.js";
import { navigate } from "../router.js";
import { getLevelCatalog } from "../data.js";

async function render() {
  setTopbar({});
  const catalog = await getLevelCatalog();
  const totalWords = catalog.reduce((sum, l) => sum + l.count, 0);
  const populatedLevels = catalog.filter((l) => l.count > 0).length;

  mount(
    el("div", {}, [
      el("div", { class: "hero" }, [
        el("div", { class: "hero__glyph jp" }, "凪"),
        el("h1", { class: "hero__title" }, "nagi"),
        el("p", { class: "hero__tagline" }, "A calm way through the JLPT word list."),
      ]),
      el("div", { class: "stat-row" }, [
        el("div", { class: "stat" }, [el("span", { class: "stat__n" }, String(totalWords)), el("span", { class: "stat__label" }, "words ready")]),
        el("div", { class: "stat" }, [el("span", { class: "stat__n" }, `${populatedLevels}/5`), el("span", { class: "stat__label" }, "levels started")]),
      ]),
      el("div", { class: "stack mt-4" }, [
        el("a", { class: "btn btn--primary btn--block", href: "#/levels", onClick: (e) => { e.preventDefault(); navigate("/levels"); } }, "Choose a level"),
      ]),
    ])
  );
}

export default render;
