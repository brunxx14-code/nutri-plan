/* Service worker de NutriPlan: guarda la app para que abra sin conexión.
   Primero intenta la red (así los probadores siempre ven la última versión)
   y, si no hay conexión, sirve la copia guardada. */

const CACHE = "nutriplan-v22";
const REMINDER_CACHE = "nutriplan-reminders"; // los avisos que guarda la app (js/reminders.js)
const APP_SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "js/analytics.js",
  "js/photos.js",
  "js/data.js",
  "js/nutrition.js",
  "js/planner.js",
  "js/i18n.js",
  "js/i18n-en.js",
  "js/app.js",
  "js/engage.js",
  "js/share.js",
  "js/cook.js",
  "js/favorites.js",
  "js/calendar.js",
  "js/freeze.js",
  "js/tips.js",
  "js/reminders.js",
  "css/reminders.css",
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== REMINDER_CACHE).map((k) => caches.delete(k))))
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

  // "no-cache" obliga a preguntar al servidor si hay versión nueva en vez de
  // usar la copia del navegador (GitHub Pages la guarda hasta 10 minutos).
  event.respondWith(
    fetch(request, isOwn ? { cache: "no-cache" } : undefined)
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

// ---------- Recordatorios para cocinar ----------

/* Tocar el aviso (o su botón ▶️) abre el modo cocina de esa receta. Si la
   app ya está abierta, la trae delante y le pide que lo abra; si no, la abre
   con ?cocinar=<comida>. */
self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  if (event.action === "later" || !data.url) return;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (client) {
      await client.focus();
      client.postMessage({ type: "nutriplan-cook", slot: data.slot, day: data.day });
      return;
    }
    await self.clients.openWindow(data.url);
  })());
});

/* Chrome Android con la app instalada despierta al service worker de vez en
   cuando: si en ese rato toca una comida, avisamos aunque la app esté cerrada. */
async function showDueReminders() {
  const cache = await caches.open(REMINDER_CACHE);
  const res = await cache.match("schedule.json");
  if (!res) return;
  const { items = [] } = await res.json();
  const shownRes = await cache.match("shown.json");
  const shown = shownRes ? await shownRes.json() : {};
  const now = Date.now();
  const due = items.filter((it) => now >= it.at && now < it.at + 90 * 60000 && !shown[it.tag]);
  if (!due.length) return;
  const it = due[due.length - 1];
  due.forEach((d) => { shown[d.tag] = d.at; });
  for (const tag of Object.keys(shown)) if (shown[tag] < now - 3 * 86400000) delete shown[tag];
  await cache.put("shown.json", new Response(JSON.stringify(shown), { headers: { "Content-Type": "application/json" } }));
  await self.registration.showNotification(it.title, {
    body: it.body, tag: it.tag, icon: "icons/icon-192.png", badge: "icons/favicon-32.png",
    vibrate: [200, 100, 200],
    data: { url: it.url, slot: it.slot, day: it.day },
    actions: [{ action: "cook", title: it.cookLabel }, { action: "later", title: it.laterLabel }],
  });
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "nutriplan-reminders") event.waitUntil(showDueReminders().catch(() => {}));
});
