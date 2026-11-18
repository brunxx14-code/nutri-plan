/* Recordatorios para cocinar: a la hora que elijas, un aviso en el móvil
   ("🍳 Hora de la comida · Hoy toca…") y, al tocar ▶️, la app se abre
   directamente en el modo cocina de esa receta.

   La app no tiene servidor, así que no puede mandar avisos "push" desde
   fuera. Usamos lo que da el propio móvil, de más a menos fiable:
   1. Calendario del móvil: un evento diario con alarma y un enlace que abre
      el modo cocina. Funciona con la app cerrada, en Android y en iPhone.
   2. Avisos de la app (Notification API): mientras la app está abierta o en
      segundo plano reciente. Si el navegador lo permite (Chrome Android con
      la app instalada), el service worker también revisa de vez en cuando
      con "periodic background sync" y avisa aunque la cierres.
   3. Dentro de la app: un banner con ▶️ si ya es la hora y no has cocinado.
   Los avisos no llevan calorías ni números, solo la receta y la hora. */

const REMINDER_DEFAULTS = {
  desayuno: { on: true, time: "08:30" },
  comida: { on: true, time: "13:30" },
  merienda: { on: false, time: "17:30" },
  cena: { on: true, time: "20:30" },
};
const REMINDER_ORDER = ["desayuno", "comida", "merienda", "cena"];
const REMINDER_WINDOW_MS = 90 * 60000; // pasada hora y media ya no avisamos
const REMINDER_CACHE = "nutriplan-reminders"; // lo lee el service worker
const REMINDER_TITLES = {
  desayuno: "🍳 Hora del desayuno",
  comida: "🍳 Hora de la comida",
  merienda: "🍳 Hora de la merienda",
  cena: "🍳 Hora de la cena",
};

function reminderSettings() {
  if (!state.reminders || typeof state.reminders !== "object") state.reminders = { on: false, slots: {}, sent: {} };
  const r = state.reminders;
  if (!r.slots) r.slots = {};
  if (!r.sent) r.sent = {};
  for (const k of REMINDER_ORDER) if (!r.slots[k]) r.slots[k] = { ...REMINDER_DEFAULTS[k] };
  return r;
}

function notificationsSupported() {
  return "Notification" in window && "serviceWorker" in navigator;
}

function notificationPermission() {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

/* "13:30" de un día concreto -> Date */
function reminderAt(date, time) {
  const [h, m] = time.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h || 0, m || 0);
}

function reminderSlotLabel(slotKey) {
  const slot = MEAL_SLOTS.find((s) => s.key === slotKey);
  return slot ? slot.label : slotKey;
}

/* Texto del aviso: sin números, solo qué toca. */
function reminderMessage(date, slotKey) {
  const dayIdx = (date.getDay() + 6) % 7;
  const recipeId = state.plan && state.plan[dayIdx] && state.plan[dayIdx][slotKey];
  const info = recipeId && getRecipeInfo(recipeId);
  return {
    title: tr(REMINDER_TITLES[slotKey]),
    body: info
      ? `${tr("Hoy toca:")} ${info.recipe.name}. ${tr("Dale a ▶️ y te guío paso a paso.")}`
      : tr("Dale a ▶️ y te guío paso a paso."),
    dayIdx,
  };
}

function cookLinkFor(slotKey, dayIdx) {
  const url = new URL("./", location.href);
  url.searchParams.set("cocinar", slotKey);
  if (dayIdx !== undefined) url.searchParams.set("dia", String(dayIdx));
  return url.href;
}

function reminderSentKey(date, slotKey) {
  return `${isoDate(date)}|${slotKey}`;
}

// ---------- Mostrar un aviso ----------

async function showCookNotification(date, slotKey, { test = false } = {}) {
  const msg = reminderMessage(date, slotKey);
  if (notificationPermission() !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(msg.title, {
      body: msg.body,
      icon: "icons/icon-192.png",
      badge: "icons/favicon-32.png",
      tag: test ? "np-test" : `np-${reminderSentKey(date, slotKey)}`,
      vibrate: [200, 100, 200],
      data: { url: cookLinkFor(slotKey, msg.dayIdx), slot: slotKey, day: msg.dayIdx },
      actions: [
        { action: "cook", title: tr("▶️ Empezar a cocinar") },
        { action: "later", title: tr("Luego") },
      ],
    });
    return true;
  } catch (e) {
    return false;
  }
}

/* Con la app delante, mejor un banner propio que un aviso del sistema. */
function showReminderBanner(slotKey, dayIdx) {
  const old = document.getElementById("reminder-banner");
  if (old) old.remove();
  const msg = reminderMessage(new Date(), slotKey);
  const el = document.createElement("div");
  el.id = "reminder-banner";
  el.className = "reminder-banner";
  el.setAttribute("role", "status");
  el.innerHTML = `
    <div class="reminder-banner-text"><b>${msg.title}</b><span>${msg.body}</span></div>
    <button type="button" class="reminder-play" data-rb-play aria-label="Empezar a cocinar">▶️</button>
    <button type="button" class="reminder-x" data-rb-close aria-label="Cerrar">✕</button>`;
  document.getElementById("app-shell").appendChild(el);
  requestAnimationFrame(() => el.classList.add("open"));
  const close = () => { el.classList.remove("open"); setTimeout(() => el.remove(), 300); };
  el.querySelector("[data-rb-close]").addEventListener("click", close);
  el.querySelector("[data-rb-play]").addEventListener("click", () => {
    close();
    track("aviso-banner-cocinar");
    startCookingFromReminder(slotKey, dayIdx);
  });
  buzz(20);
}

// ---------- Comprobar si toca avisar ----------

function dueReminders(now = new Date()) {
  const r = reminderSettings();
  if (!r.on || !state.plan) return [];
  const entry = state.daily && state.daily[todayIso()];
  return REMINDER_ORDER.filter((k) => {
    const s = r.slots[k];
    if (!s.on) return false;
    if (entry && entry.eaten && entry.eaten[k]) return false;
    if (r.sent[reminderSentKey(now, k)]) return false;
    const at = reminderAt(now, s.time).getTime();
    return now.getTime() >= at && now.getTime() < at + REMINDER_WINDOW_MS;
  });
}

function pruneSent() {
  const r = reminderSettings();
  const cutoff = isoDate(new Date(Date.now() - 2 * 86400000));
  for (const k of Object.keys(r.sent)) if (k.split("|")[0] < cutoff) delete r.sent[k];
}

async function checkReminders() {
  if (!state.profile || !state.plan) return;
  const due = dueReminders();
  if (!due.length) return;
  const now = new Date();
  const r = reminderSettings();
  // solo la más reciente, para no soltar varios avisos de golpe
  const slotKey = due[due.length - 1];
  due.forEach((k) => { r.sent[reminderSentKey(now, k)] = true; });
  pruneSent();
  saveState();
  if (document.visibilityState === "visible") {
    if (!cook) showReminderBanner(slotKey, todayPlanIndex());
  } else {
    await showCookNotification(now, slotKey);
  }
  syncReminderSchedule();
}

// ---------- Para el service worker y los avisos programados ----------

/* Los próximos 7 días de avisos, ya con el texto, para que el service
   worker pueda mostrarlos sin abrir la app (no puede leer localStorage). */
function upcomingReminders(days = 7) {
  const r = reminderSettings();
  if (!r.on || !state.plan) return [];
  const out = [];
  const today = new Date();
  const entry = state.daily && state.daily[todayIso()];
  for (let d = 0; d < days; d++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
    for (const k of REMINDER_ORDER) {
      const s = r.slots[k];
      if (!s.on) continue;
      if (d === 0 && entry && entry.eaten && entry.eaten[k]) continue;
      if (r.sent[reminderSentKey(date, k)]) continue;
      const at = reminderAt(date, s.time).getTime();
      if (at + REMINDER_WINDOW_MS < Date.now()) continue;
      const msg = reminderMessage(date, k);
      out.push({
        at, slot: k, day: msg.dayIdx, tag: `np-${reminderSentKey(date, k)}`,
        title: msg.title, body: msg.body, url: cookLinkFor(k, msg.dayIdx),
        cookLabel: tr("▶️ Empezar a cocinar"), laterLabel: tr("Luego"),
      });
    }
  }
  return out;
}

let scheduleTimer = null;
function syncReminderSchedule() {
  clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(async () => {
    const items = upcomingReminders();
    try {
      if (window.caches) {
        const c = await caches.open(REMINDER_CACHE);
        await c.put("schedule.json", new Response(JSON.stringify({ items, savedAt: Date.now() }), { headers: { "Content-Type": "application/json" } }));
      }
    } catch (e) { /* sin caché, solo avisos con la app abierta */ }
    scheduleTriggeredNotifications(items);
  }, 300);
}

/* Notification Triggers: solo algunos Chrome lo traen. Si existe, el propio
   móvil muestra el aviso a su hora aunque la app esté cerrada. */
async function scheduleTriggeredNotifications(items) {
  if (notificationPermission() !== "granted") return;
  if (!("showTrigger" in Notification.prototype) || typeof window.TimestampTrigger !== "function") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const pending = await reg.getNotifications({ includeTriggered: true });
    pending.filter((n) => n.tag && n.tag.startsWith("np-")).forEach((n) => n.close());
    for (const it of items) {
      if (it.at <= Date.now()) continue;
      await reg.showNotification(it.title, {
        body: it.body, tag: it.tag, icon: "icons/icon-192.png", badge: "icons/favicon-32.png",
        data: { url: it.url, slot: it.slot, day: it.day },
        showTrigger: new window.TimestampTrigger(it.at),
        actions: [{ action: "cook", title: it.cookLabel }, { action: "later", title: it.laterLabel }],
      });
    }
  } catch (e) { /* no disponible */ }
}

async function registerPeriodicCheck() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.periodicSync) return;
    const status = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (status.state !== "granted") return;
    await reg.periodicSync.register("nutriplan-reminders", { minInterval: 15 * 60000 });
  } catch (e) { /* el navegador no lo permite */ }
}

// ---------- Abrir el modo cocina desde el aviso ----------

function startCookingFromReminder(slotKey, dayIdx) {
  if (!state.profile || !state.plan || !MEAL_SLOTS.some((s) => s.key === slotKey)) return;
  const day = Number.isInteger(dayIdx) && dayIdx >= 0 && dayIdx < 7 ? dayIdx : todayPlanIndex();
  ["welcome", "splash", "reminder-banner"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
  if (cook) closeCookMode();
  if (typeof closeSheet === "function") closeSheet();
  if (currentView !== "dashboard") showView("dashboard");
  setTimeout(() => openCookMode(day, slotKey), cook ? 300 : 0);
}

function handleCookLink() {
  const params = new URLSearchParams(location.search);
  const slotKey = params.get("cocinar");
  if (!slotKey) return;
  const dayParam = params.get("dia");
  const day = dayParam === null ? undefined : Number(dayParam);
  // limpia la dirección para que recargar no vuelva a abrir el modo cocina
  params.delete("cocinar");
  params.delete("dia");
  const rest = params.toString();
  history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : "") + location.hash);
  track("aviso-abrir-cocina");
  startCookingFromReminder(slotKey, day);
}

// ---------- Calendario del móvil (.ics) ----------

function icsEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsFold(line) {
  // cada línea de un .ics como mucho 75 bytes; se corta sin partir letras ni emojis
  const enc = new TextEncoder();
  const out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function icsLocal(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}00`;
}

/* Un evento diario por comida, con alarma a su hora y enlace al modo cocina.
   Va sin nombre de receta porque el plan cambia cada semana: el enlace abre
   la receta que toque ese día. */
function buildRemindersIcs() {
  const r = reminderSettings();
  const now = new Date();
  const stamp = `${now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NutriPlan//Recordatorios//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const k of REMINDER_ORDER) {
    const s = r.slots[k];
    if (!s.on) continue;
    const start = reminderAt(now, s.time);
    const end = new Date(start.getTime() + 30 * 60000);
    const link = cookLinkFor(k);
    const title = `${tr(REMINDER_TITLES[k])} · NutriPlan`;
    const desc = `${tr("Abre la receta de hoy paso a paso:")} ${link}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:nutriplan-${k}@nutriplan`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsLocal(start)}`,
      `DTEND:${icsLocal(end)}`,
      "RRULE:FREQ=DAILY",
      `SUMMARY:${icsEscape(title)}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      `URL:${link}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(title)}`,
      "TRIGGER:PT0M",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

function downloadRemindersIcs() {
  const r = reminderSettings();
  if (!REMINDER_ORDER.some((k) => r.slots[k].on)) {
    showToast(tr("Elige al menos una comida"));
    return;
  }
  const blob = new Blob([buildRemindersIcs()], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nutriplan-recordatorios.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  track("avisos-calendario");
  showToast(tr("📅 Ábrelo y dale a «Añadir» en tu calendario"));
}

// ---------- Tarjeta en el perfil ----------

function reminderHelpHtml(perm) {
  if (perm === "unsupported") {
    return `<p class="rem-note">${isIos() && !isStandalone()
      ? "📲 En iPhone, primero añade NutriPlan a la pantalla de inicio (botón Compartir → «Añadir a pantalla de inicio») y ábrela desde ahí para poder recibir avisos."
      : "Este navegador no permite avisos. Usa el calendario del móvil, que funciona igual de bien."}</p>`;
  }
  if (perm === "denied") {
    return `<p class="rem-note warn">🔕 Has bloqueado los avisos de NutriPlan. Puedes volver a permitirlos en los ajustes del navegador, o usar el calendario.</p>`;
  }
  if (isIos() && !isStandalone()) {
    return `<p class="rem-note">📲 En iPhone, los avisos solo llegan si abres NutriPlan desde la pantalla de inicio.</p>`;
  }
  return "";
}

function remindersCardHtml() {
  const r = reminderSettings();
  const perm = notificationPermission();
  return `
    <div class="pcard rem-card" id="rem-card">
      <div class="rem-head">
        <div>
          <div class="section-kicker">🔔 Recordatorios para cocinar</div>
          <p class="rem-sub">Te avisamos a tu hora y, con un toque en ▶️, te guiamos paso a paso.</p>
        </div>
        <button type="button" class="rem-switch ${r.on ? "on" : ""}" id="rem-toggle" role="switch" aria-checked="${r.on}" aria-label="Recordatorios"><span></span></button>
      </div>
      ${r.on ? `
        <div class="rem-slots">
          ${REMINDER_ORDER.map((k) => `
            <label class="rem-slot ${r.slots[k].on ? "" : "off"}">
              <input type="checkbox" data-rem-on="${k}" ${r.slots[k].on ? "checked" : ""}>
              <span class="rem-slot-name">${mealEmoji(k)} ${reminderSlotLabel(k)}</span>
              <input type="time" class="rem-time" data-rem-time="${k}" value="${r.slots[k].time}" ${r.slots[k].on ? "" : "disabled"} aria-label="Hora">
            </label>`).join("")}
        </div>
        ${reminderHelpHtml(perm)}
        <div class="rem-actions">
          <button type="button" class="btn secondary small" id="rem-calendar">📅 Añadir al calendario</button>
          <button type="button" class="btn ghost small" id="rem-test" ${perm === "granted" ? "" : "hidden"}>🔔 Probar aviso</button>
        </div>
        <p class="rem-note">El calendario te avisa aunque tengas la app cerrada. Los avisos de la app llegan mientras la usas o la tienes abierta en segundo plano.</p>
      ` : ""}
    </div>`;
}

async function enableReminders() {
  const r = reminderSettings();
  r.on = true;
  saveState();
  track("avisos-activar");
  if (notificationPermission() === "default") {
    try { await Notification.requestPermission(); } catch (e) { /* sin permiso */ }
  }
  registerPeriodicCheck();
  syncReminderSchedule();
  rerenderRemindersCard();
  if (notificationPermission() === "granted") showToast(tr("🔔 Listo, te avisaremos"));
}

function bindRemindersCard(root) {
  const card = root.querySelector("#rem-card");
  if (!card) return;
  const r = reminderSettings();
  card.querySelector("#rem-toggle").addEventListener("click", () => {
    buzz(10);
    if (!r.on) { enableReminders(); return; }
    r.on = false;
    saveState();
    track("avisos-desactivar");
    syncReminderSchedule();
    rerenderRemindersCard();
  });
  card.querySelectorAll("[data-rem-on]").forEach((box) => box.addEventListener("change", () => {
    r.slots[box.dataset.remOn].on = box.checked;
    saveState();
    syncReminderSchedule();
    rerenderRemindersCard();
  }));
  card.querySelectorAll("[data-rem-time]").forEach((inp) => inp.addEventListener("change", () => {
    if (!/^\d{2}:\d{2}$/.test(inp.value)) return;
    const k = inp.dataset.remTime;
    r.slots[k].time = inp.value;
    // si cambias la hora, que hoy vuelva a avisar a la nueva
    delete r.sent[reminderSentKey(new Date(), k)];
    saveState();
    syncReminderSchedule();
  }));
  const cal = card.querySelector("#rem-calendar");
  if (cal) cal.addEventListener("click", downloadRemindersIcs);
  const test = card.querySelector("#rem-test");
  if (test) test.addEventListener("click", async () => {
    const entry = dailyEntry();
    const slotKey = nextMealSlot(entry) || "comida";
    const ok = await showCookNotification(new Date(), slotKey, { test: true });
    track("avisos-probar");
    if (!ok) showToast(tr("No se pudo mostrar el aviso"));
  });
}

function rerenderRemindersCard() {
  const old = document.getElementById("rem-card");
  if (!old) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = remindersCardHtml();
  const fresh = wrap.firstElementChild;
  fresh.style.animation = "none";
  old.replaceWith(fresh);
  bindRemindersCard(fresh.parentNode);
}

/* La tarjeta se coloca en el perfil sin tocar renderPerfil por dentro. */
const renderPerfilBase = renderPerfil;
renderPerfil = function renderPerfilWithReminders() {
  renderPerfilBase();
  const el = document.getElementById("perfil-content");
  const anchor = el && el.querySelector("#edit-profile-btn");
  if (!anchor) return;
  anchor.insertAdjacentHTML("beforebegin", remindersCardHtml());
  bindRemindersCard(el);
};

// ---------- Arranque ----------

document.addEventListener("DOMContentLoaded", () => {
  reminderSettings();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      const d = e.data || {};
      if (d.type === "nutriplan-cook") startCookingFromReminder(d.slot, d.day);
    });
  }
  handleCookLink();
  if (state.reminders.on) {
    registerPeriodicCheck();
    syncReminderSchedule();
  }
  setTimeout(checkReminders, 1500);
  setInterval(checkReminders, 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkReminders();
    else syncReminderSchedule();
  });
});

// ---------- Traducciones (inglés) ----------

if (typeof I18N !== "undefined" && I18N.en) {
  Object.assign(I18N.en.ui, {
    "🍳 Hora del desayuno": "🍳 Breakfast time",
    "🍳 Hora de la comida": "🍳 Lunch time",
    "🍳 Hora de la merienda": "🍳 Snack time",
    "🍳 Hora de la cena": "🍳 Dinner time",
    "Hora del desayuno": "Breakfast time",
    "Hora de la comida": "Lunch time",
    "Hora de la merienda": "Snack time",
    "Hora de la cena": "Dinner time",
    "Hoy toca:": "Today's dish:",
    "Dale a ▶️ y te guío paso a paso.": "Tap ▶️ and I'll guide you step by step.",
    "▶️ Empezar a cocinar": "▶️ Start cooking",
    "Empezar a cocinar": "Start cooking",
    "Luego": "Later",
    "Abre la receta de hoy paso a paso:": "Open today's recipe step by step:",
    "Elige al menos una comida": "Pick at least one meal",
    "📅 Ábrelo y dale a «Añadir» en tu calendario": "📅 Open it and tap “Add” in your calendar",
    "🔔 Listo, te avisaremos": "🔔 Done, we'll remind you",
    "No se pudo mostrar el aviso": "Couldn't show the reminder",
    "Recordatorios para cocinar": "Cooking reminders",
    "Recordatorios": "Reminders",
    "Te avisamos a tu hora y, con un toque en ▶️, te guiamos paso a paso.": "We remind you at your time and, with one tap on ▶️, guide you step by step.",
    "Hora": "Time",
    "Añadir al calendario": "Add to calendar",
    "Probar aviso": "Test reminder",
    "El calendario te avisa aunque tengas la app cerrada. Los avisos de la app llegan mientras la usas o la tienes abierta en segundo plano.": "Your calendar reminds you even with the app closed. App reminders arrive while you use it or have it open in the background.",
    "En iPhone, primero añade NutriPlan a la pantalla de inicio (botón Compartir → «Añadir a pantalla de inicio») y ábrela desde ahí para poder recibir avisos.": "On iPhone, first add NutriPlan to your Home Screen (Share → “Add to Home Screen”) and open it from there to get reminders.",
    "Este navegador no permite avisos. Usa el calendario del móvil, que funciona igual de bien.": "This browser doesn't allow reminders. Use your phone's calendar, which works just as well.",
    "Has bloqueado los avisos de NutriPlan. Puedes volver a permitirlos en los ajustes del navegador, o usar el calendario.": "You've blocked NutriPlan notifications. You can allow them again in your browser settings, or use the calendar.",
    "En iPhone, los avisos solo llegan si abres NutriPlan desde la pantalla de inicio.": "On iPhone, reminders only arrive if you open NutriPlan from the Home Screen.",
  });
  Object.assign(I18N.en.templates, {
    "Hoy toca: {x}. Dale a ▶️ y te guío paso a paso.": "Today's dish: {x}. Tap ▶️ and I'll guide you step by step.",
  });
}
