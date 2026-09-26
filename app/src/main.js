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
    navigator.serviceWorker.register("./sw.js").catch(() => { /* offline install still works on next successful visit */ });
  });
}
