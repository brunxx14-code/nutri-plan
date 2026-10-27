/* Service worker de NutriPlan: guarda la app para que abra sin conexión.
   Primero intenta la red (así los probadores siempre ven la última versión)
   y, si no hay conexión, sirve la copia guardada. */

const CACHE = "nutriplan-v1";
const APP_SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "js/analytics.js",
  "js/data.js",
  "js/nutrition.js",
  "js/planner.js",
  "js/app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isOwn = url.origin === self.location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!isOwn && !isFont) return; // la analítica y lo demás van directos a la red

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((cached) => cached || (request.mode === "navigate" ? caches.match("index.html") : undefined)))
  );
});
