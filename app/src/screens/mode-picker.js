import { el, mount, setTopbar } from "../ui.js";
import { navigate } from "../router.js";
import { getEntriesForLevel } from "../data.js";
import { getAllProgress } from "../state.js";
import { DRILLS } from "../drills/registry.js";

async function render({ level }) {
  setTopbar({ back: () => navigate("/levels"), meta: level });
  const entries = await getEntriesForLevel(level);

  mount(
    el("div", {}, [
      el("h2", {}, `${level} — pick a drill`),
      el(
        "div",
        { class: "mode-list mt-4" },
        DRILLS.map((drill) => {
          const pool = drill.eligible(entries);
          const progress = getAllProgress(drill.id);
          const now = Date.now();
          let due = 0;
          for (const entry of pool) {
            const rec = progress.get(drill.keyFor(entry));
            if (rec && rec.due <= now) due++;
          }
          const ready = pool.length > 0;
          return el(
            "button",
            { class: "mode-card", disabled: !ready, onClick: ready ? () => navigate(`/levels/${level}/${drill.id}`) : null },
            [
              el("div", {}, [
                el("div", { class: "mode-card__title" }, drill.title),
                el("div", { class: "mode-card__desc" }, ready ? drill.desc : "Needs example sentences — not written yet for this level"),
              ]),
              ready ? el("div", { class: "mode-card__due" }, due > 0 ? `${due} due` : `${pool.length} ready`) : null,
            ]
          );
        })
      ),
    ])
  );
}

export default render;
