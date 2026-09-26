// sw.js — offline-first, deliberately simple: cache the shell + data on
// install, serve cache-first, refresh the cache in the background on every
// fetch so the next launch picks up updates without ever blocking this one.
// Bump CACHE_NAME (build.js can do this later) to force a clean cache.
const CACHE_NAME = "nagi-v2";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./src/main.js",
  "./src/router.js",
  "./src/ui.js",
  "./src/data.js",
  "./src/state.js",
  "./src/srs.js",
  "./src/drills/registry.js",
  "./src/drills/recognition.js",
  "./src/drills/recall.js",
  "./src/drills/cloze.js",
  "./src/screens/home.js",
  "./src/screens/level-picker.js",
  "./src/screens/mode-picker.js",
  "./src/screens/session.js",
  "./src/screens/summary.js",
  "./data/n3-core.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
          return res;
        })
        .catch(() => cached); // offline and not cached: nothing more we can do
      return cached || network;
    })
  );
});
