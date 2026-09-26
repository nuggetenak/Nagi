// router.js — routes are registered as `path/segments/:param` patterns.
// The hash IS the navigation state (level, mode, screen) on purpose: back
// button and reload both do the right thing for free, and no other module
// needs to track "where are we" separately.
const routes = [];

function register(pattern, render) {
  const keys = [];
  const regex = new RegExp(
    "^" + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return "([^/]+)"; }) + "$"
  );
  routes.push({ regex, keys, render });
}

async function dispatch() {
  const path = location.hash.slice(1) || "/";
  for (const route of routes) {
    const m = route.regex.exec(path);
    if (m) {
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return route.render(params);
    }
  }
  location.hash = "#/";
}

function start() {
  window.addEventListener("hashchange", dispatch);
  dispatch();
}

function navigate(path) {
  location.hash = "#" + path;
}

export { register, start, navigate };
