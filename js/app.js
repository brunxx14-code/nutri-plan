/* Estado y lógica de interfaz de NutriPlan. */

const STORAGE_KEY = "nutriplan_state_v1";

let state = loadState() || { profile: null, plan: null, bought: {}, subscription: null };
if (!("subscription" in state)) state.subscription = null;
if (!Array.isArray(state.weightLog)) state.weightLog = [];
if (typeof state.calorieAdjust !== "number") state.calorieAdjust = 0;
if (!("adjustDecisionAt" in state)) state.adjustDecisionAt = null;
if (!state.daily || typeof state.daily !== "object") state.daily = {};
let wizardStep = 0;
let wizardMode = "create"; // 'create' | 'edit'
let selectedDay = todayPlanIndex(); // el Plan se abre en el día de hoy

const PLANS = {
  semanal: { label: "Semanal", price: 2.49, period: "semana", periodShort: "/sem" },
  mensual: { label: "Mensual", price: 6.99, period: "mes", periodShort: "/mes", badge: "Más popular" },
  anual: { label: "Anual", price: 44.99, period: "año", periodShort: "/año", badge: "Mejor precio", note: "Equivale a 3,75 €/mes · ahorras 46% frente al plan mensual" },
};

const WEIGH_IN_EVERY_DAYS = 7;
const ADJUST_COOLDOWN_DAYS = 7;

function currentTargets() {
  return calcTargets(state.profile, state.calorieAdjust);
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isPremium() {
  return !!(state.subscription && state.subscription.active);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* almacenamiento no disponible, seguimos solo en memoria */ }
}

// ---------- Utilidades de animación ----------

function animateCountUp(el, target, { suffix = "", duration = 700 } = {}) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------- Informes semanales ----------

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7) + d.getUTCFullYear() * 53;
}

function getWeeklyArticles(count = 4) {
  const n = ARTICLES.length;
  const start = getWeekNumber(new Date()) % n;
  const result = [];
  for (let i = 0; i < count; i++) result.push(ARTICLES[(start + i) % n]);
  return result;
}

function renderReportTeaser() {
  // el artículo del resumen es el primero de la semana que aún no has leído,
  // así no se queda enseñando uno que ya leíste hasta el lunes
  const read = new Set((state.counters && state.counters.articles) || []);
  const order = getWeeklyArticles(ARTICLES.length);
  const featured = order.find((a) => !read.has(a.id)) || order[0];
  return `
    <div class="report-teaser">
      <div class="report-teaser-main photo-card" data-article="${featured.id}">
        ${photoHtml(ARTICLE_CATEGORY_PHOTOS[featured.category], { width: 500, className: "photo-cover", fallback: "📰" })}
        <div class="photo-card-text">
          <span class="report-cat">${featured.category}</span>
          <h4>${featured.title}</h4>
          <span class="report-meta">⏱ ${featured.readMins} min</span>
        </div>
      </div>
      <button type="button" class="report-teaser-link" data-goto="informes">Ver informes de la semana →</button>
    </div>
  `;
}

function renderInformes() {
  updateInformesDot();
  const weekly = getWeeklyArticles(4);
  const weeklyIds = new Set(weekly.map((a) => a.id));
  const readIds = new Set((state.counters && state.counters.articles) || []);
  const featured = weekly[0];
  const others = ARTICLES.filter((a) => a.id !== featured.id);
  const el = document.getElementById("informes-content");

  el.innerHTML = `
    ${recapCardHtml()}
    ${calendarCardHtml()}
    <div class="report-hero photo-card" data-article="${featured.id}">
      ${readIds.has(featured.id) ? READ_BADGE : ""}
      ${photoHtml(ARTICLE_CATEGORY_PHOTOS[featured.category], { width: 600, className: "photo-cover", fallback: "📰" })}
      <div class="photo-card-text">
        <span class="report-cat">⭐ Destacado · ${featured.category}</span>
        <h4>${featured.title}</h4>
        <span class="report-meta">⏱ ${featured.readMins} min</span>
      </div>
    </div>
    <div class="report-grid">
      ${others.map((a) => `
        <div class="report-tile" data-article="${a.id}">
          ${photoHtml(ARTICLE_CATEGORY_PHOTOS[a.category], { width: 300, className: "photo-tile", fallback: "📰" })}
          ${readIds.has(a.id) ? READ_BADGE : weeklyIds.has(a.id) ? '<span class="report-new-badge">Nuevo</span>' : ""}
          <span class="report-tile-title">${a.title}</span>
          <span class="report-row-meta">⏱ ${a.readMins} min</span>
        </div>`).join("")}
    </div>
  `;

  el.querySelectorAll("[data-article]").forEach((b) => {
    b.addEventListener("click", () => openArticleSheet(b.dataset.article));
    actLikeButton(b);
  });
  bindRecapCard(el);
  bindCalendarCard(el);
}

// los artículos que ya has leído llevan «✓ Leído» en Informes, también el destacado
const READ_BADGE = '<span class="report-read-badge">✓ Leído</span>';

// al abrir un artículo, su tarjeta de detrás cambia ya a «✓ Leído», con un
// pequeño rebote, sin esperar a que vuelvas a la pestaña
function markTileRead(articleId) {
  const tile = document.querySelector(`#informes-content :is(.report-tile, .report-hero)[data-article="${articleId}"]`);
  if (!tile || tile.querySelector(".report-read-badge")) return;
  const old = tile.querySelector(".report-new-badge");
  if (old) old.remove();
  tile.insertAdjacentHTML("afterbegin", READ_BADGE);
  tile.querySelector(".report-read-badge").classList.add("just-read");
}

/* Un puntito coral en la pestaña Informes mientras queden artículos de esta
   semana sin leer; se apaga al leer el último. Solo lee la lista de leídos. */
function updateInformesDot() {
  const tab = document.querySelector('.tab-btn[data-view="informes"]');
  if (!tab) return;
  const read = new Set((state.counters && state.counters.articles) || []);
  const unread = getWeeklyArticles(4).some((a) => !read.has(a.id));
  let dot = tab.querySelector(".tab-dot");
  if (unread && !dot) {
    tab.insertAdjacentHTML("beforeend", '<span class="tab-dot"><span class="sr-only">Artículos sin leer</span></span>');
  } else if (!unread && dot) {
    dot.classList.add("going");
    setTimeout(() => dot.remove(), prefersReducedMotion() ? 0 : 250);
  }
}

function openArticleSheet(articleId) {
  const article = ARTICLES.find((a) => a.id === articleId);
  engage.articleRead(articleId);
  markTileRead(articleId);
  updateInformesDot();
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <span class="tag">${article.category}</span>
    <h3>${article.title}</h3>
    <div class="macro-row"><span class="macro-chip">${article.readMins} min de lectura</span></div>
    <div class="sheet-section article-body">
      ${article.body.map((p) => `<p>${p}</p>`).join("")}
    </div>
    ${nextArticleHtml(article)}
  `;
  const next = body.querySelector(".article-next");
  if (next) next.addEventListener("click", () => openArticleSheet(next.dataset.article));
  openSheet();
}

// al terminar un informe, el siguiente que aún no has leído (o el siguiente
// sin más, si ya los has leído todos), para seguir leyendo sin cerrar la hoja
function nextArticleHtml(article) {
  if (ARTICLES.length < 2) return "";
  const read = new Set((state.counters && state.counters.articles) || []);
  const start = ARTICLES.indexOf(article);
  const after = Array.from({ length: ARTICLES.length - 1 }, (_, i) => ARTICLES[(start + 1 + i) % ARTICLES.length]);
  const next = after.find((a) => !read.has(a.id)) || after[0];
  return `
    <button type="button" class="article-next" data-article="${next.id}">
      <span class="article-next-label">Sigue leyendo</span>
      <span class="article-next-title">${next.title}</span>
      <span class="report-meta">${next.category} · ⏱ ${next.readMins} min</span>
      <span class="article-next-arrow" aria-hidden="true">→</span>
    </button>`;
}

// ---------- Suscripción (simulada) ----------

function openPaywallSheet(reason) {
  const body = document.getElementById("sheet-body");
  track(`paywall-visto-${reason || "perfil"}`);
  const reasonText = reason === "compra"
    ? "Desbloquea tu lista de la compra con precios de los súper cerca de ti, agrupada por sección."
    : "Desbloquea todo lo que ofrece NutriPlan Premium.";

  body.innerHTML = `
    <span class="tag tag-purple">✨ Premium</span>
    <h3>Hazte Premium</h3>
    <p class="paywall-pitch">${reasonText}</p>
    <ul class="paywall-features">
      <li>🛒 Lista de la compra con precios y súper cercanos, lista para llevar</li>
      <li>📅 Plan semanal completo, los 7 días</li>
      <li>🔄 Regenera tu plan las veces que quieras</li>
    </ul>
    <div class="plan-grid">
      ${Object.entries(PLANS).map(([key, p]) => `
        <div class="plan-card ${p.badge ? "highlighted" : ""}" data-plan="${key}">
          ${p.badge ? `<span class="plan-badge">${p.badge}</span>` : ""}
          <div class="plan-name">${p.label}</div>
          <div class="plan-price">${p.price.toFixed(2).replace(".", ",")} €<span>${p.periodShort}</span></div>
          ${p.note ? `<div class="plan-note">${p.note}</div>` : ""}
          <button type="button" class="btn block plan-choose" data-plan="${key}">Elegir ${p.label.toLowerCase()}</button>
        </div>
      `).join("")}
    </div>
    <p class="hint paywall-disclaimer">Esto es una simulación de prueba: no se realizará ningún cobro real.</p>
  `;

  body.querySelectorAll(".plan-choose").forEach((btn) => {
    btn.addEventListener("click", () => {
      track(`plan-elegido-${btn.dataset.plan}`);
      openPurchaseConfirm(btn.dataset.plan);
    });
  });

  openSheet();
}

function openPurchaseConfirm(planKey) {
  const plan = PLANS[planKey];
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <span class="tag tag-purple">✨ Premium · ${plan.label}</span>
    <h3>Confirmar suscripción</h3>
    <div class="why-block">
      <p>Vas a simular la suscripción al plan <b>${plan.label}</b> por <b>${plan.price.toFixed(2).replace(".", ",")} €${plan.periodShort}</b>.</p>
      <p>⚠️ Esto es solo una prueba para ver si el modelo tiene sentido: <b>no se te va a cobrar nada real</b>, no se pide ninguna tarjeta.</p>
    </div>
    <div class="paywall-confirm-actions">
      <button type="button" class="btn ghost" id="confirm-cancel">Cancelar</button>
      <button type="button" class="btn block" id="confirm-subscribe">Confirmar (simulado)</button>
    </div>
  `;
  document.getElementById("confirm-cancel").addEventListener("click", () => openPaywallSheet());
  document.getElementById("confirm-subscribe").addEventListener("click", () => confirmSubscribe(planKey));
}

function confirmSubscribe(planKey) {
  const plan = PLANS[planKey];
  state.subscription = { active: true, plan: planKey, price: plan.price, startedAt: new Date().toISOString() };
  saveState();
  track(`suscripcion-confirmada-${planKey}`);
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <span class="tag tag-amber">✓ Listo</span>
    <h3>¡Ya eres Premium! (simulado)</h3>
    <p class="paywall-pitch">Se ha activado tu plan ${plan.label.toLowerCase()} en modo prueba. Ya puedes ver tu lista de la compra con precios.</p>
    <button type="button" class="btn block" id="paywall-done">Ir a la lista de la compra</button>
  `;
  document.getElementById("paywall-done").addEventListener("click", () => {
    closeSheet();
    renderCompra();
    showView("compra");
  });
  renderPerfil();
}

function cancelSubscription() {
  state.subscription = null;
  saveState();
  track("suscripcion-cancelada");
  renderPerfil();
  renderCompra();
}

function dismissSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.classList.add("hide");
  setTimeout(() => splash.remove(), 600);
}

// ---------- Pantalla de bienvenida ----------

const WELCOME_LINES = {
  perder: ["Cada comida del plan te acerca a tu meta.", "Hoy es un buen día para cuidarte.", "Pequeños pasos, grandes cambios."],
  mantener: ["Constancia hoy, energía mañana.", "Comer bien también es disfrutar.", "Tu plan de hoy ya está listo."],
  ganar: ["Hoy toca alimentar el músculo 💪", "Sin comida no hay progreso.", "Come bien, entrena fuerte."],
};

function greetingForNow() {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return { text: "Buenos días", emoji: "☀️" };
  if (h >= 13 && h < 21) return { text: "Buenas tardes", emoji: "👋" };
  return { text: "Buenas noches", emoji: "🌙" };
}

/* La siguiente comida que toca según la hora y lo que ya está marcado. */
function nextMealSlot(entry) {
  const order = ["desayuno", "comida", "merienda", "cena"];
  const h = new Date().getHours();
  const start = h < 11 ? 0 : h < 16 ? 1 : h < 19 ? 2 : 3;
  const pending = order.filter((k) => !entry.eaten[k]);
  if (!pending.length) return null;
  return pending.find((k) => order.indexOf(k) >= start) || pending[pending.length - 1];
}

/* Tarjeta "Ahora toca": la siguiente comida con acceso directo a cocinarla
   o marcarla, para que abrir la app lleve a hacer algo. */
const UP_NEXT_HINT = { desayuno: "Empieza el día con energía", comida: "La comida fuerte del día", merienda: "Un picoteo que suma", cena: "Cierra el día bien" };

function upNextCardHtml() {
  const slotKey = nextMealSlot(dailyEntry());
  if (!slotKey) return `<div id="up-next" class="up-next-empty"></div>`;
  const slot = MEAL_SLOTS.find((s) => s.key === slotKey);
  const dayIdx = todayPlanIndex();
  const info = getRecipeInfo(state.plan[dayIdx][slotKey]);
  const factor = dayFactor(dayIdx);
  return `
    <div class="up-next" id="up-next" data-slot="${slotKey}">
      <button type="button" class="up-next-main" data-upnext-open>
        ${recipePhoto(info.recipe.id, { width: 160, className: `photo-thumb big ${slotKey}`, fallback: mealEmoji(slotKey) })}
        <span class="up-next-text">
          <span class="up-next-kicker">⏰ Ahora toca · ${slot.label}</span>
          <span class="up-next-name">${info.recipe.name}</span>
          <span class="up-next-meta">${Math.round(info.kcal * factor)} kcal · ${recipeCookMins(info.recipe) ? `<span class="up-next-time">⏱ ${recipeCookMins(info.recipe)} min</span> · ` : ""}<span>${UP_NEXT_HINT[slotKey]}</span></span>
        </span>
      </button>
      <div class="up-next-actions">
        <button type="button" class="btn small" data-upnext-cook>👩‍🍳 Cocinar</button>
        <button type="button" class="btn secondary small" data-upnext-done>✓ ${slotKey === "desayuno" ? "Ya lo tomé" : "Ya la tomé"}</button>
      </div>
    </div>`;
}

function bindUpNextCard(root) {
  const card = root.querySelector("#up-next");
  if (!card || !card.dataset.slot) return;
  const slotKey = card.dataset.slot;
  card.querySelector("[data-upnext-open]").addEventListener("click", () => openRecipeSheet(todayPlanIndex(), slotKey));
  card.querySelector("[data-upnext-cook]").addEventListener("click", () => openCookMode(todayPlanIndex(), slotKey));
  card.querySelector("[data-upnext-done]").addEventListener("click", () => {
    const btn = document.querySelector(`#dashboard-content [data-eat="${slotKey}"]`);
    if (btn) btn.click();
  });
}

/* Tras marcar una comida, la tarjeta pasa a la siguiente con una transición. */
function refreshUpNext() {
  const old = document.getElementById("up-next");
  if (!old) return;
  const next = nextMealSlot(dailyEntry());
  if ((old.dataset.slot || null) === next) return;
  const doneSlot = old.dataset.slot;
  old.classList.add("leaving");
  setTimeout(() => {
    const cur = document.getElementById("up-next");
    if (!cur) return;
    // si el foco estaba en la tarjeta (p. ej. en «Ya la tomé»), no se pierde al cambiarla
    const hadFocus = cur.contains(document.activeElement);
    cur.outerHTML = upNextCardHtml();
    const fresh = document.getElementById("up-next");
    fresh.classList.add("entering");
    bindUpNextCard(fresh.parentNode);
    if (hadFocus) {
      const target = fresh.querySelector("[data-upnext-done]")
        || document.querySelector(`#dashboard-content [data-eat="${doneSlot}"]`);
      if (target) target.focus({ preventScroll: true });
    }
  }, prefersReducedMotion() ? 0 : 260);
}

function welcomeMessage(entry) {
  const streak = currentStreak();
  const done = mealsDone(entry);
  if (done === MEAL_SLOTS.length) return "¡Día completado! Mañana más 🎉";
  if (streak >= 2) return `🔥 Llevas ${streak} días seguidos. ¡No rompas la racha!`;
  if (weekRebalance().perDay) return "🔄 Tu semana ya está reajustada. ¡Sigue así!";
  const lines = WELCOME_LINES[state.profile.goal] || WELCOME_LINES.mantener;
  return lines[new Date().getDate() % lines.length];
}

function showWelcome() {
  const entry = dailyEntry();
  const greet = greetingForNow();
  const dayIdx = todayPlanIndex();
  const slotKey = nextMealSlot(entry);
  const slot = slotKey && MEAL_SLOTS.find((s) => s.key === slotKey);
  const info = slotKey && getRecipeInfo(state.plan[dayIdx][slotKey]);
  const heroId = info ? RECIPE_PHOTOS[info.recipe.id] : GOAL_PHOTOS[state.profile.goal];
  const streak = currentStreak();

  const el = document.createElement("div");
  el.id = "welcome";
  // para el teclado y el lector de pantalla es un diálogo: el foco entra en
  // «Empezar mi día», Esc lo cierra y Tab no se escapa a la app de detrás
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "welcome-hello");
  el.innerHTML = `
    <div class="welcome-bg" aria-hidden="true">${heroId ? `<img src="${unsplashUrl(heroId, 800)}" alt="" onload="this.classList.add('loaded')" onerror="this.remove()">` : ""}</div>
    <div class="welcome-shade"></div>
    <div class="welcome-top"><span class="welcome-logo">🥗 Nutri<b>Plan</b></span><span class="welcome-day">${DAYS[dayIdx]}</span></div>
    <div class="welcome-main">
      <div class="welcome-emoji" aria-hidden="true">${greet.emoji}</div>
      <h1 class="welcome-hello" id="welcome-hello">${greet.text}</h1>
      <p class="welcome-msg">${welcomeMessage(entry)}</p>
      ${info ? `
        <div class="welcome-next">
          ${recipePhoto(info.recipe.id, { width: 160, className: `photo-thumb big ${slotKey}`, fallback: mealEmoji(slotKey) })}
          <div>
            <span class="welcome-next-kicker">Lo siguiente · ${slot.label}</span>
            <span class="welcome-next-name">${info.recipe.name}</span>
          </div>
        </div>` : ""}
      <div class="welcome-chips">
        <span>🍽️ ${mealsDone(entry)}/${MEAL_SLOTS.length} comidas</span>
        <span>💧 ${entry.water}/${waterGoalGlasses()} vasos</span>
        ${streak ? `<span>🔥 ${streak} ${streak === 1 ? "día" : "días"}</span>` : ""}
      </div>
    </div>
    <button type="button" class="welcome-go" id="welcome-go">Empezar mi día <span aria-hidden="true">→</span></button>
    <div class="welcome-hint" aria-hidden="true">o toca en cualquier sitio</div>
  `;
  document.getElementById("app-shell").appendChild(el);
  const go = el.querySelector("#welcome-go");
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") { e.preventDefault(); go.focus(); }
  };
  const close = () => {
    if (el.classList.contains("hide")) return;
    buzz(10);
    track("bienvenida-entrar");
    el.classList.add("hide");
    document.removeEventListener("keydown", onKey, true);
    // el foco pasa al título del resumen, en vez de perderse con la pantalla
    if (el.contains(document.activeElement)) {
      const title = document.querySelector("#view-dashboard h2");
      if (title) { title.setAttribute("tabindex", "-1"); title.focus({ preventScroll: true }); }
    }
    setTimeout(() => el.remove(), 550);
  };
  el.addEventListener("click", close);
  document.addEventListener("keydown", onKey, true);
  go.focus({ preventScroll: true });
}

// ---------- Formulario / wizard de onboarding ----------

function populateSelect(selectEl, labelsObj, defaultKey) {
  selectEl.innerHTML = "";
  for (const [key, label] of Object.entries(labelsObj)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = label;
    if (key === defaultKey) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function buildDislikesGrid() {
  const grid = document.getElementById("dislikes-grid");
  grid.innerHTML = "";
  const sorted = Object.entries(FOODS).sort((a, b) => a[1].name.localeCompare(b[1].name));
  for (const [id, food] of sorted) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = id;
    input.name = "dislikes";
    label.appendChild(input);
    label.appendChild(document.createTextNode(food.name));
    grid.appendChild(label);
  }
  grid.addEventListener("change", () => updateDislikesCount(true));
}

/* Cuántos alimentos has quitado, junto al título de la lista: con 40 casillas
   es fácil perder la cuenta, sobre todo al bajar por la lista. */
function updateDislikesCount(bump) {
  const el = document.getElementById("dislikes-count");
  if (!el) return;
  const n = document.querySelectorAll('#dislikes-grid input:checked').length;
  el.classList.toggle("hidden", n === 0);
  if (!n) { el.textContent = ""; return; }
  const text = n === 1 ? "1 quitado" : `${n} quitados`;
  if (el.textContent !== text) {
    el.textContent = text;
    if (bump && !prefersReducedMotion()) {
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    }
  }
}

function createSportRow(prefill) {
  const row = document.createElement("div");
  row.className = "sport-row";

  const select = document.createElement("select");
  select.className = "sport-type";
  select.setAttribute("aria-label", "Deporte");
  for (const [key, sport] of Object.entries(SPORTS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = sport.label;
    if (prefill && prefill.type === key) opt.selected = true;
    select.appendChild(opt);
  }

  const freqInput = document.createElement("input");
  freqInput.type = "number";
  freqInput.className = "sport-freq";
  freqInput.min = 0;
  freqInput.max = 14;
  freqInput.placeholder = "veces";
  freqInput.inputMode = "numeric";
  freqInput.setAttribute("aria-label", "Veces por semana");
  freqInput.value = prefill ? prefill.freq : "";

  const minsInput = document.createElement("input");
  minsInput.type = "number";
  minsInput.className = "sport-mins";
  minsInput.min = 0;
  minsInput.max = 300;
  minsInput.placeholder = "min";
  minsInput.inputMode = "numeric";
  minsInput.setAttribute("aria-label", "Minutos por sesión");
  minsInput.value = prefill ? prefill.mins : "";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-sport";
  removeBtn.textContent = "✕";
  removeBtn.setAttribute("aria-label", "Quitar deporte");
  removeBtn.addEventListener("click", () => {
    // El foco no se pierde: pasa al deporte siguiente, al anterior o a «+ Añadir deporte».
    const next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    (next ? next.querySelector(".sport-type") : document.getElementById("add-sport-btn")).focus();
  });

  row.append(select, freqInput, minsInput, removeBtn);
  return row;
}

function addSportRow(prefill) {
  document.getElementById("sports-rows").appendChild(createSportRow(prefill));
}

function readSportsFromForm() {
  const sports = [];
  document.querySelectorAll("#sports-rows .sport-row").forEach((row) => {
    const type = row.querySelector(".sport-type").value;
    const freq = Number(row.querySelector(".sport-freq").value) || 0;
    const mins = Number(row.querySelector(".sport-mins").value) || 0;
    if (freq > 0 && mins > 0) sports.push({ type, freq, mins });
  });
  return sports;
}

function initOnboardingForm() {
  populateSelect(document.getElementById("activityLevel"), ACTIVITY_LABELS, "moderado");
  populateSelect(document.getElementById("goal"), GOAL_LABELS, "mantener");
  const form = document.getElementById("onboarding-form");
  enhanceChoiceCards(form.querySelector('select[name="sex"]'), {
    hombre: { emoji: "👨", title: "Hombre" },
    mujer: { emoji: "👩", title: "Mujer" },
  }, "two");
  enhanceChoiceCards(document.getElementById("goal"), {
    perder: { emoji: "🔥", title: "Perder grasa", photo: GOAL_PHOTOS.perder },
    mantener: { emoji: "⚖️", title: "Mantenerme", photo: GOAL_PHOTOS.mantener },
    ganar: { emoji: "💪", title: "Ganar músculo", photo: GOAL_PHOTOS.ganar },
  }, "three photos");
  enhanceChoiceCards(document.getElementById("activityLevel"), {
    sedentario: { emoji: "🪑", title: "Poco", sub: "Oficina" },
    moderado: { emoji: "🚶", title: "Normal", sub: "Caminas bastante" },
    activo: { emoji: "🏗️", title: "Mucho", sub: "Trabajo físico" },
  }, "three");
  enhanceChoiceCards(form.querySelector('select[name="dietType"]'), {
    omnivoro: { emoji: "🍗", title: "De todo" },
    vegetariano: { emoji: "🥚", title: "Vegetariano" },
    vegano: { emoji: "🌱", title: "Vegano" },
  }, "three");
  buildDislikesGrid();
  const introLang = document.getElementById("intro-lang");
  introLang.innerHTML = langPickerHtml();
  bindLangPicker(introLang);
  addSportRow();
  document.getElementById("add-sport-btn").addEventListener("click", () => {
    addSportRow();
    document.querySelector("#sports-rows .sport-row:last-child .sport-type").focus();
  });

  const progress = document.getElementById("wizard-progress");
  progress.innerHTML = "";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "Progreso del cuestionario");
  progress.setAttribute("aria-valuemin", "1");
  progress.setAttribute("aria-valuemax", "4");
  for (let i = 0; i < 4; i++) {
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");
    progress.appendChild(dot);
  }
}

/* Sustituye visualmente un <select> por tarjetas pulsables. El select sigue
   en el formulario (oculto) y es quien guarda el valor. */
function enhanceChoiceCards(select, choices, variant) {
  select.classList.add("select-hidden");
  select.tabIndex = -1;
  const grid = document.createElement("div");
  grid.className = `choice-grid ${variant}`;
  grid.setAttribute("role", "radiogroup");
  // El grupo se llama como la etiqueta del select («Objetivo físico»…).
  const label = select.closest("label");
  const labelText = label && [...label.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
  if (labelText) grid.setAttribute("aria-label", labelText);
  // Como un grupo de radios nativo: Tab entra solo en la elegida y las flechas cambian.
  grid.addEventListener("keydown", (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: "first", End: "last" };
    if (!(e.key in keys) || !e.target.classList.contains("choice-card")) return;
    e.preventDefault();
    const cards = [...grid.querySelectorAll(".choice-card")];
    const i = cards.indexOf(e.target);
    const k = keys[e.key];
    const next = k === "first" ? cards[0] : k === "last" ? cards[cards.length - 1] : cards[(i + k + cards.length) % cards.length];
    next.click();
    next.focus();
  });
  for (const [value, c] of Object.entries(choices)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-card";
    btn.dataset.value = value;
    btn.setAttribute("role", "radio");
    btn.innerHTML = `${c.photo
      ? photoHtml(c.photo, { width: 300, className: "photo-choice", fallback: c.emoji })
      : `<span class="choice-emoji">${c.emoji}</span>`}
      <span class="choice-title">${c.photo ? `${c.emoji} ` : ""}${c.title}</span>
      ${c.sub ? `<span class="choice-sub">${c.sub}</span>` : ""}`;
    btn.addEventListener("click", () => {
      select.value = value;
      buzz(8);
      syncChoiceCards();
    });
    grid.appendChild(btn);
  }
  select.insertAdjacentElement("afterend", grid);
}

function syncChoiceCards() {
  document.querySelectorAll(".choice-grid").forEach((grid) => {
    const select = grid.previousElementSibling;
    grid.querySelectorAll(".choice-card").forEach((card) => {
      const on = card.dataset.value === select.value;
      card.classList.toggle("selected", on);
      card.setAttribute("aria-checked", on);
      card.tabIndex = on ? 0 : -1;
    });
  });
}

function readProfileFromForm(form) {
  const fd = new FormData(form);
  const dislikes = fd.getAll("dislikes");
  const weeklyBudget = fd.get("weeklyBudget");
  return {
    sex: fd.get("sex"),
    age: Number(fd.get("age")),
    weightKg: Number(fd.get("weightKg")),
    heightCm: Number(fd.get("heightCm")),
    activityLevel: fd.get("activityLevel"),
    goal: fd.get("goal"),
    dietType: fd.get("dietType"),
    dislikes,
    sports: readSportsFromForm(),
    weeklyBudget: weeklyBudget ? Number(weeklyBudget) : null,
  };
}

function fillFormFromProfile(form, profile) {
  form.sex.value = profile.sex;
  form.age.value = profile.age;
  form.weightKg.value = profile.weightKg;
  form.heightCm.value = profile.heightCm;
  form.activityLevel.value = profile.activityLevel;
  if (!form.activityLevel.value) form.activityLevel.value = "moderado";
  form.goal.value = profile.goal;
  form.dietType.value = profile.dietType;
  form.weeklyBudget.value = profile.weeklyBudget || "";
  document.getElementById("sports-rows").innerHTML = "";
  if (profile.sports && profile.sports.length) {
    profile.sports.forEach((s) => addSportRow(s));
  } else {
    addSportRow();
  }
  form.querySelectorAll('input[name="dislikes"]').forEach((cb) => {
    cb.checked = profile.dislikes.includes(cb.value);
  });
  updateDislikesCount(false);
}

/* Mientras rellenas el formulario ves tus calorías y macros al momento:
   el plan empieza a ser tuyo antes de terminar. */
const wizardPreviewShown = {};

function tweenNumber(el, to) {
  const from = Number(el.textContent) || 0;
  if (from === to) return;
  if (prefersReducedMotion()) { el.textContent = to; return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / 450, 1);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateWizardPreview() {
  const box = document.getElementById("wizard-preview");
  const form = document.getElementById("onboarding-form");
  if (!box || !form) return;
  const p = readProfileFromForm(form);
  const ok = p.age >= 14 && p.age <= 90 && p.weightKg >= 30 && p.weightKg <= 300 && p.heightCm >= 120 && p.heightCm <= 230;
  box.classList.toggle("hidden", !ok);
  const live = document.getElementById("wp-live");
  clearTimeout(updateWizardPreview.timer);
  if (!ok) { if (live) live.textContent = ""; return; }
  const t = calcTargets(p);
  // La cifra animada cambia en cada fotograma; el lector de pantalla oye solo el
  // resultado, una vez que dejas de teclear.
  if (live) {
    const msg = `Tu objetivo diario: ${Math.round(t.calories)} kcal, ${Math.round(t.protein)} g de proteína, ${Math.round(t.carbs)} g de hidratos y ${Math.round(t.fat)} g de grasa`;
    updateWizardPreview.timer = setTimeout(() => { if (live.textContent !== msg) live.textContent = msg; }, 700);
  }
  if (!wizardPreviewShown.done) {
    wizardPreviewShown.done = true;
    track("vista-previa-calorias");
  }
  tweenNumber(document.getElementById("wp-kcal"), Math.round(t.calories));
  tweenNumber(document.getElementById("wp-prot"), Math.round(t.protein));
  tweenNumber(document.getElementById("wp-carbs"), Math.round(t.carbs));
  tweenNumber(document.getElementById("wp-fat"), Math.round(t.fat));
}

function setWizardMode(mode) {
  wizardMode = mode;
  document.getElementById("wizard-intro").classList.toggle("hidden", mode === "edit");
  document.getElementById("wizard-cancel").classList.toggle("hidden", mode !== "edit");
}

function goToWizardStep(step) {
  // El paso nuevo entra desde el lado hacia el que vas, como los días del Plan.
  const dir = step > wizardStep ? "step-from-right" : step < wizardStep ? "step-from-left" : "";
  wizardStep = step;
  requestAnimationFrame(updateWizardPreview);
  syncChoiceCards();
  document.querySelectorAll(".wizard-step").forEach((el) => {
    const on = Number(el.dataset.step) === step;
    el.classList.toggle("active", on);
    el.classList.remove("step-from-right", "step-from-left");
    if (on && dir) el.classList.add(dir);
  });
  const progress = document.getElementById("wizard-progress");
  progress.setAttribute("aria-valuenow", String(step + 1));
  progress.setAttribute("aria-valuetext", `Paso ${step + 1} de 4`);
  document.querySelectorAll("#wizard-progress .dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === step);
    dot.classList.toggle("done", i < step);
  });
  document.getElementById("wizard-back").classList.toggle("hidden", step === 0 && wizardMode === "create");
  document.getElementById("wizard-next").classList.toggle("hidden", step === 3);
  document.getElementById("wizard-submit").classList.toggle("hidden", step !== 3);
  document.getElementById("app-scroll").scrollTop = 0;
}

function validateStep(step) {
  const stepEl = document.querySelector(`.wizard-step[data-step="${step}"]`);
  const inputs = stepEl.querySelectorAll("input, select");
  for (const input of inputs) {
    if (!input.checkValidity()) {
      input.reportValidity();
      return false;
    }
  }
  return true;
}

function enterEditMode() {
  fillFormFromProfile(document.getElementById("onboarding-form"), state.profile);
  setWizardMode("edit");
  goToWizardStep(0);
  showView("onboarding");
}

/* Salir de «Editar perfil» sin guardar: vuelves al perfil con el foco en el
   botón que lo abrió, para seguir con el teclado donde estabas. */
function leaveEditMode() {
  showView("perfil");
  const btn = document.getElementById("edit-profile-btn");
  if (btn) btn.focus({ preventScroll: true });
}

// ---------- Navegación ----------

const TAB_ORDER = ["dashboard", "plan", "compra", "informes", "perfil"];
let currentView = null;

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  const view = document.getElementById(`view-${name}`);
  // entre pestañas, la vista entra desde el lado hacia el que te mueves
  const from = TAB_ORDER.indexOf(currentView);
  const to = TAB_ORDER.indexOf(name);
  const enter = from >= 0 && to >= 0 && from !== to ? (to > from ? "view-enter-right" : "view-enter-left") : "view-enter";
  view.classList.remove("hidden", "view-enter", "view-enter-right", "view-enter-left");
  void view.offsetWidth; // reinicia la animación de entrada
  view.classList.add(enter);
  currentView = name;
  if (name === "informes" && state.plan) renderInformes(); // el resumen de la semana, al día
  if (name === "plan") centerActiveDay();
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const on = b.dataset.view === name;
    b.classList.toggle("active", on);
    // los lectores de pantalla anuncian en qué pestaña estás
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  moveTabIndicator();
  updateViewTitle(name);
  document.getElementById("app-scroll").scrollTop = 0;
}

/* El título de la pestaña del navegador (y del selector de apps) dice dónde
   estás: «Plan · NutriPlan». En el registro se queda el título completo. */
let baseTitle = null;

function updateViewTitle(name) {
  if (baseTitle === null) baseTitle = document.title;
  const tab = document.querySelector(`.tab-btn[data-view="${name}"] span`);
  document.title = tab ? `${tab.textContent.trim()} · NutriPlan` : baseTitle;
}

/* Desde la barra de pestañas: cada pestaña recuerda hasta dónde bajaste, y
   tocar la pestaña en la que ya estás sube arriba con suavidad. */
const tabScroll = {};

function openTab(name) {
  const scroller = document.getElementById("app-scroll");
  if (name === currentView) {
    if (scroller.scrollTop > 0) {
      scroller.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      buzz(6);
    }
    return;
  }
  if (currentView) tabScroll[currentView] = scroller.scrollTop;
  showView(name);
  const saved = tabScroll[name] || 0;
  if (saved) scroller.scrollTop = Math.min(saved, scroller.scrollHeight - scroller.clientHeight);
}

function moveTabIndicator() {
  const active = document.querySelector(".tab-btn.active");
  const indicator = document.getElementById("tab-indicator");
  if (!indicator) return;
  indicator.classList.toggle("hidden", !active);
  if (!active) return;
  indicator.style.width = `${active.offsetWidth}px`;
  indicator.style.transform = `translateX(${active.offsetLeft}px)`;
}

function enterApp() {
  document.getElementById("tab-bar").classList.remove("hidden");
  useStreakFreezes();
  renderDashboard();
  renderPlan();
  renderCompra();
  renderInformes();
  renderPerfil();
  showView("dashboard");
}

// ---------- Dashboard ----------

function buildMacroRing(targets) {
  const r = 68;
  const C = 2 * Math.PI * r;
  const proteinKcal = targets.protein * 4;
  const carbsKcal = targets.carbs * 4;
  const fatKcal = targets.fat * 9;
  const total = proteinKcal + carbsKcal + fatKcal || 1;
  const proteinLen = (proteinKcal / total) * C;
  const carbsLen = (carbsKcal / total) * C;
  const fatLen = (fatKcal / total) * C;
  return {
    C,
    protein: { len: proteinLen, offset: 0, pct: Math.round((proteinKcal / total) * 100) },
    carbs: { len: carbsLen, offset: -proteinLen, pct: Math.round((carbsKcal / total) * 100) },
    fat: { len: fatLen, offset: -(proteinLen + carbsLen), pct: Math.round((fatKcal / total) * 100) },
  };
}

function renderDashboard() {
  const { profile, plan } = state;
  const targets = currentTargets();
  const { grandTotal } = storeShoppingList();
  const el = document.getElementById("dashboard-content");
  const whyParas = explainTargets(profile, targets);
  const ring = buildMacroRing(targets);

  let budgetHtml;
  if (profile.weeklyBudget) {
    const diff = profile.weeklyBudget - grandTotal;
    const ok = diff >= 0;
    budgetHtml = `
      <div class="budget-banner ${ok ? "ok" : "warn"}">
        ${ok
          ? `🛒 <b>${euro(grandTotal)} €</b> esta semana · ✅ dentro de tus ${profile.weeklyBudget} €`
          : `🛒 <b>${euro(grandTotal)} €</b> esta semana · ⚠️ ${euro(Math.abs(diff))} € por encima, prueba 🔄 en Plan`}
      </div>`;
  } else {
    budgetHtml = `<div class="budget-banner ok">🛒 <b>${euro(grandTotal)} €</b> de compra esta semana</div>`;
  }

  el.innerHTML = `
    <div class="chip-row">
      <div class="goal-chip">🎯 ${GOAL_LABELS[profile.goal]}</div>
      ${renderStreakChip()}
      ${levelChipHtml()}
    </div>
    ${upNextCardHtml()}
    <div class="ring-card">
      <div class="ring-wrap">
        <svg class="ring-svg" viewBox="0 0 160 160">
          <circle class="ring-track" cx="80" cy="80" r="68"/>
          <g transform="rotate(-90 80 80)">
            <circle class="ring-seg ring-protein" cx="80" cy="80" r="68"
              stroke-dasharray="${ring.protein.len} ${ring.C - ring.protein.len}" stroke-dashoffset="${ring.protein.offset}"/>
            <circle class="ring-seg ring-carbs" cx="80" cy="80" r="68"
              stroke-dasharray="${ring.carbs.len} ${ring.C - ring.carbs.len}" stroke-dashoffset="${ring.carbs.offset}"/>
            <circle class="ring-seg ring-fat" cx="80" cy="80" r="68"
              stroke-dasharray="${ring.fat.len} ${ring.C - ring.fat.len}" stroke-dashoffset="${ring.fat.offset}"/>
          </g>
        </svg>
        <div class="ring-center">
          <div class="ring-kcal" id="ring-kcal-value">0</div>
          <div class="ring-kcal-label">kcal / día</div>
        </div>
      </div>
      <div class="ring-legend">
        <div class="legend-row"><span class="dot rose"></span><span class="legend-label">🍗 Proteína</span><span class="legend-val" id="legend-protein">0 g</span><span class="legend-pct">${ring.protein.pct}%</span></div>
        <div class="legend-row"><span class="dot amber"></span><span class="legend-label">🌾 Carbohidratos</span><span class="legend-val" id="legend-carbs">0 g</span><span class="legend-pct">${ring.carbs.pct}%</span></div>
        <div class="legend-row"><span class="dot purple"></span><span class="legend-label">🥑 Grasas</span><span class="legend-val" id="legend-fat">0 g</span><span class="legend-pct">${ring.fat.pct}%</span></div>
      </div>
      ${targets.exerciseKcal > 0 ? `<div class="ring-sport-note">🏃 +${targets.exerciseKcal} kcal/día de media por tu deporte, ya incluidas arriba</div>` : ""}
    </div>
    ${renderTodayCard()}
    ${challengeCardHtml()}
    ${renderProgressCard()}
    ${budgetHtml}
    ${renderInstallCard()}
    ${tipCardHtml()}
    ${renderReportTeaser()}
    <div class="why-card" id="targets-why-card">
      <button class="why-toggle" id="targets-why-toggle" type="button">
        <span>💡 ¿Por qué estos números?</span>
        <span class="chevron">⌄</span>
      </button>
      <div class="why-body"><div class="why-body-inner">${whyParas.map((p) => `<p>${p}</p>`).join("")}</div></div>
    </div>
    <div class="quick-actions">
      <button class="btn" data-goto="plan" type="button">Ver plan semanal</button>
      <button class="btn secondary" data-goto="compra" type="button">Ver lista de la compra</button>
    </div>
  `;
  el.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.goto)));
  bindUpNextCard(el);
  bindTipCard(el);
  bindTodayCard();
  bindLevelChip(el);
  bindProgressCard();
  bindInstallCard();
  document.getElementById("targets-why-toggle").addEventListener("click", () => {
    document.getElementById("targets-why-card").classList.toggle("open");
  });
  el.querySelectorAll("[data-article]").forEach((b) => {
    b.addEventListener("click", () => openArticleSheet(b.dataset.article));
    actLikeButton(b);
  });

  animateCountUp(document.getElementById("ring-kcal-value"), targets.calories);
  animateCountUp(document.getElementById("legend-protein"), targets.protein, { suffix: " g" });
  animateCountUp(document.getElementById("legend-carbs"), targets.carbs, { suffix: " g" });
  animateCountUp(document.getElementById("legend-fat"), targets.fat, { suffix: " g" });
}

function renderAll() {
  renderedDay = todayIso();
  renderDashboard();
  renderPlan();
  renderCompra();
  renderPerfil();
}

/* Si la app se queda abierta de un día para otro (p. ej. instalada en el
   móvil), al volver a ella se pasa al día nuevo: comidas, agua y racha de hoy,
   y el Plan en el día de hoy. */
let renderedDay = todayIso();

function refreshIfNewDay() {
  if (todayIso() === renderedDay) return;
  if (!state.profile || !state.plan) { renderedDay = todayIso(); return; }
  const a = document.activeElement;
  if (a && a.matches && a.matches("input, textarea, select")) return; // no molestar mientras escribe
  selectedDay = todayPlanIndex();
  renderAll();
  // los lunes cambian los artículos de la semana: el puntito de Informes
  // vuelve a salir aunque no estés en esa pestaña
  if (currentView === "informes") renderInformes();
  else updateInformesDot();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshIfNewDay();
});
setInterval(refreshIfNewDay, 60000);

// ---------- Hoy: comidas hechas, agua y racha ----------

const GLASS_ML = 250;
const MEALS_FOR_STREAK = 3; // un día "cuenta" para la racha con 3 de las 4 comidas hechas

function todayPlanIndex() {
  return (new Date().getDay() + 6) % 7; // el plan empieza en lunes
}

function dailyEntry(date = todayIso()) {
  if (!state.daily[date]) state.daily[date] = { eaten: {}, water: 0 };
  return state.daily[date];
}

function waterGoalGlasses() {
  const ml = state.profile.weightKg * 35;
  return Math.min(12, Math.max(6, Math.round(ml / GLASS_ML)));
}

function mealsDone(entry) {
  return entry ? MEAL_SLOTS.filter((s) => entry.eaten[s.key]).length : 0;
}

/* Días seguidos cumpliendo el plan. Hoy suma si ya está cumplido, y si aún
   no lo está la racha de ayer sigue viva hasta que termine el día. */
function currentStreak() {
  let streak = 0;
  const d = new Date();
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  if (mealsDone(state.daily[iso(d)]) >= MEALS_FOR_STREAK) streak++;
  d.setDate(d.getDate() - 1);
  // un día salvado con protector no suma, pero tampoco corta la racha
  while (dayKept(iso(d))) {
    if (mealsDone(state.daily[iso(d)]) >= MEALS_FOR_STREAK) streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ---------- Comidas fuera del plan y reajuste de la semana ----------

/* Raciones normales; el tamaño elegido (poco / normal / mucho) las escala. */
const OFF_PLAN_PRESETS = [
  { id: "hamburguesa", emoji: "🍔", name: "Hamburguesa con patatas", kcal: 1100, prot: 40 },
  { id: "pizza", emoji: "🍕", name: "Pizza", kcal: 900, prot: 35 },
  { id: "menu", emoji: "🍽️", name: "Menú del día", kcal: 950, prot: 40 },
  { id: "bocadillo", emoji: "🥪", name: "Bocadillo", kcal: 600, prot: 25 },
  { id: "ensalada", emoji: "🥗", name: "Ensalada completa", kcal: 450, prot: 20 },
  { id: "sushi", emoji: "🍣", name: "Sushi", kcal: 650, prot: 30 },
  { id: "kebab", emoji: "🌯", name: "Kebab", kcal: 900, prot: 40 },
  { id: "pasta", emoji: "🍝", name: "Pasta de restaurante", kcal: 850, prot: 28 },
  { id: "tapas", emoji: "🍺", name: "Tapas y cañas", kcal: 800, prot: 30 },
  { id: "dulce", emoji: "🍰", name: "Dulce o bollería", kcal: 400, prot: 6 },
];
const OFF_PLAN_SIZES = { poco: { label: "Poco", factor: 0.7 }, normal: { label: "Normal", factor: 1 }, mucho: { label: "Mucho", factor: 1.35 } };
const MAX_DAILY_REBALANCE = 0.2; // como mucho ±20 % de tus calorías en un día

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Fechas (lunes a domingo) de la semana en curso, alineadas con el plan. */
function weekDates() {
  const monday = new Date();
  monday.setDate(monday.getDate() - todayPlanIndex());
  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return isoDate(d);
  });
}

/* Calorías de más (o de menos) que han supuesto esta semana las comidas
   fuera del plan, comparadas con el plato que tocaba. */
function weekOffPlanDelta() {
  const base = currentTargets().calories;
  const dates = weekDates();
  let delta = 0;
  for (let i = 0; i <= todayPlanIndex(); i++) {
    const entry = state.daily[dates[i]];
    if (!entry || !entry.offPlan) continue;
    const factor = dayPortionFactor(state.plan[i], base);
    for (const [slotKey, off] of Object.entries(entry.offPlan)) {
      delta += off.kcal - getRecipeInfo(state.plan[i][slotKey]).kcal * factor;
    }
  }
  return delta;
}

/* Ajuste diario para los días que quedan de semana (después de hoy). */
function weekRebalance() {
  const remaining = DAYS.length - 1 - todayPlanIndex();
  const base = currentTargets().calories;
  const delta = weekOffPlanDelta();
  if (!remaining || Math.abs(delta) < 50) return { perDay: 0, remaining, delta };
  const raw = -delta / remaining;
  const cap = base * MAX_DAILY_REBALANCE;
  return { perDay: Math.round(Math.max(-cap, Math.min(cap, raw)) / 10) * 10, remaining, delta };
}

function dayTargetKcal(dayIdx) {
  const base = currentTargets().calories;
  return dayIdx > todayPlanIndex() ? base + weekRebalance().perDay : base;
}

function weekTargets() {
  return DAYS.map((_, i) => dayTargetKcal(i));
}

function dayFactor(dayIdx) {
  return dayPortionFactor(state.plan[dayIdx], dayTargetKcal(dayIdx));
}

function rebalanceText(perDay) {
  const sign = perDay > 0 ? "+" : "−";
  return `${sign}${Math.abs(perDay)} kcal/día hasta el domingo`;
}

function todayTotals() {
  const day = state.plan[todayPlanIndex()];
  const factor = dayFactor(todayPlanIndex());
  const entry = dailyEntry();
  let kcal = 0, prot = 0;
  for (const slot of MEAL_SLOTS) {
    if (!entry.eaten[slot.key]) continue;
    const off = entry.offPlan && entry.offPlan[slot.key];
    if (off) {
      kcal += off.kcal;
      prot += off.prot;
      continue;
    }
    const info = getRecipeInfo(day[slot.key]);
    kcal += info.kcal * factor;
    prot += info.prot * factor;
  }
  return { kcal, prot };
}

function buzz(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function burstConfetti() {
  if (prefersReducedMotion()) return;
  const colors = ["var(--coral)", "var(--green)", "var(--amber)", "var(--purple)", "var(--rose)"];
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  for (let i = 0; i < 36; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.25}s`;
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 120}px`);
    piece.style.setProperty("--spin", `${Math.random() * 720 - 360}deg`);
    layer.appendChild(piece);
  }
  document.getElementById("app-shell").appendChild(layer);
  setTimeout(() => layer.remove(), 1800);
}

/* Avisa cuando se pierde o vuelve la conexión: la app sigue funcionando con la
   copia guardada, pero así no sorprende que no carguen fotos o súper cercanos. */
window.addEventListener("offline", () => showToast("📴 Sin conexión: sigues con tu plan guardado"));
window.addEventListener("online", () => showToast("📶 Conexión recuperada"));

/* Una tarjeta que se toca (un div con clic) también se usa con teclado y
   lector de pantalla: recibe el foco y se abre con Intro o espacio. */
function actLikeButton(el) {
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.addEventListener("keydown", (e) => {
    if (e.target !== el) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      el.click();
    }
  });
}

/* `action` ({ label, run }) añade un botón al aviso, p. ej. «Deshacer»; el
   aviso dura entonces más, para dar tiempo a tocarlo. */
function showToast(text, action) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status"); // los lectores de pantalla lo leen sin mover el foco
  toast.setAttribute("aria-live", "polite");
  toast.textContent = text;
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => action.run());
    toast.appendChild(btn);
  }
  // tocarlo lo quita al momento
  toast.addEventListener("click", () => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 400);
  });
  document.getElementById("app-shell").appendChild(toast);
  const ms = action ? 5000 : 2400;
  // mientras el ratón está encima o el foco dentro (p. ej. en «Deshacer»), no se va
  let timer = null;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      toast.classList.add("hide");
      timer = setTimeout(() => toast.remove(), 500);
    }, ms);
  };
  const hold = () => { clearTimeout(timer); toast.classList.remove("hide"); };
  const release = () => { if (!toast.matches(":hover") && !toast.contains(document.activeElement)) arm(); };
  toast.addEventListener("mouseenter", hold);
  toast.addEventListener("focusin", hold);
  toast.addEventListener("mouseleave", release);
  toast.addEventListener("focusout", () => setTimeout(release, 0));
  arm();
}

function renderStreakChip() {
  const streak = currentStreak();
  // el lector de pantalla oía «fuego 3 días cubito de hielo por 2»; ahora lo dice en palabras
  const freezes = streakFreezes();
  const label = `Racha: ${streak} ${streak === 1 ? "día seguido" : "días seguidos"}${freezes ? `. Protectores: ${freezes}` : ""}`;
  return `<button type="button" class="streak-chip ${streak ? "active" : ""}" id="streak-chip" aria-label="${label}">🔥 ${streak} ${streak === 1 ? "día" : "días"}${freezeChipHtml()}</button>`;
}

function renderTodayCard() {
  const dayIdx = todayPlanIndex();
  const day = state.plan[dayIdx];
  const entry = dailyEntry();
  const done = mealsDone(entry);
  const rebalance = weekRebalance();
  const glasses = waterGoalGlasses();

  return `
    <div class="today-card" id="today-card">
      <div class="today-head">
        <div>
          <div class="section-kicker">✅ Hoy · ${DAYS[dayIdx]}</div>
          <div class="today-count"><span id="today-done">${done}</span>/${MEAL_SLOTS.length} comidas hechas</div>
        </div>
      </div>
      <div class="today-bars">
        <div class="today-bar">
          <div class="today-bar-label"><span>Calorías</span><span id="today-kcal"></span></div>
          <div class="bar-track"><div class="bar-fill kcal" id="today-kcal-bar"></div></div>
        </div>
        <div class="today-bar">
          <div class="today-bar-label"><span>Proteína</span><span id="today-prot"></span></div>
          <div class="bar-track"><div class="bar-fill prot" id="today-prot-bar"></div></div>
        </div>
      </div>
      <div class="today-meals">
        ${MEAL_SLOTS.map((slot) => {
          const info = getRecipeInfo(day[slot.key]);
          const eaten = !!entry.eaten[slot.key];
          const off = entry.offPlan && entry.offPlan[slot.key];
          return `
            <div class="today-meal ${eaten ? "eaten" : ""} ${off ? "off-plan" : ""}" data-slot="${slot.key}">
              <button type="button" class="today-meal-info" data-open="${slot.key}">
                ${off
                  ? photoHtml(null, { className: "photo-thumb off", fallback: off.emoji })
                  : recipePhoto(info.recipe.id, { width: 120, className: "photo-thumb", fallback: mealEmoji(slot.key) })}
                <span>
                  <span class="today-meal-slot">${slot.label}${off ? " · fuera del plan" : ""}</span>
                  <span class="today-meal-name">${off ? `${off.name} · ${off.kcal} kcal` : info.recipe.name}</span>
                </span>
              </button>
              <button type="button" class="off-btn" data-off="${slot.key}" aria-label="Comí otra cosa en ${slot.key === "desayuno" ? "el" : "la"} ${slot.label.toLowerCase()}">✏️</button>
              <button type="button" class="eat-btn" data-eat="${slot.key}" aria-pressed="${eaten}" aria-label="Ya tomé ${slot.key === "desayuno" ? "el" : "la"} ${slot.label.toLowerCase()}">${eaten ? "✓" : ""}</button>
            </div>`;
        }).join("")}
      </div>
      <p class="hint off-hint">${rebalance.perDay
        ? `🔄 Semana reajustada por comidas fuera del plan: <b>${rebalanceText(rebalance.perDay)}</b>.`
        : "¿Comiste otra cosa? Pulsa ✏️ y reajustamos el resto de tu semana."}</p>
      <div class="water-row">
        <div class="today-bar-label"><span>💧 Agua</span><span id="water-count" class="${entry.water >= glasses ? "met" : ""}">${entry.water}/${glasses} vasos</span></div>
        <div class="water-glasses">
          ${Array.from({ length: glasses }, (_, i) => `<button type="button" class="glass ${i < entry.water ? "full" : ""}" style="--i:${i}" data-glass="${i + 1}" aria-label="${i === 0 ? "1 vaso" : `${i + 1} vasos`}" aria-pressed="${i < entry.water}"></button>`).join("")}
        </div>
      </div>
    </div>`;
}

function updateTodayProgress(animate = true) {
  const targets = currentTargets();
  const { kcal, prot } = todayTotals();
  const kcalPct = Math.min(100, (kcal / targets.calories) * 100);
  const protPct = Math.min(100, (prot / targets.protein) * 100);
  // si te pasas de calorías, la barra cambia de color y dice cuánto («+180»)
  const over = Math.round(kcal - targets.calories);
  const isOver = over > targets.calories * 0.05;
  document.getElementById("today-kcal").textContent = `${Math.round(kcal)} / ${targets.calories} kcal${isOver ? ` · +${over}` : ""}`;
  document.getElementById("today-kcal").classList.toggle("over", isOver);
  document.getElementById("today-kcal-bar").classList.toggle("over", isOver);
  // proteína cumplida: la barra se pone verde, sale un ✓ y da un saltito la primera vez
  const protEl = document.getElementById("today-prot");
  const protMet = prot >= targets.protein;
  const justMet = protMet && protEl.dataset.met === "false";
  protEl.dataset.met = String(protMet);
  protEl.textContent = `${Math.round(prot)} / ${targets.protein} g${protMet ? " ✓" : ""}`;
  protEl.classList.toggle("met", protMet);
  document.getElementById("today-prot-bar").classList.toggle("met", protMet);
  if (justMet) {
    protEl.classList.remove("pop");
    void protEl.offsetWidth;
    protEl.classList.add("pop");
  }
  const set = () => {
    document.getElementById("today-kcal-bar").style.width = `${kcalPct}%`;
    document.getElementById("today-prot-bar").style.width = `${protPct}%`;
  };
  if (animate) requestAnimationFrame(() => requestAnimationFrame(set)); else set();
  // el contador de comidas «rueda»: el número nuevo entra desde abajo al subir y desde arriba al bajar
  const doneEl = document.getElementById("today-done");
  const prev = Number(doneEl.textContent);
  const now = mealsDone(dailyEntry());
  doneEl.textContent = now;
  if (now !== prev && !prefersReducedMotion()) {
    doneEl.classList.remove("roll-up", "roll-down");
    void doneEl.offsetWidth;
    doneEl.classList.add(now > prev ? "roll-up" : "roll-down");
  }
}

function bindTodayCard() {
  const card = document.getElementById("today-card");
  updateTodayProgress();

  card.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = dailyEntry();
      if (entry.offPlan && entry.offPlan[btn.dataset.open]) openOffPlanSheet(btn.dataset.open);
      else openRecipeSheet(todayPlanIndex(), btn.dataset.open);
    });
  });

  card.querySelectorAll("[data-eat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = dailyEntry();
      const slotKey = btn.dataset.eat;
      const wasComplete = mealsDone(entry) >= MEALS_FOR_STREAK;
      entry.eaten[slotKey] = !entry.eaten[slotKey];
      const eaten = entry.eaten[slotKey];
      if (!eaten && entry.offPlan && entry.offPlan[slotKey]) {
        delete entry.offPlan[slotKey];
        saveState();
        renderAll();
        return;
      }
      saveState();
      buzz(eaten ? 15 : 8);

      btn.textContent = eaten ? "✓" : "";
      btn.setAttribute("aria-pressed", eaten);
      btn.closest(".today-meal").classList.toggle("eaten", eaten);
      if (eaten) {
        btn.classList.remove("pop");
        void btn.offsetWidth;
        btn.classList.add("pop");
        track("comida-marcada");
        engage.mealEaten(slotKey, btn);
      }
      updateTodayProgress(false);
      refreshUpNext();
      renderPlanDays();

      const nowComplete = mealsDone(entry) >= MEALS_FOR_STREAK;
      document.getElementById("streak-chip").outerHTML = renderStreakChip();
      if (eaten && mealsDone(entry) === MEAL_SLOTS.length) {
        burstConfetti();
        showToast(`¡Día completado! 🔥 Llevas ${currentStreak()} ${currentStreak() === 1 ? "día seguido" : "días seguidos"}`);
        track("dia-completado");
      } else if (eaten && nowComplete && !wasComplete) {
        const chip = document.getElementById("streak-chip");
        chip.classList.add("pop");
        showToast(`🔥 Racha de ${currentStreak()} ${currentStreak() === 1 ? "día" : "días"}. ¡Sigue así!`);
      }
    });
  });

  card.querySelectorAll("[data-off]").forEach((btn) => {
    btn.addEventListener("click", () => openOffPlanSheet(btn.dataset.off));
  });

  card.querySelectorAll("[data-glass]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = dailyEntry();
      const n = Number(btn.dataset.glass);
      entry.water = entry.water === n ? n - 1 : n; // tocar el último vaso lleno lo vacía
      saveState();
      buzz(8);
      const goal = waterGoalGlasses();
      card.querySelectorAll("[data-glass]").forEach((g) => {
        const full = Number(g.dataset.glass) <= entry.water;
        g.classList.toggle("full", full);
        g.setAttribute("aria-pressed", String(full)); // el lector de pantalla dice si el vaso está lleno
      });
      btn.classList.remove("pop");
      void btn.offsetWidth;
      btn.classList.add("pop");
      const count = document.getElementById("water-count");
      count.textContent = `${entry.water}/${goal} vasos`;
      count.classList.toggle("met", entry.water >= goal);
      // al llenar el último vaso, los vasos hacen una ola de izquierda a derecha
      const row = card.querySelector(".water-glasses");
      row.classList.remove("wave");
      if (entry.water === goal && n === goal && !prefersReducedMotion()) {
        void row.offsetWidth;
        row.classList.add("wave");
      }
      track("agua");
      engage.water(entry.water === n, entry.water === goal && n === goal, btn);
      if (entry.water === goal && n === goal) showToast("💧 ¡Objetivo de agua cumplido!");
    });
  });
}

function openOffPlanSheet(slotKey) {
  const slot = MEAL_SLOTS.find((s) => s.key === slotKey);
  const entry = dailyEntry();
  const existing = entry.offPlan && entry.offPlan[slotKey];
  let selected = existing ? existing.presetId : null;
  let size = existing ? existing.size : "normal";
  const body = document.getElementById("sheet-body");

  body.innerHTML = `
    <span class="tag tag-amber">${mealEmoji(slotKey)} ${slot.label} de hoy</span>
    <h3>¿Qué has comido?</h3>
    <p class="hint">Elige lo más parecido. Reajustamos el resto de tu semana para que sigas en tu objetivo.</p>
    <div class="off-grid">
      ${OFF_PLAN_PRESETS.map((p) => `
        <button type="button" class="off-option" data-preset="${p.id}">
          <span class="off-emoji">${p.emoji}</span>
          <span class="off-name">${p.name}</span>
          <span class="off-kcal">~${p.kcal} kcal</span>
        </button>`).join("")}
      <button type="button" class="off-option" data-preset="otro">
        <span class="off-emoji">✍️</span>
        <span class="off-name">Otra cosa</span>
        <span class="off-kcal">Tú pones las kcal</span>
      </button>
    </div>
    <div class="off-custom hidden" id="off-custom">
      <input type="text" id="off-custom-name" placeholder="¿Qué era? (opcional)" aria-label="¿Qué era? (opcional)" maxlength="40">
      <input type="number" id="off-custom-kcal" inputmode="numeric" min="50" max="3000" placeholder="kcal aprox." aria-label="kcal aprox.">
    </div>
    <div class="section-kicker off-size-kicker">¿Cuánto?</div>
    <div class="size-row" role="group" aria-label="¿Cuánto?">
      ${Object.entries(OFF_PLAN_SIZES).map(([k, v]) => `<button type="button" class="size-chip" data-size="${k}">${v.label}</button>`).join("")}
    </div>
    <button type="button" class="btn block" id="off-save" disabled>Guardar y reajustar</button>
    ${existing ? `<button type="button" class="btn ghost block off-undo" id="off-undo">Al final comí lo del plan</button>` : ""}
  `;

  const sync = () => {
    // aria-pressed: el lector de pantalla dice qué opción y qué tamaño están elegidos
    body.querySelectorAll(".off-option").forEach((b) => {
      const on = b.dataset.preset === selected;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-pressed", String(on));
    });
    body.querySelectorAll(".size-chip").forEach((b) => {
      const on = b.dataset.size === size;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-pressed", String(on));
    });
    document.getElementById("off-custom").classList.toggle("hidden", selected !== "otro");
    document.getElementById("off-save").disabled = !selected;
  };
  if (existing && existing.presetId === "otro") {
    document.getElementById("off-custom-name").value = existing.name === "Otra cosa" ? "" : existing.name;
    document.getElementById("off-custom-kcal").value = existing.baseKcal;
  }
  body.querySelectorAll(".off-option").forEach((b) => b.addEventListener("click", () => {
    selected = b.dataset.preset;
    buzz(8);
    sync();
    if (selected === "otro") document.getElementById("off-custom-kcal").focus();
  }));
  body.querySelectorAll(".size-chip").forEach((b) => b.addEventListener("click", () => {
    size = b.dataset.size;
    buzz(8);
    sync();
  }));
  sync();

  document.getElementById("off-save").addEventListener("click", () => {
    let preset;
    if (selected === "otro") {
      const kcalInput = document.getElementById("off-custom-kcal");
      const baseKcal = Number(kcalInput.value);
      if (!(baseKcal >= 50 && baseKcal <= 3000)) {
        kcalInput.reportValidity();
        kcalInput.focus();
        return;
      }
      const name = document.getElementById("off-custom-name").value.trim() || "Otra cosa";
      preset = { id: "otro", emoji: "🍴", name, kcal: baseKcal, prot: Math.round((baseKcal * 0.15) / 4) };
    } else {
      preset = OFF_PLAN_PRESETS.find((p) => p.id === selected);
    }
    const f = OFF_PLAN_SIZES[size].factor;
    if (!entry.offPlan) entry.offPlan = {};
    entry.offPlan[slotKey] = {
      presetId: preset.id, size, emoji: preset.emoji, name: preset.name, baseKcal: preset.kcal,
      kcal: Math.round(preset.kcal * f), prot: Math.round(preset.prot * f),
    };
    entry.eaten[slotKey] = true;
    saveState();
    track(`fuera-del-plan-${preset.id}`);
    engage.offPlan();
    closeSheet();
    renderAll();
    const { perDay, remaining } = weekRebalance();
    showToast(perDay
      ? `🔄 Semana reajustada: ${rebalanceText(perDay)}`
      : remaining ? "✅ Anotado. ¡Casi igual que tu plan!" : "✅ Anotado. La semana que viene empezamos de cero");
  });

  const undo = document.getElementById("off-undo");
  if (undo) undo.addEventListener("click", () => {
    delete entry.offPlan[slotKey];
    saveState();
    closeSheet();
    renderAll();
    showToast("↩️ Vuelto al plato del plan");
  });

  openSheet();
}

// ---------- Progreso de peso ----------

function logWeight(kg) {
  const log = state.weightLog;
  const last = log[log.length - 1];
  const today = todayIso();
  if (last && last.date === today) {
    last.kg = kg;
  } else if (!last || last.kg !== kg) {
    log.push({ date: today, kg });
  }
}

function buildWeightSparkline(log) {
  const points = log.slice(-12);
  if (points.length < 2) return "";
  const w = 280, h = 56, pad = 6;
  const kgs = points.map((p) => p.kg);
  const min = Math.min(...kgs), max = Math.max(...kgs);
  const span = max - min || 1;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (p.kg - min) / span) * (h - pad * 2);
    return [x.toFixed(1), y.toFixed(1)];
  });
  const [lx, ly] = coords[coords.length - 1];
  return `
    <svg class="weight-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${coords.map((c) => c.join(",")).join(" ")}" />
      <circle cx="${lx}" cy="${ly}" r="4" />
    </svg>`;
}

function renderProgressCard() {
  const log = state.weightLog;
  const last = log[log.length - 1];
  const first = log[0];
  const daysSince = last ? daysBetween(last.date, todayIso()) : Infinity;
  const due = daysSince >= WEIGH_IN_EVERY_DAYS;
  const suggestion = suggestCalorieAdjustment(state.profile, log);
  const coolingDown = state.adjustDecisionAt && daysBetween(state.adjustDecisionAt, todayIso()) < ADJUST_COOLDOWN_DAYS;

  let adviceHtml;
  if (suggestion && suggestion.status !== "ok" && !coolingDown) {
    adviceHtml = `
      <div class="adjust-box">
        <div class="adjust-title">Ajuste recomendado: ${suggestion.kcal > 0 ? "+" : ""}${suggestion.kcal} kcal/día</div>
        <p>${explainAdjustment(state.profile, suggestion)}</p>
        <div class="adjust-actions">
          <button type="button" class="btn ghost small" id="adjust-dismiss-btn">Ahora no</button>
          <button type="button" class="btn small" id="adjust-apply-btn">Aplicar ajuste</button>
        </div>
      </div>`;
  } else if (suggestion && suggestion.status === "ok") {
    adviceHtml = `<p class="hint">✅ ${explainAdjustment(state.profile, suggestion)}</p>`;
  } else {
    adviceHtml = `<p class="hint">⚖️ Pésate 1 vez por semana, en ayunas.</p>`;
  }

  const change = last && first && last !== first ? last.kg - first.kg : null;
  return `
    <div class="progress-card">
      <div class="progress-head">
        <div>
          <div class="section-kicker">⚖️ Tu progreso</div>
          <div class="progress-weight">${last ? last.kg.toString().replace(".", ",") : state.profile.weightKg} kg
            ${change !== null ? `<span class="progress-change">${change > 0 ? "+" : ""}${change.toFixed(1).replace(".", ",")} kg desde el inicio</span>` : ""}
          </div>
        </div>
        ${due && last ? `<span class="due-badge">Toca pesarte</span>` : ""}
      </div>
      ${buildWeightSparkline(log)}
      <form class="weigh-form" id="weigh-form">
        <input type="number" inputmode="decimal" step="0.1" min="30" max="300" name="kg" placeholder="Peso de hoy (kg)" required>
        <button type="submit" class="btn small">Guardar</button>
      </form>
      ${adviceHtml}
    </div>`;
}

function bindProgressCard() {
  document.getElementById("weigh-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = e.target.kg;
    const kg = Math.round(Number(String(input.value).replace(",", ".")) * 10) / 10;
    if (!(kg >= 30 && kg <= 300)) {
      input.reportValidity();
      return;
    }
    logWeight(kg);
    state.profile.weightKg = kg;
    saveState();
    track("peso-registrado");
    engage.weighed(e.target.querySelector("button"));
    renderAll();
  });
  const apply = document.getElementById("adjust-apply-btn");
  if (apply) {
    apply.addEventListener("click", () => {
      const suggestion = suggestCalorieAdjustment(state.profile, state.weightLog);
      state.calorieAdjust = Math.max(-600, Math.min(600, state.calorieAdjust + suggestion.kcal));
      state.adjustDecisionAt = todayIso();
      saveState();
      track("ajuste-aplicado");
      renderAll();
    });
    document.getElementById("adjust-dismiss-btn").addEventListener("click", () => {
      state.adjustDecisionAt = todayIso();
      saveState();
      track("ajuste-rechazado");
      renderDashboard();
    });
  }
}

// ---------- Instalar como app ----------

let deferredInstallPrompt = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function renderInstallCard() {
  if (isStandalone() || state.installDismissed) return "";
  let text, action = "";
  if (deferredInstallPrompt) {
    text = "Instala NutriPlan en tu móvil para abrirla como una app más, incluso sin conexión.";
    action = `<button type="button" class="btn small" id="install-btn">Instalar</button>`;
  } else if (isIos()) {
    text = "Añádela a tu pantalla de inicio: en Safari pulsa <b>Compartir</b> y luego <b>Añadir a pantalla de inicio</b>.";
  } else {
    return "";
  }
  return `
    <div class="install-card">
      <div class="install-icon">📲</div>
      <p>${text}</p>
      <div class="install-actions">
        <button type="button" class="btn ghost small" id="install-dismiss-btn">Ahora no</button>
        ${action}
      </div>
    </div>`;
}

function bindInstallCard() {
  const dismiss = document.getElementById("install-dismiss-btn");
  if (!dismiss) return;
  dismiss.addEventListener("click", () => {
    state.installDismissed = true;
    saveState();
    renderDashboard();
  });
  const install = document.getElementById("install-btn");
  if (install) {
    install.addEventListener("click", async () => {
      const prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      track(outcome === "accepted" ? "instalar-aceptado" : "instalar-rechazado");
      renderDashboard();
    });
  }
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (state.profile && state.plan) renderDashboard();
});

window.addEventListener("appinstalled", () => track("app-instalada"));

// ---------- Plan semanal ----------

function mealEmoji(slotKey) {
  return { desayuno: "☀️", comida: "🍽️", cena: "🌙", merienda: "🍎" }[slotKey] || "🍽️";
}

/* Si el día elegido queda fuera de la fila de días (p. ej. el domingo en un
   móvil estrecho), la fila se desplaza hasta él. */
/* Al cambiar de día (tocando, con las flechas o deslizando), la fila se
   desliza con suavidad hasta la pastilla nueva en vez de saltar de golpe.
   Al dibujar el Plan, y con «reducir movimiento», va directa. */
function centerActiveDay(smooth = false) {
  const dayTabs = document.getElementById("day-tabs");
  const pill = dayTabs && dayTabs.querySelector(".day-pill.active");
  if (!pill || dayTabs.scrollWidth <= dayTabs.clientWidth) return;
  const left = pill.offsetLeft - dayTabs.offsetLeft - (dayTabs.clientWidth - pill.offsetWidth) / 2;
  dayTabs.scrollTo({ left, behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
}

function renderPlan() {
  const dayTabs = document.getElementById("day-tabs");
  const today = todayPlanIndex();
  dayTabs.innerHTML = DAYS.map((d, i) => `<button type="button" class="day-pill ${i === selectedDay ? "active" : ""} ${i === today ? "today" : ""}" data-day="${i}" aria-pressed="${i === selectedDay}" aria-label="${i === today ? `${d} (hoy)` : d}">${d.slice(0, 3)}</button>`).join("");
  centerActiveDay();
  dayTabs.querySelectorAll(".day-pill").forEach((btn) => {
    btn.addEventListener("click", () => selectPlanDay(Number(btn.dataset.day)));
    // con teclado, ← y → pasan de día (Inicio y Fin van al lunes y al domingo)
    btn.addEventListener("keydown", (e) => {
      const to = { ArrowLeft: selectedDay - 1, ArrowRight: selectedDay + 1, Home: 0, End: DAYS.length - 1 }[e.key];
      if (to === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      selectPlanDay(Math.max(0, Math.min(DAYS.length - 1, to)));
      const pill = dayTabs.querySelector(`.day-pill[data-day="${selectedDay}"]`);
      if (pill) pill.focus({ preventScroll: true }); // la fila ya se desliza sola hasta ella
    });
  });
  renderPlanDays();
}

/* Cambia el día del Plan; el día nuevo entra desde el lado hacia el que vas. */
function selectPlanDay(day) {
  if (day < 0 || day >= DAYS.length || day === selectedDay) return;
  const dir = day > selectedDay ? "day-from-right" : "day-from-left";
  selectedDay = day;
  document.querySelectorAll("#day-tabs .day-pill").forEach((b) => {
    const on = Number(b.dataset.day) === day;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on)); // el lector de pantalla dice qué día ves
  });
  document.querySelectorAll(".day-panel").forEach((p) => {
    const on = Number(p.dataset.day) === day;
    p.classList.remove("day-from-right", "day-from-left");
    p.classList.toggle("active", on);
    if (on) p.classList.add(dir);
  });
  centerActiveDay(true);
}

/* En el móvil, deslizar el plan a los lados pasa al día anterior o siguiente. */
function bindPlanSwipe() {
  const el = document.getElementById("plan-content");
  let x0 = null, y0 = 0;
  el.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // era scroll, no un deslizamiento
    selectPlanDay(selectedDay + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

function renderPlanDays() {
  const el = document.getElementById("plan-content");
  const { perDay } = weekRebalance();
  const today = todayPlanIndex();
  const offToday = (dailyEntry().offPlan) || {};
  const eatenToday = dailyEntry().eaten || {};
  el.innerHTML = DAYS.map((day, i) => {
    const factor = dayFactor(i);
    const chip = perDay && i > today
      ? `<div class="rebalance-chip ${perDay < 0 ? "down" : "up"}">🔄 Raciones reajustadas: ${perDay > 0 ? "+" : "−"}${Math.abs(perDay)} kcal por lo que comiste fuera</div>`
      : "";
    // al pie de cada día, lo que suman sus comidas
    let dayKcal = 0, dayCost = 0, dayMins = 0;
    const meals = MEAL_SLOTS.map((slot) => {
        const off = i === today && offToday[slot.key];
        if (off) {
          dayKcal += off.kcal;
          return `
          <div class="meal-card off-plan" data-day="${i}" data-slot="${slot.key}" data-off="1">
            <div class="photo photo-thumb big off"><span class="photo-fallback" aria-hidden="true">${off.emoji}</span></div>
            <div class="meal-info">
              <div class="slot-label">${slot.label} · fuera del plan</div>
              <div class="recipe-name">${off.name}</div>
              <div class="kcal">${off.kcal} kcal</div>
            </div>
            <div class="chevron-right" aria-hidden="true">›</div>
          </div>`;
        }
        const info = getRecipeInfo(state.plan[i][slot.key]);
        // las comidas de hoy que ya marcaste salen con «✓ Hecha» y un poco atenuadas
        const done = i === today && eatenToday[slot.key];
        dayKcal += Math.round(info.kcal * factor);
        dayCost += info.cost * factor;
        dayMins += recipeCookMins(info.recipe);
        return `
          <div class="meal-card ${done ? "done" : ""}" data-day="${i}" data-slot="${slot.key}">
            ${recipePhoto(info.recipe.id, { width: 160, className: `photo-thumb big ${slot.key}`, fallback: mealEmoji(slot.key) })}
            <div class="meal-info">
              <div class="slot-label">${slot.label}${isFavorite(info.recipe.id) ? ` <span class="fav-mark" aria-label="Favorita">❤️</span>` : ""}${done ? ` <span class="done-mark">Hecha</span>` : ""}</div>
              <div class="recipe-name">${info.recipe.name}</div>
              <div class="kcal">${Math.round(info.kcal * factor)} kcal · ${euro(info.cost * factor)} €${recipeCookMins(info.recipe) ? ` · ⏱\u00a0${recipeCookMins(info.recipe)}\u00a0min` : ""}</div>
            </div>
            <div class="chevron-right" aria-hidden="true">›</div>
          </div>`;
      }).join("");
    return `
    <div class="day-panel ${i === selectedDay ? "active" : ""}" data-day="${i}">
      ${chip}
      ${meals}
      <div class="day-total"><span>Total del día</span><span class="day-total-num">${dayKcal} kcal · ${euro(dayCost)} €${dayMins ? ` · ⏱\u00a0${dayMins}\u00a0min` : ""}</span></div>
    </div>
  `;
  }).join("");

  el.querySelectorAll(".meal-card").forEach((card) => {
    card.addEventListener("click", () => {
      const day = Number(card.dataset.day);
      const slotKey = card.dataset.slot;
      if (card.dataset.off) openOffPlanSheet(slotKey);
      else openRecipeSheet(day, slotKey);
    });
    actLikeButton(card);
  });
}

// etiquetas de la receta con tildes, en vez del identificador interno
const TAG_LABEL = {
  vegetariano: "vegetariano", vegano: "vegano", alto_proteina: "alto en proteína", sin_gluten: "sin gluten", economico: "económico",
};

const TAG_COLOR_CLASS = {
  vegetariano: "", vegano: "", alto_proteina: "tag-rose", sin_gluten: "tag-amber", economico: "tag-purple",
};

// los minutos que dicen los pasos («cocina 8-10 minutos»), para saber de un vistazo cuánto lleva;
// un paso que va «los últimos 12 minutos» («the last 12 minutes») de otro ya está dentro de ese tiempo
function recipeCookMins(r) {
  return r.steps.reduce((sum, step) => sum + (/\s(últimos|last)\s/i.test(step) ? 0 : stepMinutes(step)), 0);
}

function openRecipeSheet(dayIdx, slotKey) {
  const slotLabel = MEAL_SLOTS.find((s) => s.key === slotKey).label;
  const info = getRecipeInfo(state.plan[dayIdx][slotKey]);
  const r = info.recipe;
  const factor = dayFactor(dayIdx);
  const whySentences = explainRecipe(r, info, state.profile, slotLabel);
  const cookMins = recipeCookMins(r);
  const body = document.getElementById("sheet-body");
  track("receta-vista");
  body.innerHTML = `
    ${recipePhoto(r.id, { width: 700, className: "photo-hero", fallback: mealEmoji(slotKey), eager: true })}
    ${favButtonHtml(r.id)}
    ${shareButtonHtml(r.id)}
    <h3>${r.name}</h3>
    <div class="modal-tags">${r.tags.map((t) => `<span class="tag ${TAG_COLOR_CLASS[t] || ""}">${TAG_LABEL[t] || t.replace("_", " ")}</span>`).join("")}</div>
    <div class="macro-tiles">
      <div class="macro-tile kcal"><b>${Math.round(info.kcal * factor)}</b><span>🔥 kcal</span></div>
      <div class="macro-tile prot"><b>${Math.round(info.prot * factor)} g</b><span>🍗 prot</span></div>
      <div class="macro-tile carbs"><b>${Math.round(info.carbs * factor)} g</b><span>🌾 hidratos</span></div>
      <div class="macro-tile fat"><b>${Math.round(info.fat * factor)} g</b><span>🥑 grasa</span></div>
      <div class="macro-tile cost"><b>${euroLabel(info.cost * factor)}</b><span>🛒 coste</span></div>
    </div>
    <button type="button" class="btn block cook-open-btn" id="cook-open-btn">👩‍🍳 Cocinar paso a paso</button>
    <button type="button" class="btn secondary block swap-open-btn" id="swap-open-btn">🔄 Cambiar por otro plato</button>
    <div class="why-block why-short"><p>💡 ${whySentences[0]}</p></div>
    <div class="sheet-section">
      <h4>Ingredientes (tu ración)</h4>
      <p class="hint ing-tip">Toca cada ingrediente cuando lo tengas a mano.</p>
      ${Math.abs(factor - 1) >= 0.05 ? `<p class="hint portion-hint">Cantidades ajustadas a tus calorías (×${localDecimal(factor.toFixed(2))} la ración estándar).</p>` : ""}
      ${r.ingredients.map(([id, qty]) => {
        const food = FOODS[id];
        const role = FOOD_ROLES[food.cat];
        return `
          <div class="ingredient-row">
            <span class="ing-emoji" aria-hidden="true">${FOOD_EMOJI[id] || FOOD_ROLE_EMOJI[food.cat] || "•"}</span>
            <div class="ing-text"><span class="ing-name">${food.name}</span><span class="ing-role">${role.label}</span></div>
            <div class="ing-qty">${formatQty(qty * factor, food.unit)}</div>
          </div>`;
      }).join("")}
    </div>
    <div class="sheet-section">
      <h4>Preparación${cookMins ? ` <span class="prep-time">⏱ ${cookMins} min de cocción</span>` : ""}</h4>
      <p class="hint steps-tip">Toca cada paso al terminarlo.</p>
      <ol class="steps-list">${r.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    </div>
  `;
  document.getElementById("swap-open-btn").addEventListener("click", () => openSwapSheet(dayIdx, slotKey));
  document.getElementById("cook-open-btn").addEventListener("click", () => openCookMode(dayIdx, slotKey));
  // preparar la cocina: tachar los ingredientes que ya tienes a mano (solo
  // mientras la receta está abierta, no se guarda)
  body.querySelectorAll(".ingredient-row").forEach((row) => {
    actLikeButton(row);
    row.setAttribute("role", "checkbox");
    row.setAttribute("aria-checked", "false");
    row.addEventListener("click", () => {
      const on = row.classList.toggle("got");
      row.setAttribute("aria-checked", String(on));
      if (on) buzz(8);
      // con todo a mano, la pista de arriba lo celebra y anima a cocinar
      const tip = body.querySelector(".ing-tip");
      const rows = body.querySelectorAll(".ingredient-row");
      const all = [...rows].every((x) => x.classList.contains("got"));
      if (all !== tip.classList.contains("all-got")) {
        tip.classList.toggle("all-got", all);
        tip.textContent = all ? "✓ Todo a mano. ¡A cocinar!" : "Toca cada ingrediente cuando lo tengas a mano.";
      }
    });
  });
  // cocinar sin el modo cocina: tachar cada paso al terminarlo, para no perderse
  // al volver a la receta (solo mientras está abierta, no se guarda)
  body.querySelectorAll(".steps-list li").forEach((li) => {
    actLikeButton(li);
    li.setAttribute("role", "checkbox");
    li.setAttribute("aria-checked", "false");
    li.addEventListener("click", () => {
      const on = li.classList.toggle("done");
      li.setAttribute("aria-checked", String(on));
      if (on) buzz(8);
      // con todos los pasos tachados, la pista de arriba lo celebra
      const tip = body.querySelector(".steps-tip");
      const all = [...body.querySelectorAll(".steps-list li")].every((x) => x.classList.contains("done"));
      if (all !== tip.classList.contains("all-got")) {
        tip.classList.toggle("all-got", all);
        tip.textContent = all ? "✓ Receta terminada. ¡Que aproveche!" : "Toca cada paso al terminarlo.";
        if (all) buzz([10, 40, 10]);
      }
    });
  });
  bindFavButtons(body);
  bindShareRecipe(body, factor);
  openSheet();
}

const FOOD_ROLE_EMOJI = {
  proteina_magra: "🍗", proteina_grasa: "🥩", carbohidrato: "🌾", legumbre: "🫘", verdura: "🥦",
  fruta: "🍎", grasa_saludable: "🥑", lacteo: "🥛", condimento: "🧂",
};

function openSwapSheet(dayIdx, slotKey) {
  const slotLabel = MEAL_SLOTS.find((s) => s.key === slotKey).label;
  const currentId = state.plan[dayIdx][slotKey];
  const factor = dayFactor(dayIdx);
  // lo que tiene el plato de ahora, para comparar de un vistazo con cada opción
  const current = getRecipeInfo(currentId);
  const options = swapAlternatives(currentId, state.profile)
    .sort((a, b) => isFavorite(b.recipe.id) - isFavorite(a.recipe.id));
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <span class="tag">${slotLabel} · ${DAYS[dayIdx]}</span>
    <h3>Cambiar ${getRecipeInfo(currentId).recipe.name.toLowerCase()}</h3>
    <p class="hint">Mismo tipo de plato, macros parecidos. La ración se ajusta sola.</p>
    <p class="swap-current">Ahora: ${Math.round(current.prot * factor)} g prot · ${euro(current.cost * factor)} €${recipeCookMins(current.recipe) ? ` · ⏱\u00a0${recipeCookMins(current.recipe)}\u00a0min` : ""}</p>
    ${options.length ? `<div class="swap-list">
      ${options.map((info) => `
        <button type="button" class="swap-option" data-recipe="${info.recipe.id}">
          ${recipePhoto(info.recipe.id, { width: 120, className: "photo-thumb", fallback: mealEmoji(slotKey) })}
          <span class="swap-text"><span class="swap-name">${isFavorite(info.recipe.id) ? "❤️ " : ""}${info.recipe.name}</span>
          <span class="swap-meta">${Math.round(info.prot * factor)} g prot · ${euro(info.cost * factor)} €${recipeCookMins(info.recipe) ? ` · ⏱ ${recipeCookMins(info.recipe)} min` : ""}</span></span>
        </button>`).join("")}
    </div>` : `<p class="hint">No hay otros platos de este tipo que encajen con tu dieta y tus gustos.</p>`}
    <button type="button" class="btn ghost block" id="swap-back-btn">Volver a la receta</button>
  `;
  body.querySelectorAll(".swap-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const previousId = state.plan[dayIdx][slotKey];
      const newId = btn.dataset.recipe;
      state.plan[dayIdx][slotKey] = newId;
      saveState();
      track("plato-cambiado");
      engage.swapped();
      renderPlanDays();
      renderDashboard();
      renderCompra();
      openRecipeSheet(dayIdx, slotKey);
      // por si te equivocas de plato: «Deshacer» vuelve a dejar el que tenías
      showToast("🔄 Plato cambiado", {
        label: "Deshacer",
        run: () => {
          if (state.plan[dayIdx][slotKey] !== newId) return;
          state.plan[dayIdx][slotKey] = previousId;
          saveState();
          renderPlanDays();
          renderDashboard();
          renderCompra();
          // si sigues viendo la receta nueva, la hoja pasa a la de antes
          if (sheetIsOpen() && document.querySelector(`#sheet-body #cook-open-btn`) && document.querySelector(`#sheet-body .fav-btn[data-fav="${newId}"]`)) openRecipeSheet(dayIdx, slotKey);
        },
      });
    });
  });
  document.getElementById("swap-back-btn").addEventListener("click", () => openRecipeSheet(dayIdx, slotKey));
}

let sheetCloseTimer = null;

/* La hoja se apunta en el historial: el botón «atrás» del móvil (o Esc)
   la cierra en vez de salir de la app. */
let sheetInHistory = false;   // hay una entrada nuestra en el historial
let ignoreNextPop = false;    // el próximo popstate lo provocamos nosotros
let repushAfterPop = false;   // se reabrió la hoja mientras volvíamos atrás

function sheetIsOpen() {
  const sheet = document.getElementById("recipe-sheet");
  return !sheet.classList.contains("hidden") && !sheet.classList.contains("closing");
}

/* Foco: al abrir la hoja pasa a la ✕ y al cerrarla vuelve a lo que la abrió,
   así quien usa teclado o lector de pantalla no se queda perdido detrás. */
let sheetOpener = null;

function openSheet() {
  clearTimeout(sheetCloseTimer);
  const sheet = document.getElementById("recipe-sheet");
  const card = sheet.querySelector(".sheet-card");
  const wasClosed = sheet.classList.contains("hidden") || sheet.classList.contains("closing");
  if (wasClosed && !sheet.contains(document.activeElement)) sheetOpener = document.activeElement;
  sheet.classList.remove("hidden", "closing", "dragged");
  sheet.querySelector(".sheet-backdrop").style.opacity = "";
  card.style.transform = "";
  card.scrollTop = 0;
  try { document.getElementById("sheet-close").focus({ preventScroll: true }); } catch (e) { /* sin foco */ }
  if (ignoreNextPop) repushAfterPop = true;
  else if (!sheetInHistory) {
    try { history.pushState({ nutriSheet: true }, ""); sheetInHistory = true; } catch (e) { /* sin historial */ }
  }
}

function closeSheet(fromHistory = false) {
  const sheet = document.getElementById("recipe-sheet");
  if (sheet.classList.contains("hidden")) return;
  if (sheetInHistory && fromHistory !== true) {
    sheetInHistory = false;
    ignoreNextPop = true;
    history.back();
  }
  if (fromHistory === true) sheetInHistory = false;
  sheet.classList.add("closing");
  sheetCloseTimer = setTimeout(() => {
    sheet.classList.add("hidden");
    sheet.classList.remove("closing", "dragged");
    sheet.querySelector(".sheet-card").style.transform = "";
    sheet.querySelector(".sheet-backdrop").style.opacity = "";
    const opener = sheetOpener;
    sheetOpener = null;
    // solo si sigue en pantalla y nadie ha movido el foco a otro sitio
    if (opener && opener.isConnected && opener.offsetParent && opener !== document.body &&
        (sheet.contains(document.activeElement) || document.activeElement === document.body)) {
      try { opener.focus({ preventScroll: true }); } catch (e) { /* sin foco */ }
    }
  }, prefersReducedMotion() ? 0 : 220);
}

window.addEventListener("popstate", () => {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    if (repushAfterPop) {
      repushAfterPop = false;
      if (sheetIsOpen()) {
        try { history.pushState({ nutriSheet: true }, ""); sheetInHistory = true; } catch (e) { /* sin historial */ }
      }
    }
    return;
  }
  // Con el modo cocina abierto, «atrás» cierra solo el modo cocina y deja la receta
  if (typeof cook !== "undefined" && cook) {
    closeCookMode();
    sheetInHistory = false;
    if (sheetIsOpen()) {
      try { history.pushState({ nutriSheet: true }, ""); sheetInHistory = true; } catch (e) { /* sin historial */ }
    }
    return;
  }
  if (sheetInHistory || sheetIsOpen()) closeSheet(true);
});

document.addEventListener("keydown", (e) => {
  if (typeof cook !== "undefined" && cook) return; // el modo cocina gestiona sus teclas
  // Esc en un buscador con texto lo borra (como hace el navegador) en vez de cerrar la hoja
  const t = e.target;
  if (e.key === "Escape" && t && t.type === "search" && t.value) {
    e.preventDefault();
    t.value = "";
    t.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (e.key === "Escape" && sheetIsOpen()) closeSheet();
  // Esc en «Editar perfil» hace lo mismo que la ✕: salir sin guardar.
  else if (e.key === "Escape" && currentView === "onboarding" && wizardMode === "edit" && !e.isComposing) {
    e.preventDefault();
    leaveEditMode();
  }
  if (e.key === "Tab" && sheetIsOpen()) trapSheetFocus(e);
});

/* Con la hoja abierta, Tab da la vuelta dentro de ella en vez de irse a la
   pantalla de detrás, que queda tapada. */
function trapSheetFocus(e) {
  const card = document.querySelector("#recipe-sheet .sheet-card");
  const items = [...card.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const inside = card.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

/* Arrastrar la hoja hacia abajo la cierra (si está arriba del todo). */
function bindSheetSwipe() {
  const sheet = document.getElementById("recipe-sheet");
  const card = sheet.querySelector(".sheet-card");
  const backdrop = sheet.querySelector(".sheet-backdrop");
  let startY = null;
  let dy = 0;
  card.addEventListener("touchstart", (e) => {
    startY = card.scrollTop <= 0 ? e.touches[0].clientY : null;
    dy = 0;
  }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      card.style.transition = "none";
      card.style.transform = `translateY(${dy}px)`;
      // el fondo se aclara a medida que bajas la hoja
      backdrop.style.transition = "none";
      backdrop.style.opacity = String(1 - Math.min(dy / 500, 0.6));
    }
  }, { passive: true });
  // Si el sistema interrumpe el gesto (una llamada, un gesto del móvil…), la
  // hoja vuelve a su sitio en vez de quedarse a medio bajar.
  card.addEventListener("touchcancel", () => {
    if (startY === null) return;
    card.style.transition = "";
    backdrop.style.transition = "opacity .25s ease";
    card.style.transform = "";
    backdrop.style.opacity = "";
    startY = null;
  });
  card.addEventListener("touchend", () => {
    if (startY === null) return;
    card.style.transition = "";
    backdrop.style.transition = "opacity .25s ease";
    if (dy > 110) {
      sheet.classList.add("dragged"); // cierra desde donde está, sin volver a oscurecerse
      closeSheet();
    } else {
      card.style.transform = "";
      backdrop.style.opacity = "";
    }
    startY = null;
  });
}

// ---------- Lista de la compra ----------

// ---------- Súper cercanos ----------

const OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const NEARBY_RADIUS_M = 3000;
const NEARBY_MAX = 6;
const NEARBY_TTL_MS = 7 * 86400000; // la lista de súper se refresca cada semana

function supermarketFor(text) {
  return SUPERMARKETS.find((s) => s.match.test(text || "")) || null;
}

function storeIndex() {
  return state.store ? state.store.index : 1;
}

/* Lista de la compra con los precios escalados al súper elegido. */
function storeShoppingList() {
  const list = buildShoppingList(state.plan, weekTargets());
  const k = storeIndex();
  if (k === 1) return list;
  for (const items of Object.values(list.bySection)) {
    for (const it of items) it.cost *= k;
  }
  list.grandTotal *= k;
  return list;
}

function distanceM(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${localDecimal((m / 1000).toFixed(1))} km`;
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("sin-geo"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
    );
  });
}

/* Súper en un radio de 3 km según OpenStreetMap: el más cercano de cada
   cadena, ordenados por distancia. */
async function fetchNearbyStores({ lat, lon }) {
  const query = `[out:json][timeout:20];nwr["shop"="supermarket"](around:${NEARBY_RADIUS_M},${lat},${lon});out center 80;`;
  let data = null;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: query }) });
      if (res.ok) { data = await res.json(); break; }
    } catch (e) { /* probamos el siguiente servidor */ }
  }
  if (!data) throw new Error("sin-red");
  const byChain = {};
  for (const el of data.elements || []) {
    const tags = el.tags || {};
    const pos = el.center || el;
    if (pos.lat == null) continue;
    const chain = supermarketFor(`${tags.brand || ""} ${tags.name || ""}`);
    const key = chain ? chain.key : `local-${el.id}`;
    const dist = distanceM(lat, lon, pos.lat, pos.lon);
    if (byChain[key] && byChain[key].dist <= dist) continue;
    byChain[key] = {
      key,
      name: chain ? chain.name : (tags.name || "Súper de barrio"),
      street: tags["addr:street"] ? `${tags["addr:street"]}${tags["addr:housenumber"] ? ` ${tags["addr:housenumber"]}` : ""}` : "",
      index: chain ? chain.index : DEFAULT_SUPERMARKET_INDEX,
      color: chain ? chain.color : "#8a8a8a",
      dist: Math.round(dist),
    };
  }
  return Object.values(byChain).sort((a, b) => a.dist - b.dist).slice(0, NEARBY_MAX);
}

async function findNearbyStores(btn) {
  btn.disabled = true;
  btn.innerHTML = `<span class="spin">📍</span> Buscando súper cerca…`;
  track("super-buscar");
  try {
    const pos = await getPosition();
    const list = await fetchNearbyStores(pos);
    state.nearby = { at: Date.now(), list };
    if (list.length && !state.store) {
      // por defecto, el más barato de los cercanos
      state.store = [...list].sort((a, b) => a.index - b.index || a.dist - b.dist)[0];
    }
    saveState();
    renderCompra();
    renderDashboard();
    showToast(list.length ? `📍 ${list.length} súper cerca de ti` : "📍 No hay súper a menos de 3 km");
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = "📍 Reintentar";
    const denied = e && e.code === 1;
    showToast(denied ? "📍 Necesitamos tu permiso de ubicación" : "📍 No pudimos buscar ahora, prueba otra vez");
  }
}

function renderStoreCard() {
  const nearby = state.nearby && Date.now() - state.nearby.at < NEARBY_TTL_MS ? state.nearby.list : null;
  if (!nearby) {
    return `
      <div class="store-card empty">
        <div class="store-pin">📍</div>
        <div class="store-card-text">
          <b>¿Dónde haces la compra?</b>
          <span>Busca los súper cerca de ti y compara cuánto te costaría la lista en cada uno.</span>
        </div>
        <button type="button" class="btn block" id="find-stores">📍 Usar mi ubicación</button>
      </div>`;
  }
  if (!nearby.length) {
    return `<div class="store-card empty"><div class="store-card-text"><b>📍 No encontramos súper a menos de 3 km</b></div>
      <button type="button" class="btn ghost block" id="find-stores">Buscar otra vez</button></div>`;
  }
  const base = buildShoppingList(state.plan, weekTargets()).grandTotal;
  const cheapest = Math.min(...nearby.map((s) => s.index));
  return `
    <div class="store-card">
      <div class="store-card-head"><b>📍 Súper cerca de ti</b><button type="button" class="link-btn" id="find-stores">Actualizar</button></div>
      <div class="store-scroller">
        ${nearby.map((s, i) => `
          <button type="button" class="store-chip ${state.store && state.store.key === s.key ? "selected" : ""}" data-store="${s.key}" style="--brand:${s.color}; animation-delay:${i * 0.06}s">
            ${s.index === cheapest ? `<span class="store-best">💸 Más barato</span>` : ""}
            <span class="store-logo">${s.name.charAt(0)}</span>
            <span class="store-name">${s.name}</span>
            <span class="store-dist">${formatDistance(s.dist)}</span>
            <span class="store-price">${euro(base * s.index)} €</span>
          </button>`).join("")}
      </div>
      <p class="hint">Precio aproximado de tu lista según la cadena: no son precios en tiempo real.</p>
    </div>`;
}

function bindStoreCard(el) {
  const find = el.querySelector("#find-stores");
  if (find) find.addEventListener("click", () => findNearbyStores(find));
  el.querySelectorAll(".store-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.store = state.nearby.list.find((s) => s.key === chip.dataset.store);
      saveState();
      buzz(10);
      track(`super-${state.store.key.startsWith("local") ? "local" : state.store.key}`);
      renderCompra();
      renderDashboard();
    });
  });
}

// ---------- Lista de la compra ----------

function compraProgressHtml(done, total, grandTotal) {
  const r = 30;
  const C = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  const budget = state.profile.weeklyBudget;
  return `
    <div class="cart-hero">
      <div class="cart-ring">
        <svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="${r}" class="cart-ring-bg"/><circle cx="36" cy="36" r="${r}" class="cart-ring-fill" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
        <span class="cart-ring-emoji">${done === total && total ? "🎉" : "🛒"}</span>
      </div>
      <div class="cart-hero-text">
        <span class="cart-count"><b id="cart-done">${done}</b>/${total} en el carro</span>
        <span class="cart-total"><b id="cart-total" data-value="${grandTotal.toFixed(2)}">${euro(grandTotal)}</b> €</span>
        ${budget ? `<span class="cart-budget ${grandTotal <= budget ? "ok" : "warn"}">${grandTotal <= budget ? `✅ ${euro(budget - grandTotal)} € por debajo de tu presupuesto` : `⚠️ ${euro(grandTotal - budget)} € por encima de tu presupuesto`}</span>` : ""}
      </div>
    </div>`;
}

// secciones de la compra que has plegado: siguen plegadas al volver a dibujar
// la lista (cambiar de súper, deshacer, volver a la pestaña…)
const collapsedSections = new Set();

function renderCompra() {
  const { bought } = state;
  const { bySection, grandTotal } = storeShoppingList();
  const el = document.getElementById("compra-content");
  const sections = Object.keys(bySection).sort();
  document.getElementById("compra-eyebrow").textContent = state.store ? `${state.store.name}${state.store.dist ? ` · ${formatDistance(state.store.dist)}` : ""}` : "Precios de Mercadona";

  if (!isPremium()) {
    const itemCount = Object.values(bySection).reduce((n, items) => n + items.length, 0);
    el.innerHTML = renderStoreCard() + `
      <div class="locked-card">
        <div class="locked-icon">🔒</div>
        <h3>Tu lista ya está lista</h3>
        <p>${itemCount} artículos de ${sections.length} secciones, por un total estimado de <b>${euro(grandTotal)} €</b>.</p>
        <p class="hint">Desbloquéala con Premium para ver cada producto, su cantidad y su precio, listo para llevar al súper.</p>
        <button type="button" class="btn block" id="unlock-compra-btn">Desbloquear con Premium</button>
      </div>
    `;
    bindStoreCard(el);
    document.getElementById("unlock-compra-btn").addEventListener("click", () => openPaywallSheet("compra"));
    return;
  }

  const allItems = sections.flatMap((sec) => bySection[sec]);
  const doneCount = allItems.filter((it) => bought[it.foodId]).length;
  let rowIdx = 0;

  el.innerHTML = renderStoreCard() + compraProgressHtml(doneCount, allItems.length, grandTotal) + sections.map((section, si) => {
    const items = bySection[section];
    const style = SECTION_STYLE[section] || { emoji: "🛒", color: "coral" };
    const subtotal = items.reduce((s, it) => s + it.cost, 0);
    const secDone = items.filter((it) => bought[it.foodId]).length;
    return `
      <div class="section-block sec-${style.color} ${secDone === items.length ? "complete" : ""} ${collapsedSections.has(section) ? "collapsed" : ""}" data-section="${section}" style="animation-delay:${0.05 + si * 0.07}s">
        <button type="button" class="section-head" aria-expanded="${!collapsedSections.has(section)}" aria-controls="sec-items-${si}">
          <span class="section-emoji">${style.emoji}</span>
          <span class="section-head-text">
            <span class="section-name">${section}</span>
            <span class="section-sub"><span class="sec-done">${secDone}</span>/${items.length} · ${euro(subtotal)} €</span>
          </span>
          <span class="section-check">✓</span>
          <span class="section-caret">⌄</span>
        </button>
        <div class="section-bar"><div class="section-bar-fill" style="width:${(secDone / items.length) * 100}%"></div></div>
        <div class="section-items" id="sec-items-${si}"><div class="section-items-inner">
          ${items.map((it) => {
            const isBought = !!bought[it.foodId];
            return `
              <div class="item-row ${isBought ? "bought" : ""}" data-food="${it.foodId}" style="animation-delay:${0.1 + rowIdx++ * 0.025}s">
                <div class="item-left">
                  <span class="item-emoji">${FOOD_EMOJI[it.foodId] || "🛒"}</span>
                  <div>
                    <div class="item-name">${it.name}</div>
                    <div class="item-qty">${formatQty(it.qty, it.unit, { buy: true })}</div>
                  </div>
                </div>
                <div class="item-cost">${euro(it.cost)} €</div>
                <div class="check-circle">${isBought ? "✓" : ""}</div>
              </div>`;
          }).join("")}
        </div></div>
      </div>`;
  }).join("") + `
    <div class="compra-actions">
      <button type="button" class="btn ghost block" id="reset-bought"${doneCount ? "" : " hidden"}>↺ Vaciar el carro</button>
    </div>`;

  bindStoreCard(el);
  const totalEl = document.getElementById("cart-total");
  animateCountUp(totalEl, Math.round(grandTotal), { duration: 600 });
  setTimeout(() => { totalEl.textContent = euro(grandTotal); }, 650);

  el.querySelectorAll(".section-head").forEach((head) => {
    head.addEventListener("click", () => {
      const block = head.closest(".section-block");
      const collapsed = block.classList.toggle("collapsed");
      head.setAttribute("aria-expanded", String(!collapsed));
      if (collapsed) collapsedSections.add(block.dataset.section);
      else collapsedSections.delete(block.dataset.section);
    });
  });

  const reset = document.getElementById("reset-bought");
  if (reset) reset.addEventListener("click", () => {
    const before = state.bought;
    const wasCollapsed = [...collapsedSections];
    collapsedSections.clear(); // carro vacío: todas las secciones a la vista
    state.bought = {};
    saveState();
    renderCompra();
    // por si lo tocaste sin querer: se puede deshacer unos segundos
    showToast("🧺 Carro vaciado", {
      label: "Deshacer",
      run: () => {
        state.bought = before;
        wasCollapsed.forEach((sec) => collapsedSections.add(sec));
        saveState();
        renderCompra();
      },
    });
  });

  const updateProgress = () => {
    const done = allItems.filter((it) => state.bought[it.foodId]).length;
    document.getElementById("cart-done").textContent = done;
    const ring = el.querySelector(".cart-ring-fill");
    const C = Number(ring.getAttribute("stroke-dasharray"));
    ring.style.strokeDashoffset = C * (1 - done / allItems.length);
    el.querySelector(".cart-ring-emoji").textContent = done === allItems.length ? "🎉" : "🛒";
    // «Vaciar el carro» aparece con el primer artículo marcado y se va con el último
    if (reset) reset.hidden = done === 0;
    return done;
  };

  el.querySelectorAll(".item-row").forEach((row) => {
    actLikeButton(row);
    row.setAttribute("role", "checkbox");
    row.setAttribute("aria-checked", String(!!state.bought[row.dataset.food]));
    row.addEventListener("click", () => {
      const foodId = row.dataset.food;
      const newVal = !state.bought[foodId];
      state.bought[foodId] = newVal;
      row.classList.toggle("bought", newVal);
      row.setAttribute("aria-checked", String(newVal));
      const circle = row.querySelector(".check-circle");
      circle.textContent = newVal ? "✓" : "";
      if (newVal) {
        buzz(8);
        circle.classList.remove("bounce");
        void circle.offsetWidth; // reinicia la animación si se reutiliza
        circle.classList.add("bounce");
        const fly = document.createElement("span");
        fly.className = "item-fly";
        fly.textContent = FOOD_EMOJI[foodId] || "🛒";
        row.appendChild(fly);
        setTimeout(() => fly.remove(), 700);
      }
      saveState();

      const block = row.closest(".section-block");
      const items = bySection[block.dataset.section];
      const secDone = items.filter((it) => state.bought[it.foodId]).length;
      block.querySelector(".sec-done").textContent = secDone;
      block.querySelector(".section-bar-fill").style.width = `${(secDone / items.length) * 100}%`;
      const wasComplete = block.classList.contains("complete");
      block.classList.toggle("complete", secDone === items.length);
      const done = updateProgress();
      if (done === allItems.length && newVal) {
        burstConfetti();
        showToast("🎉 ¡Compra completa! A cocinar");
        track("compra-completa");
        engage.shoppingDone();
      } else if (secDone === items.length && !wasComplete) {
        showToast(`${(SECTION_STYLE[block.dataset.section] || {}).emoji || "✅"} ${block.dataset.section} completada`);
        setTimeout(() => {
          block.classList.add("collapsed");
          block.querySelector(".section-head").setAttribute("aria-expanded", "false");
          collapsedSections.add(block.dataset.section);
        }, 600);
      }
    });
  });
}

// ---------- Perfil ----------

const SPORT_EMOJI = {
  running: "🏃", caminar: "🚶", ciclismo: "🚴", natacion: "🏊", pesas: "🏋️", futbol: "⚽", baloncesto: "🏀",
  tenis: "🎾", yoga: "🧘", hiit: "🔥", spinning: "🚲", boxeo: "🥊", senderismo: "🥾", otro: "🏅",
};
const GOAL_EMOJI = { perder: "🔥", mantener: "⚖️", ganar: "💪" };
const ACTIVITY_EMOJI = { sedentario: "🪑", moderado: "🚶", activo: "🏗️" };
const DIET_INFO = {
  omnivoro: { emoji: "🍗", label: "Como de todo" },
  vegetariano: { emoji: "🥚", label: "Vegetariano" },
  vegano: { emoji: "🌱", label: "Vegano" },
};

function bmiInfo(p) {
  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  const label = bmi < 18.5 ? "Bajo" : bmi < 25 ? "Saludable" : bmi < 30 ? "Elevado" : "Alto";
  return { value: bmi.toFixed(1).replace(".", ","), label };
}

function langPickerHtml() {
  // aria-pressed dice cuál está elegido; lang hace que «English» se lea en inglés
  return `<div class="lang-picker" role="group" aria-label="Idioma">${Object.entries(LANGUAGES).map(([code, l]) => `
    <button type="button" class="lang-btn ${code === currentLang ? "selected" : ""}" data-lang="${code}" lang="${code}" aria-pressed="${code === currentLang}">
      <span class="lang-flag">${l.flag}</span>${l.label}
    </button>`).join("")}</div>`;
}

const THEME_KEY = "nutriplan_theme";
const THEMES = { auto: { emoji: "📱", label: "Auto" }, light: { emoji: "☀️", label: "Claro" }, dark: { emoji: "🌙", label: "Oscuro" } };

function currentTheme() {
  try { return localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { return "auto"; }
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* seguimos sin guardar */ }
  if (typeof syncThemeColor === "function") syncThemeColor();
}

function themePickerHtml() {
  const current = currentTheme();
  return `<div class="lang-picker theme-picker" role="group" aria-label="Apariencia">${Object.entries(THEMES).map(([key, t]) => `
    <button type="button" class="lang-btn ${key === current ? "selected" : ""}" data-theme-choice="${key}" aria-pressed="${key === current}">
      <span class="lang-flag">${t.emoji}</span>${t.label}
    </button>`).join("")}</div>`;
}

function bindThemePicker(root) {
  root.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.themeChoice);
      track(`tema-${btn.dataset.themeChoice}`);
      root.querySelectorAll("[data-theme-choice]").forEach((b) => {
        b.classList.toggle("selected", b === btn);
        b.setAttribute("aria-pressed", String(b === btn));
      });
      buzz(8);
    });
  });
}

function bindLangPicker(root) {
  root.querySelectorAll(".lang-btn[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.lang === currentLang) return;
      track(`idioma-${btn.dataset.lang}`);
      setLang(btn.dataset.lang);
    });
  });
}

function renderPerfil() {
  const p = state.profile;
  const el = document.getElementById("perfil-content");
  const targets = currentTargets();
  const diet = DIET_INFO[p.dietType] || DIET_INFO.omnivoro;
  const bmi = bmiInfo(p);
  const streak = currentStreak();
  const log = state.weightLog;
  const change = log.length > 1 ? log[log.length - 1].kg - log[0].kg : null;
  const macroTotal = targets.protein * 4 + targets.carbs * 4 + targets.fat * 9 || 1;
  const macroBar = (key, label, emoji, grams, kcalPerG) => `
    <div class="pmacro ${key}">
      <div class="pmacro-top"><span>${emoji} ${label}</span><b>${grams} g</b></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((grams * kcalPerG / macroTotal) * 100)}%"></div></div>
    </div>`;

  el.innerHTML = `
    <div class="profile-hero photo-card">
      ${photoHtml(GOAL_PHOTOS[p.goal], { width: 700, className: "photo-cover", fallback: GOAL_EMOJI[p.goal] })}
      <div class="photo-card-text">
        <div class="profile-avatar">${p.sex === "mujer" ? "👩" : "👨"}</div>
        <h4>${GOAL_EMOJI[p.goal]} ${GOAL_LABELS[p.goal]}</h4>
        <div class="profile-hero-chips">
          <span>🔥 ${streak} ${streak === 1 ? "día" : "días"} de racha</span>
          ${change !== null ? `<span>⚖️ ${change > 0 ? "+" : ""}${change.toFixed(1).replace(".", ",")} kg</span>` : ""}
          ${isPremium() ? "<span>✨ Premium</span>" : ""}
        </div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-tile"><span class="stat-emoji">⚖️</span><b>${String(p.weightKg).replace(".", ",")}</b><span>kg</span></div>
      <div class="stat-tile"><span class="stat-emoji">📏</span><b>${p.heightCm}</b><span>cm</span></div>
      <div class="stat-tile"><span class="stat-emoji">🎂</span><b>${p.age}</b><span>años</span></div>
      <div class="stat-tile"><span class="stat-emoji">📊</span><b>${bmi.value}</b><span>IMC · ${bmi.label}</span></div>
    </div>

    <div class="pcard">
      <div class="section-kicker">🎯 Tu objetivo diario</div>
      <div class="pkcal"><b>${targets.calories}</b> kcal/día
        ${targets.calorieAdjust ? `<span class="pill">${targets.calorieAdjust > 0 ? "+" : ""}${targets.calorieAdjust} ajuste</span>` : ""}
      </div>
      ${macroBar("prot", "Proteína", "🍗", targets.protein, 4)}
      ${macroBar("carbs", "Carbohidratos", "🌾", targets.carbs, 4)}
      ${macroBar("fat", "Grasas", "🥑", targets.fat, 9)}
    </div>

    <div class="pcard">
      <div class="section-kicker">🏃 Actividad</div>
      <div class="pline"><span class="pline-emoji">${ACTIVITY_EMOJI[p.activityLevel] || "🚶"}</span>${ACTIVITY_LABELS[p.activityLevel] || "—"}</div>
      ${p.sports && p.sports.length ? `<div class="chip-wrap">
        ${p.sports.map((sp) => `<span class="sport-chip">${SPORT_EMOJI[sp.type] || "🏅"} ${SPORTS[sp.type].label}<small>${sp.freq}×/sem · ${sp.mins} min</small></span>`).join("")}
      </div>
      <div class="pline muted">🔥 +${targets.exerciseKcal} kcal/día de media por entrenar</div>` : `<div class="pline muted">Sin deporte registrado</div>`}
    </div>

    <div class="pcard">
      <div class="section-kicker">🍽️ Alimentación</div>
      <div class="pduo">
        <div class="pduo-tile"><span>${diet.emoji}</span><b>${diet.label}</b><small>Dieta</small></div>
        <div class="pduo-tile"><span>🛒</span><b>${p.weeklyBudget ? `${p.weeklyBudget} €` : "Libre"}</b><small>Presupuesto/semana</small></div>
      </div>
      <div class="pline muted">🚫 Evitamos</div>
      <div class="chip-wrap">
        ${p.dislikes.length ? p.dislikes.map((id) => `<span class="avoid-chip">${FOODS[id].name}</span>`).join("") : `<span class="avoid-chip none">Nada, ¡comes de todo!</span>`}
      </div>
    </div>

    ${isPremium() ? `
      <div class="sub-card premium">
        <div><div class="sub-title">✨ Premium ${PLANS[state.subscription.plan].label.toLowerCase()}</div>
        <div class="sub-sub">${state.subscription.price.toFixed(2).replace(".", ",")} €${PLANS[state.subscription.plan].periodShort} · simulado</div></div>
        <button class="btn ghost small" id="cancel-sub-btn" type="button">Cancelar</button>
      </div>
    ` : `
      <div class="sub-card">
        <div><div class="sub-title">✨ Hazte Premium</div>
        <div class="sub-sub">Lista de la compra con precios y más</div></div>
        <button class="btn small" id="view-plans-btn" type="button">Ver planes</button>
      </div>
    `}

    ${badgeShelfHtml()}

    <div class="pcard">
      <div class="section-kicker">🌐 Idioma</div>
      ${langPickerHtml()}
      <div class="section-kicker theme-kicker">🎨 Apariencia</div>
      ${themePickerHtml()}
    </div>

    <button class="btn secondary block edit-profile-spacing" id="edit-profile-btn" type="button">✏️ Editar mis datos</button>
    <p class="hint privacy-note">🔒 Tus datos se quedan en tu móvil. Solo contamos de forma anónima qué funciones se usan.</p>
  `;
  document.getElementById("edit-profile-btn").addEventListener("click", enterEditMode);
  bindLangPicker(el);
  bindThemePicker(el);
  if (isPremium()) {
    document.getElementById("cancel-sub-btn").addEventListener("click", cancelSubscription);
  } else {
    document.getElementById("view-plans-btn").addEventListener("click", () => openPaywallSheet());
  }
}

// ---------- Eventos globales ----------

document.addEventListener("DOMContentLoaded", () => {
  initOnboardingForm();
  const form = document.getElementById("onboarding-form");

  // Al cambiar de paso con los botones, el foco pasa al título del paso nuevo:
  // así el lector de pantalla lo anuncia, y no se pierde cuando «Siguiente»
  // (en el último paso) o «Atrás» (en el primero) desaparecen.
  const focusStepTitle = () => {
    const h = document.querySelector(`.wizard-step[data-step="${wizardStep}"] h3`);
    if (!h) return;
    h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
  };
  document.getElementById("wizard-next").addEventListener("click", () => {
    if (validateStep(wizardStep)) { goToWizardStep(wizardStep + 1); focusStepTitle(); }
  });
  document.getElementById("wizard-back").addEventListener("click", () => {
    if (wizardStep > 0) {
      goToWizardStep(wizardStep - 1);
      focusStepTitle();
    } else if (wizardMode === "edit") {
      leaveEditMode();
    }
  });
  document.getElementById("wizard-cancel").addEventListener("click", leaveEditMode);

  ["input", "change", "click"].forEach((ev) => form.addEventListener(ev, () => requestAnimationFrame(updateWizardPreview)));

  // Intro en un campo de un paso intermedio avanza al siguiente paso en vez de
  // enviar el formulario entero y saltarse el resto de preguntas.
  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || wizardStep >= 3) return;
    if (!(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    if (validateStep(wizardStep)) {
      goToWizardStep(wizardStep + 1);
      const sel = `.wizard-step[data-step="${wizardStep}"]`;
      const first = document.querySelector(`${sel} .choice-card[tabindex="0"], ${sel} input, ${sel} select:not(.select-hidden)`);
      if (first) first.focus({ preventScroll: true });
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateStep(3)) return;
    const previousGoal = state.profile && state.profile.goal;
    state.profile = readProfileFromForm(form);
    if (previousGoal !== state.profile.goal) {
      // Un ajuste calculado para otro objetivo ya no sirve.
      state.calorieAdjust = 0;
      state.adjustDecisionAt = null;
    }
    logWeight(state.profile.weightKg);
    state.plan = generateWeeklyPlan(state.profile, currentTargets().calories, favorites());
    state.bought = {};
    saveState();
    track(previousGoal ? "perfil-editado" : "plan-generado");
    if (document.getElementById("tab-bar").classList.contains("hidden")) {
      enterApp();
      showPlanReveal(() => showView("plan"));
    } else {
      renderAll();
      showView("dashboard");
    }
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => openTab(btn.dataset.view));
  });

  document.getElementById("favorites-btn").addEventListener("click", () => openFavoritesSheet());
  document.getElementById("regenerate-btn").addEventListener("click", () => {
    state.plan = generateWeeklyPlan(state.profile, currentTargets().calories, favorites());
    state.bought = {};
    saveState();
    track("plan-regenerado");
    renderDashboard();
    renderPlan();
    renderCompra();
  });

  document.getElementById("sheet-close").addEventListener("click", () => closeSheet());
  bindSheetSwipe();
  bindPlanSwipe();
  window.addEventListener("resize", moveTabIndicator);
  document.getElementById("sheet-backdrop").addEventListener("click", () => closeSheet());

  trackDailyOpen(isStandalone());

  // Accesos directos del icono de la app (mantener pulsado): «?tab=plan» abre
  // esa pestaña directamente, sin pasar por la bienvenida.
  let shortcutTab = null;
  try {
    const tab = new URLSearchParams(location.search).get("tab");
    if (TAB_ORDER.includes(tab) && tab !== "dashboard") shortcutTab = tab;
    if (location.search) history.replaceState(history.state, "", location.pathname + location.hash);
  } catch (e) { /* sin acceso directo */ }

  if (state.profile && state.plan) {
    enterApp();
    if (shortcutTab) showView(shortcutTab);
  } else {
    setWizardMode("create");
    goToWizardStep(0);
    showView("onboarding");
    if (!state.tourSeen) showTour();
  }

  let splashAlreadyShown = false;
  try {
    splashAlreadyShown = sessionStorage.getItem("nutriplan_splash_shown");
    sessionStorage.setItem("nutriplan_splash_shown", "1");
  } catch (e) { /* almacenamiento no disponible, mostramos el splash igualmente */ }

  const returning = !!(state.profile && state.plan);
  if (splashAlreadyShown || (returning && shortcutTab)) {
    const splash = document.getElementById("splash");
    if (splash) splash.remove();
  } else if (returning) {
    // Quien ya tiene plan entra por la pantalla de bienvenida en vez del splash
    showWelcome();
    setTimeout(dismissSplash, 250);
  } else {
    setTimeout(dismissSplash, 1100);
  }
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => { /* sin modo offline, la app sigue funcionando */ });
  });
}
