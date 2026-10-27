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
let selectedDay = 0;

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
  const featured = getWeeklyArticles(1)[0];
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
  const weekly = getWeeklyArticles(4);
  const weeklyIds = new Set(weekly.map((a) => a.id));
  const featured = weekly[0];
  const others = ARTICLES.filter((a) => a.id !== featured.id);
  const el = document.getElementById("informes-content");

  el.innerHTML = `
    <div class="report-hero photo-card" data-article="${featured.id}">
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
          ${weeklyIds.has(a.id) ? '<span class="report-new-badge">Nuevo</span>' : ""}
          <span class="report-tile-title">${a.title}</span>
          <span class="report-row-meta">⏱ ${a.readMins} min</span>
        </div>`).join("")}
    </div>
  `;

  el.querySelectorAll("[data-article]").forEach((b) => {
    b.addEventListener("click", () => openArticleSheet(b.dataset.article));
  });
}

function openArticleSheet(articleId) {
  const article = ARTICLES.find((a) => a.id === articleId);
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <span class="tag">${article.category}</span>
    <h3>${article.title}</h3>
    <div class="macro-row"><span class="macro-chip">${article.readMins} min de lectura</span></div>
    <div class="sheet-section article-body">
      ${article.body.map((p) => `<p>${p}</p>`).join("")}
    </div>
  `;
  document.getElementById("recipe-sheet").classList.remove("hidden");
}

// ---------- Suscripción (simulada) ----------

function openPaywallSheet(reason) {
  const body = document.getElementById("sheet-body");
  track(`paywall-visto-${reason || "perfil"}`);
  const reasonText = reason === "compra"
    ? "Desbloquea tu lista de la compra con precios reales de Mercadona, agrupada por sección."
    : "Desbloquea todo lo que ofrece NutriPlan Premium.";

  body.innerHTML = `
    <span class="tag tag-purple">✨ Premium</span>
    <h3>Hazte Premium</h3>
    <p class="paywall-pitch">${reasonText}</p>
    <ul class="paywall-features">
      <li>🛒 Lista de la compra con precios reales, lista para llevar al súper</li>
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

  document.getElementById("recipe-sheet").classList.remove("hidden");
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
}

function createSportRow(prefill) {
  const row = document.createElement("div");
  row.className = "sport-row";

  const select = document.createElement("select");
  select.className = "sport-type";
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
  freqInput.value = prefill ? prefill.freq : "";

  const minsInput = document.createElement("input");
  minsInput.type = "number";
  minsInput.className = "sport-mins";
  minsInput.min = 0;
  minsInput.max = 300;
  minsInput.placeholder = "min";
  minsInput.value = prefill ? prefill.mins : "";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-sport";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => row.remove());

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
  addSportRow();
  document.getElementById("add-sport-btn").addEventListener("click", () => addSportRow());

  const progress = document.getElementById("wizard-progress");
  progress.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const dot = document.createElement("span");
    dot.className = "dot";
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
}

function setWizardMode(mode) {
  wizardMode = mode;
  document.getElementById("wizard-intro").classList.toggle("hidden", mode === "edit");
  document.getElementById("wizard-cancel").classList.toggle("hidden", mode !== "edit");
}

function goToWizardStep(step) {
  wizardStep = step;
  syncChoiceCards();
  document.querySelectorAll(".wizard-step").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.step) === step);
  });
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

// ---------- Navegación ----------

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  const view = document.getElementById(`view-${name}`);
  view.classList.remove("hidden", "view-enter");
  void view.offsetWidth; // reinicia la animación de entrada
  view.classList.add("view-enter");
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  document.getElementById("app-scroll").scrollTop = 0;
}

function enterApp() {
  document.getElementById("tab-bar").classList.remove("hidden");
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
  const { grandTotal } = buildShoppingList(plan, targets.calories);
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
          ? `🛒 <b>${grandTotal.toFixed(2)} €</b> esta semana · ✅ dentro de tus ${profile.weeklyBudget} €`
          : `🛒 <b>${grandTotal.toFixed(2)} €</b> esta semana · ⚠️ ${Math.abs(diff).toFixed(2)} € por encima, prueba 🔄 en Plan`}
      </div>`;
  } else {
    budgetHtml = `<div class="budget-banner ok">🛒 <b>${grandTotal.toFixed(2)} €</b> de compra esta semana</div>`;
  }

  el.innerHTML = `
    <div class="chip-row">
      <div class="goal-chip">🎯 ${GOAL_LABELS[profile.goal]}</div>
      ${renderStreakChip()}
    </div>
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
    ${renderProgressCard()}
    ${budgetHtml}
    ${renderInstallCard()}
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
  bindTodayCard();
  bindProgressCard();
  bindInstallCard();
  document.getElementById("targets-why-toggle").addEventListener("click", () => {
    document.getElementById("targets-why-card").classList.toggle("open");
  });
  el.querySelectorAll("[data-article]").forEach((b) => {
    b.addEventListener("click", () => openArticleSheet(b.dataset.article));
  });

  animateCountUp(document.getElementById("ring-kcal-value"), targets.calories);
  animateCountUp(document.getElementById("legend-protein"), targets.protein, { suffix: " g" });
  animateCountUp(document.getElementById("legend-carbs"), targets.carbs, { suffix: " g" });
  animateCountUp(document.getElementById("legend-fat"), targets.fat, { suffix: " g" });
}

function renderAll() {
  renderDashboard();
  renderPlan();
  renderCompra();
  renderPerfil();
}

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
  while (mealsDone(state.daily[iso(d)]) >= MEALS_FOR_STREAK) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function todayTotals() {
  const day = state.plan[todayPlanIndex()];
  const factor = dayPortionFactor(day, currentTargets().calories);
  const entry = dailyEntry();
  let kcal = 0, prot = 0;
  for (const slot of MEAL_SLOTS) {
    if (!entry.eaten[slot.key]) continue;
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

function showToast(text) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  document.getElementById("app-shell").appendChild(toast);
  setTimeout(() => toast.classList.add("hide"), 2400);
  setTimeout(() => toast.remove(), 2900);
}

function renderStreakChip() {
  const streak = currentStreak();
  return `<div class="streak-chip ${streak ? "active" : ""}" id="streak-chip">🔥 ${streak} ${streak === 1 ? "día" : "días"}</div>`;
}

function renderTodayCard() {
  const dayIdx = todayPlanIndex();
  const day = state.plan[dayIdx];
  const targets = currentTargets();
  const factor = dayPortionFactor(day, targets.calories);
  const entry = dailyEntry();
  const done = mealsDone(entry);
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
          return `
            <div class="today-meal ${eaten ? "eaten" : ""}" data-slot="${slot.key}">
              <button type="button" class="today-meal-info" data-open="${slot.key}">
                ${recipePhoto(info.recipe.id, { width: 120, className: "photo-thumb", fallback: mealEmoji(slot.key) })}
                <span>
                  <span class="today-meal-slot">${slot.label}</span>
                  <span class="today-meal-name">${info.recipe.name}</span>
                </span>
              </button>
              <button type="button" class="eat-btn" data-eat="${slot.key}" aria-pressed="${eaten}" aria-label="Marcar ${slot.label.toLowerCase()} como hecha">${eaten ? "✓" : ""}</button>
            </div>`;
        }).join("")}
      </div>
      <div class="water-row">
        <div class="today-bar-label"><span>💧 Agua</span><span id="water-count">${entry.water}/${glasses} vasos</span></div>
        <div class="water-glasses">
          ${Array.from({ length: glasses }, (_, i) => `<button type="button" class="glass ${i < entry.water ? "full" : ""}" data-glass="${i + 1}" aria-label="${i + 1} vasos"></button>`).join("")}
        </div>
      </div>
    </div>`;
}

function updateTodayProgress(animate = true) {
  const targets = currentTargets();
  const { kcal, prot } = todayTotals();
  const kcalPct = Math.min(100, (kcal / targets.calories) * 100);
  const protPct = Math.min(100, (prot / targets.protein) * 100);
  document.getElementById("today-kcal").textContent = `${Math.round(kcal)} / ${targets.calories} kcal`;
  document.getElementById("today-prot").textContent = `${Math.round(prot)} / ${targets.protein} g`;
  const set = () => {
    document.getElementById("today-kcal-bar").style.width = `${kcalPct}%`;
    document.getElementById("today-prot-bar").style.width = `${protPct}%`;
  };
  if (animate) requestAnimationFrame(() => requestAnimationFrame(set)); else set();
  document.getElementById("today-done").textContent = mealsDone(dailyEntry());
}

function bindTodayCard() {
  const card = document.getElementById("today-card");
  updateTodayProgress();

  card.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => openRecipeSheet(todayPlanIndex(), btn.dataset.open));
  });

  card.querySelectorAll("[data-eat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = dailyEntry();
      const slotKey = btn.dataset.eat;
      const wasComplete = mealsDone(entry) >= MEALS_FOR_STREAK;
      entry.eaten[slotKey] = !entry.eaten[slotKey];
      const eaten = entry.eaten[slotKey];
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
      }
      updateTodayProgress(false);

      const nowComplete = mealsDone(entry) >= MEALS_FOR_STREAK;
      document.getElementById("streak-chip").outerHTML = renderStreakChip();
      if (eaten && mealsDone(entry) === MEAL_SLOTS.length) {
        burstConfetti();
        showToast(`¡Día completado! 🔥 Llevas ${currentStreak()} ${currentStreak() === 1 ? "día" : "días"} seguidos`);
        track("dia-completado");
      } else if (eaten && nowComplete && !wasComplete) {
        const chip = document.getElementById("streak-chip");
        chip.classList.add("pop");
        showToast(`🔥 Racha de ${currentStreak()} ${currentStreak() === 1 ? "día" : "días"}. ¡Sigue así!`);
      }
    });
  });

  card.querySelectorAll("[data-glass]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = dailyEntry();
      const n = Number(btn.dataset.glass);
      entry.water = entry.water === n ? n - 1 : n; // tocar el último vaso lleno lo vacía
      saveState();
      buzz(8);
      const goal = waterGoalGlasses();
      card.querySelectorAll("[data-glass]").forEach((g) => g.classList.toggle("full", Number(g.dataset.glass) <= entry.water));
      btn.classList.remove("pop");
      void btn.offsetWidth;
      btn.classList.add("pop");
      document.getElementById("water-count").textContent = `${entry.water}/${goal} vasos`;
      track("agua");
      if (entry.water === goal && n === goal) showToast("💧 ¡Objetivo de agua cumplido!");
    });
  });
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

function renderPlan() {
  const dayTabs = document.getElementById("day-tabs");
  dayTabs.innerHTML = DAYS.map((d, i) => `<button type="button" class="day-pill ${i === selectedDay ? "active" : ""}" data-day="${i}">${d.slice(0, 3)}</button>`).join("");
  dayTabs.querySelectorAll(".day-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedDay = Number(btn.dataset.day);
      dayTabs.querySelectorAll(".day-pill").forEach((b) => b.classList.toggle("active", Number(b.dataset.day) === selectedDay));
      document.querySelectorAll(".day-panel").forEach((p) => p.classList.toggle("active", Number(p.dataset.day) === selectedDay));
    });
  });
  renderPlanDays();
}

function renderPlanDays() {
  const el = document.getElementById("plan-content");
  const targetKcal = currentTargets().calories;
  el.innerHTML = DAYS.map((day, i) => {
    const factor = dayPortionFactor(state.plan[i], targetKcal);
    return `
    <div class="day-panel ${i === selectedDay ? "active" : ""}" data-day="${i}">
      ${MEAL_SLOTS.map((slot) => {
        const info = getRecipeInfo(state.plan[i][slot.key]);
        return `
          <div class="meal-card" data-day="${i}" data-slot="${slot.key}">
            ${recipePhoto(info.recipe.id, { width: 160, className: `photo-thumb big ${slot.key}`, fallback: mealEmoji(slot.key) })}
            <div class="meal-info">
              <div class="slot-label">${slot.label}</div>
              <div class="recipe-name">${info.recipe.name}</div>
              <div class="kcal">${Math.round(info.kcal * factor)} kcal · ${(info.cost * factor).toFixed(2)} €</div>
            </div>
            <div class="chevron-right">›</div>
          </div>`;
      }).join("")}
    </div>
  `;
  }).join("");

  el.querySelectorAll(".meal-card").forEach((card) => {
    card.addEventListener("click", () => {
      const day = Number(card.dataset.day);
      const slotKey = card.dataset.slot;
      const slot = MEAL_SLOTS.find((s) => s.key === slotKey);
      openRecipeSheet(day, slotKey);
    });
  });
}

const TAG_COLOR_CLASS = {
  vegetariano: "", vegano: "", alto_proteina: "tag-rose", sin_gluten: "tag-amber", economico: "tag-purple",
};

function openRecipeSheet(dayIdx, slotKey) {
  const slotLabel = MEAL_SLOTS.find((s) => s.key === slotKey).label;
  const info = getRecipeInfo(state.plan[dayIdx][slotKey]);
  const r = info.recipe;
  const factor = dayPortionFactor(state.plan[dayIdx], currentTargets().calories);
  const whySentences = explainRecipe(r, info, state.profile, slotLabel);
  const body = document.getElementById("sheet-body");
  track("receta-vista");
  body.innerHTML = `
    ${recipePhoto(r.id, { width: 700, className: "photo-hero", fallback: mealEmoji(slotKey) })}
    <h3>${r.name}</h3>
    <div class="modal-tags">${r.tags.map((t) => `<span class="tag ${TAG_COLOR_CLASS[t] || ""}">${t.replace("_", " ")}</span>`).join("")}</div>
    <div class="macro-tiles">
      <div class="macro-tile kcal"><b>${Math.round(info.kcal * factor)}</b><span>🔥 kcal</span></div>
      <div class="macro-tile prot"><b>${Math.round(info.prot * factor)} g</b><span>🍗 prot</span></div>
      <div class="macro-tile carbs"><b>${Math.round(info.carbs * factor)} g</b><span>🌾 carbs</span></div>
      <div class="macro-tile fat"><b>${Math.round(info.fat * factor)} g</b><span>🥑 grasa</span></div>
      <div class="macro-tile cost"><b>${(info.cost * factor).toFixed(2)} €</b><span>🛒 coste</span></div>
    </div>
    <button type="button" class="btn secondary block swap-open-btn" id="swap-open-btn">🔄 Cambiar por otro plato</button>
    <div class="why-block why-short"><p>💡 ${whySentences[0]}</p></div>
    <div class="sheet-section">
      <h4>Ingredientes (tu ración)</h4>
      ${Math.abs(factor - 1) >= 0.05 ? `<p class="hint portion-hint">Cantidades ajustadas a tus calorías (×${factor.toFixed(2).replace(".", ",")} la ración estándar).</p>` : ""}
      ${r.ingredients.map(([id, qty]) => {
        const food = FOODS[id];
        const role = FOOD_ROLES[food.cat];
        return `
          <div class="ingredient-row">
            <span class="ing-emoji" aria-hidden="true">${FOOD_ROLE_EMOJI[food.cat] || "•"}</span>
            <div class="ing-text"><span class="ing-name">${food.name}</span><span class="ing-role">${role.label}</span></div>
            <div class="ing-qty">${formatQty(qty * factor, food.unit)}</div>
          </div>`;
      }).join("")}
    </div>
    <div class="sheet-section">
      <h4>Preparación</h4>
      <ol class="steps-list">${r.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    </div>
  `;
  document.getElementById("swap-open-btn").addEventListener("click", () => openSwapSheet(dayIdx, slotKey));
  document.getElementById("recipe-sheet").classList.remove("hidden");
}

const FOOD_ROLE_EMOJI = {
  proteina_magra: "🍗", proteina_grasa: "🥩", carbohidrato: "🌾", legumbre: "🫘", verdura: "🥦",
  fruta: "🍎", grasa_saludable: "🥑", lacteo: "🥛", condimento: "🧂",
};

function openSwapSheet(dayIdx, slotKey) {
  const slotLabel = MEAL_SLOTS.find((s) => s.key === slotKey).label;
  const currentId = state.plan[dayIdx][slotKey];
  const factor = dayPortionFactor(state.plan[dayIdx], currentTargets().calories);
  const options = swapAlternatives(currentId, state.profile);
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <span class="tag">${slotLabel} · ${DAYS[dayIdx]}</span>
    <h3>Cambiar ${getRecipeInfo(currentId).recipe.name.toLowerCase()}</h3>
    <p class="hint">Mismo tipo de plato, macros parecidos. La ración se ajusta sola.</p>
    ${options.length ? `<div class="swap-list">
      ${options.map((info) => `
        <button type="button" class="swap-option" data-recipe="${info.recipe.id}">
          ${recipePhoto(info.recipe.id, { width: 120, className: "photo-thumb", fallback: mealEmoji(slotKey) })}
          <span class="swap-name">${info.recipe.name}</span>
          <span class="swap-meta">${Math.round(info.prot * factor)} g prot · ${(info.cost * factor).toFixed(2)} €</span>
        </button>`).join("")}
    </div>` : `<p class="hint">No hay otros platos de este tipo que encajen con tu dieta y tus gustos.</p>`}
    <button type="button" class="btn ghost block" id="swap-back-btn">Volver a la receta</button>
  `;
  body.querySelectorAll(".swap-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.plan[dayIdx][slotKey] = btn.dataset.recipe;
      saveState();
      track("plato-cambiado");
      renderPlanDays();
      renderDashboard();
      renderCompra();
      openRecipeSheet(dayIdx, slotKey);
    });
  });
  document.getElementById("swap-back-btn").addEventListener("click", () => openRecipeSheet(dayIdx, slotKey));
}

function closeSheet() {
  document.getElementById("recipe-sheet").classList.add("hidden");
}

// ---------- Lista de la compra ----------

function renderCompra() {
  const { plan, bought } = state;
  const { bySection, grandTotal } = buildShoppingList(plan, currentTargets().calories);
  const el = document.getElementById("compra-content");
  const sections = Object.keys(bySection).sort();

  if (!isPremium()) {
    const itemCount = Object.values(bySection).reduce((n, items) => n + items.length, 0);
    el.innerHTML = `
      <div class="locked-card">
        <div class="locked-icon">🔒</div>
        <h3>Tu lista ya está lista</h3>
        <p>${itemCount} artículos de ${sections.length} secciones, por un total estimado de <b>${grandTotal.toFixed(2)} €</b>.</p>
        <p class="hint">Desbloquéala con Premium para ver cada producto, su cantidad y su precio, listo para llevar al súper.</p>
        <button type="button" class="btn block" id="unlock-compra-btn">Desbloquear con Premium</button>
      </div>
    `;
    document.getElementById("unlock-compra-btn").addEventListener("click", () => openPaywallSheet("compra"));
    return;
  }

  el.innerHTML = sections.map((section) => {
    const items = bySection[section];
    const subtotal = items.reduce((s, it) => s + it.cost, 0);
    return `
      <div class="section-block">
        <div class="section-title">${section} · ${subtotal.toFixed(2)} €</div>
        <div class="section-items">
          ${items.map((it) => {
            const isBought = !!bought[it.foodId];
            return `
              <div class="item-row ${isBought ? "bought" : ""}" data-food="${it.foodId}">
                <div class="item-left">
                  <div class="check-circle">${isBought ? "✓" : ""}</div>
                  <div>
                    <div class="item-name">${it.name}</div>
                    <div class="item-qty">${formatQty(it.qty, it.unit)}</div>
                  </div>
                </div>
                <div class="item-cost">${it.cost.toFixed(2)} €</div>
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }).join("") + `<div class="total-row"><span>Total estimado</span><span>${grandTotal.toFixed(2)} €</span></div>`;

  el.querySelectorAll(".item-row").forEach((row) => {
    row.addEventListener("click", () => {
      const foodId = row.dataset.food;
      const newVal = !state.bought[foodId];
      state.bought[foodId] = newVal;
      row.classList.toggle("bought", newVal);
      const circle = row.querySelector(".check-circle");
      circle.textContent = newVal ? "✓" : "";
      if (newVal) {
        circle.classList.remove("bounce");
        void circle.offsetWidth; // reinicia la animación si se reutiliza
        circle.classList.add("bounce");
      }
      saveState();
    });
  });
}

// ---------- Perfil ----------

function renderPerfil() {
  const p = state.profile;
  const el = document.getElementById("perfil-content");
  const dietLabel = p.dietType === "omnivoro" ? "Como de todo" : p.dietType === "vegano" ? "Vegano" : "Vegetariano";
  const dislikesNames = p.dislikes.length ? p.dislikes.map((id) => FOODS[id].name).join(", ") : "Ninguno";
  const sportsLabel = p.sports && p.sports.length
    ? p.sports.map((s) => `${SPORTS[s.type].label} (${s.freq}×/sem, ${s.mins} min)`).join(" · ")
    : "Sin deporte registrado";

  el.innerHTML = `
    <div class="profile-card">
      <div class="profile-row"><span class="k">Sexo</span><span class="v">${p.sex === "mujer" ? "Mujer" : "Hombre"}</span></div>
      <div class="profile-row"><span class="k">Edad</span><span class="v">${p.age} años</span></div>
      <div class="profile-row"><span class="k">Peso</span><span class="v">${p.weightKg} kg</span></div>
      <div class="profile-row"><span class="k">Altura</span><span class="v">${p.heightCm} cm</span></div>
      <div class="profile-row"><span class="k">Actividad diaria</span><span class="v">${ACTIVITY_LABELS[p.activityLevel] || "—"}</span></div>
      <div class="profile-row"><span class="k">Deporte</span><span class="v">${sportsLabel}</span></div>
      <div class="profile-row"><span class="k">Objetivo</span><span class="v">${GOAL_LABELS[p.goal]}</span></div>
      <div class="profile-row"><span class="k">Dieta</span><span class="v">${dietLabel}</span></div>
      <div class="profile-row"><span class="k">Presupuesto</span><span class="v">${p.weeklyBudget ? p.weeklyBudget + " €/semana" : "Sin definir"}</span></div>
      ${state.calorieAdjust ? `<div class="profile-row"><span class="k">Ajuste de calorías</span><span class="v">${state.calorieAdjust > 0 ? "+" : ""}${state.calorieAdjust} kcal/día</span></div>` : ""}
    </div>
    <p class="hint">Alimentos que evitamos: ${dislikesNames}</p>

    <div class="section-kicker subscription-kicker">Suscripción</div>
    ${isPremium() ? `
      <div class="profile-card">
        <div class="profile-row"><span class="k">Plan</span><span class="v">✨ ${PLANS[state.subscription.plan].label} (simulado)</span></div>
        <div class="profile-row"><span class="k">Precio</span><span class="v">${state.subscription.price.toFixed(2).replace(".", ",")} €${PLANS[state.subscription.plan].periodShort}</span></div>
      </div>
      <button class="btn ghost block" id="cancel-sub-btn" type="button">Cancelar suscripción</button>
    ` : `
      <div class="profile-card">
        <div class="profile-row"><span class="k">Plan</span><span class="v">Gratis</span></div>
      </div>
      <button class="btn block" id="view-plans-btn" type="button">✨ Ver planes Premium</button>
    `}

    <button class="btn secondary block edit-profile-spacing" id="edit-profile-btn" type="button">Editar mis datos</button>
    <p class="hint privacy-note">Para mejorar NutriPlan contamos de forma anónima qué funciones se usan, sin cookies ni datos personales. Tus datos de salud se quedan en tu móvil.</p>
  `;
  document.getElementById("edit-profile-btn").addEventListener("click", enterEditMode);
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

  document.getElementById("wizard-next").addEventListener("click", () => {
    if (validateStep(wizardStep)) goToWizardStep(wizardStep + 1);
  });
  document.getElementById("wizard-back").addEventListener("click", () => {
    if (wizardStep > 0) {
      goToWizardStep(wizardStep - 1);
    } else if (wizardMode === "edit") {
      showView("perfil");
    }
  });
  document.getElementById("wizard-cancel").addEventListener("click", () => {
    showView("perfil");
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
    state.plan = generateWeeklyPlan(state.profile, currentTargets().calories);
    state.bought = {};
    saveState();
    track(previousGoal ? "perfil-editado" : "plan-generado");
    if (document.getElementById("tab-bar").classList.contains("hidden")) {
      enterApp();
    } else {
      renderAll();
      showView("dashboard");
    }
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  document.getElementById("regenerate-btn").addEventListener("click", () => {
    state.plan = generateWeeklyPlan(state.profile, currentTargets().calories);
    state.bought = {};
    saveState();
    track("plan-regenerado");
    renderDashboard();
    renderPlan();
    renderCompra();
  });

  document.getElementById("sheet-close").addEventListener("click", closeSheet);
  document.getElementById("sheet-backdrop").addEventListener("click", closeSheet);

  trackDailyOpen(isStandalone());

  if (state.profile && state.plan) {
    enterApp();
  } else {
    setWizardMode("create");
    goToWizardStep(0);
    showView("onboarding");
  }

  let splashAlreadyShown = false;
  try {
    splashAlreadyShown = sessionStorage.getItem("nutriplan_splash_shown");
    sessionStorage.setItem("nutriplan_splash_shown", "1");
  } catch (e) { /* almacenamiento no disponible, mostramos el splash igualmente */ }

  if (splashAlreadyShown) {
    const splash = document.getElementById("splash");
    if (splash) splash.remove();
  } else {
    setTimeout(dismissSplash, 1100);
  }
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* sin modo offline, la app sigue funcionando */ });
  });
}
