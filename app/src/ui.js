// ui.js — the entire "framework." One function to build elements, one to
// mount a screen. No virtual DOM, no diffing: each screen render just
// replaces #screen's children, which is plenty fast for this app's size and
// keeps the whole rendering model readable in one sitting.

/** el("button", {class:"btn", onClick: fn, text:"Go"}, [child, child]) */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value; // only ever used with our own ruby-markup builder, never raw user input
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") node.className = value;
    else if (key === "disabled") { if (value) node.setAttribute("disabled", ""); }
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function mount(node) {
  const screen = document.getElementById("screen");
  screen.replaceChildren(node);
  screen.classList.remove("fade-in");
  // eslint-disable-next-line no-unused-expressions
  screen.offsetWidth; // restart the animation on every screen change
  screen.classList.add("fade-in");
  screen.scrollTop = 0;
}

function setTopbar({ back = null, meta = "" } = {}) {
  const backBtn = document.getElementById("topbar-back");
  const metaEl = document.getElementById("topbar-meta");
  backBtn.style.visibility = back ? "visible" : "hidden";
  backBtn.onclick = back || null;
  metaEl.textContent = meta;
}

/** 漢字《かんじ》 markup -> <ruby>漢字<rt>かんじ</rt></ruby>, and {{x}} -> a highlighted blank/target span. */
function renderRuby(text, { blank = false } = {}) {
  const withRuby = text.replace(/([\u3400-\u4dbf\u4e00-\u9fff々〆]+)《([^《》]*)》/g, "<ruby>$1<rt>$2</rt></ruby>");
  if (!blank) return withRuby;
  return withRuby.replace(/\{\{([^{}]*)\}\}/g, (_m, inner) => `<span class="card__blank">${blank === "hide" ? "____" : inner}</span>`);
}

export { el, mount, setTopbar, renderRuby };
