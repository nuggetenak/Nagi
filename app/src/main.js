import { register, start } from "./router.js";
import home from "./screens/home.js";
import levelPicker from "./screens/level-picker.js";
import modePicker from "./screens/mode-picker.js";
import session from "./screens/session.js";
import summary from "./screens/summary.js";

register("/", home);
register("/levels", levelPicker);
register("/levels/:level", modePicker);
register("/levels/:level/:mode/summary", summary);
register("/levels/:level/:mode", session);

start();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Resolve explicitly against the document, not this module's own URL
    // (src/main.js) — register()'s scriptURL argument is NOT a module
    // specifier, so leaving this ambiguous risks resolving against the
    // wrong base depending on the engine. sw.js lives next to index.html.
    navigator.serviceWorker.register(new URL("sw.js", document.baseURI)).catch(() => { /* offline install still works on next successful visit */ });
  });
}
