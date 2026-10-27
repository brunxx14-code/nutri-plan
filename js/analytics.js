/* Medición de uso anónima para la prueba con usuarios.

   Usa GoatCounter (gratis, sin cookies y sin datos personales). Cada acción
   se envía como un "evento" con un nombre corto, por ejemplo "abre-dia-3".
   Mientras GOATCOUNTER_CODE esté vacío no se envía nada a ningún sitio. */

const GOATCOUNTER_CODE = ""; // p. ej. "nutriplan" si tu panel es nutriplan.goatcounter.com
const METRICS_KEY = "nutriplan_metrics_v1";
const MAX_TRACKED_DAY = 30;

let pendingEvents = [];

function analyticsEnabled() {
  return !!GOATCOUNTER_CODE && location.hostname !== "localhost";
}

function sendEvent(name) {
  window.goatcounter.count({ path: name, title: name, event: true });
}

function track(name) {
  if (!analyticsEnabled()) return;
  if (window.goatcounter && window.goatcounter.count) {
    sendEvent(name);
  } else {
    pendingEvents.push(name);
  }
}

function loadAnalytics() {
  if (!analyticsEnabled()) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://gc.zgo.at/count.js";
  script.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  script.addEventListener("load", () => {
    const queued = pendingEvents;
    pendingEvents = [];
    queued.forEach(sendEvent);
  });
  document.head.appendChild(script);
}

/* Registra una apertura al día como "abre-dia-N", donde N son los días desde
   la primera vez que esta persona abrió la app. Así, en el panel, la cifra de
   "abre-dia-7" dice cuántos probadores siguen usándola una semana después. */
function trackDailyOpen(standalone) {
  let metrics = {};
  try {
    metrics = JSON.parse(localStorage.getItem(METRICS_KEY)) || {};
  } catch (e) { /* sin almacenamiento: contamos como primer día */ }

  const now = new Date();
  const today = now.toDateString();
  if (!metrics.firstOpen) metrics.firstOpen = now.toISOString();
  if (metrics.lastOpenDay === today) return;
  metrics.lastOpenDay = today;

  const day = Math.floor((now - new Date(metrics.firstOpen)) / 86400000);
  track(day > MAX_TRACKED_DAY ? `abre-dia-${MAX_TRACKED_DAY}+` : `abre-dia-${day}`);
  if (standalone) track("abre-como-app");

  try {
    localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
  } catch (e) { /* seguimos sin guardar */ }
}

loadAnalytics();
