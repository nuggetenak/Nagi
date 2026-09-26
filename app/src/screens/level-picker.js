import { el, mount, setTopbar } from "../ui.js";
import { navigate } from "../router.js";
import { getLevelCatalog } from "../data.js";

async function render() {
  setTopbar({ back: () => navigate("/") });
  const catalog = await getLevelCatalog();

  mount(
    el("div", {}, [
      el("h2", {}, "Pick a level"),
      el("p", { class: "hero__tagline", style: "margin-top:4px" }, "N3 first, then N4/N2/N5/N1 as their word lists get built."),
      el(
        "div",
        { class: "level-grid mt-4" },
        catalog.map((l) =>
          el(
            "button",
            {
              class: "level-tile",
              disabled: l.count === 0,
              onClick: l.count > 0 ? () => navigate(`/levels/${l.level}`) : null,
            },
            [
              el("span", { class: "level-tile__code" }, l.level),
              el("span", { class: "level-tile__count" }, l.count > 0 ? `${l.count} words` : "in progress"),
            ]
          )
        )
      ),
    ])
  );
}

export default render;
