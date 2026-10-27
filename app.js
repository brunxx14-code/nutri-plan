/* Estado y lógica de interfaz de NutriPlan. */

const STORAGE_KEY = "nutriplan_state_v1";

let state = loadState() || { profile: null, plan: null, bought: {}, subscription: null };
if (!("subscription" in state)) state.subscription = null;
let wizardStep = 0;
let wizardMode = "create"; // 'create' | 'edit'
let selectedDay = 0;

const PLANS = {
  semanal: { label: "Semanal", price: 2.49, period: "semana", periodShort: "/sem" },
  mensual: { label: "Mensual", price: 6.99, period: "mes", periodShort: "/mes", badge: "Más popular" },
  anual: { label: "Anual", price: 44.99, period: "año", periodShort: "/año", badge: "Mejor precio", note: "Equivale a 3,75 €/mes · ahorras 46% frente al plan mensual" },
};

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
      <div class="report-teaser-main" data-article="${featured.id}">
        <span class="report-cat">${featured.category}</span>
        <h4>${featured.title}</h4>
        <span class="report-meta">${featured.readMins} min de lectura</span>
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
    <div class="report-card">
      <div class="section-kicker">📰 Destacado de la semana</div>
      <div class="report-featured" data-article="${featured.id}">
        <span class="report-cat">${featured.category}</span>
        <h4>${featured.title}</h4>
        <p>${featured.teaser}</p>
        <span class="report-meta">${featured.readMins} min de lectura</span>
      </div>
    </div>
    <div class="report-card">
      <div class="section-kicker">Todos los informes</div>
      <div class="report-list">
        ${others.map((a) => `
          <div class="report-row" data-article="${a.id}">
            <span class="report-row-title">${a.title}${weeklyIds.has(a.id) ? '<span class="report-new-badge">Nuevo</span>' : ""}</span>
            <span class="report-row-meta">${a.readMins} min</span>
          </div>`).join("")}
      </div>
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
    btn.addEventListener("click", () => openPurchaseConfirm(btn.dataset.plan));
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
  document.getElementById(`view-${name}`).classList.remove("hidden");
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
  const targets = calcTargets(profile);
  const { grandTotal } = buildShoppingList(plan);
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
          ? `✅ Tu plan cuesta ~${grandTotal.toFixed(2)} € esta semana, dentro de tu presupuesto de ${profile.weeklyBudget} €.`
          : `⚠️ Tu plan cuesta ~${grandTotal.toFixed(2)} €, ${Math.abs(diff).toFixed(2)} € por encima de tu presupuesto de ${profile.weeklyBudget} €. Prueba a regenerar el plan.`}
      </div>`;
  } else {
    budgetHtml = `<div class="budget-banner ok">Coste estimado de la compra esta semana: <b>${grandTotal.toFixed(2)} €</b></div>`;
  }

  el.innerHTML = `
    <div class="goal-chip">🎯 ${GOAL_LABELS[profile.goal]}</div>
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
    ${budgetHtml}
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
  el.innerHTML = DAYS.map((day, i) => `
    <div class="day-panel ${i === selectedDay ? "active" : ""}" data-day="${i}">
      ${MEAL_SLOTS.map((slot) => {
        const info = getRecipeInfo(state.plan[i][slot.key]);
        return `
          <div class="meal-card" data-day="${i}" data-slot="${slot.key}">
            <div class="meal-emoji ${slot.key}">${mealEmoji(slot.key)}</div>
            <div class="meal-info">
              <div class="slot-label">${slot.label}</div>
              <div class="recipe-name">${info.recipe.name}</div>
              <div class="kcal">${Math.round(info.kcal)} kcal · ${info.cost.toFixed(2)} €</div>
            </div>
            <div class="chevron-right">›</div>
          </div>`;
      }).join("")}
    </div>
  `).join("");

  el.querySelectorAll(".meal-card").forEach((card) => {
    card.addEventListener("click", () => {
      const day = Number(card.dataset.day);
      const slotKey = card.dataset.slot;
      const slot = MEAL_SLOTS.find((s) => s.key === slotKey);
      openRecipeSheet(state.plan[day][slotKey], slot.label);
    });
  });
}

const TAG_COLOR_CLASS = {
  vegetariano: "", vegano: "", alto_proteina: "tag-rose", sin_gluten: "tag-amber", economico: "tag-purple",
};

function openRecipeSheet(recipeId, slotLabel) {
  const info = getRecipeInfo(recipeId);
  const r = info.recipe;
  const whySentences = explainRecipe(r, info, state.profile, slotLabel);
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <h3>${r.name}</h3>
    <div class="modal-tags">${r.tags.map((t) => `<span class="tag ${TAG_COLOR_CLASS[t] || ""}">${t.replace("_", " ")}</span>`).join("")}</div>
    <div class="macro-row">
      <span class="macro-chip">${Math.round(info.kcal)} kcal</span>
      <span class="macro-chip">${info.prot.toFixed(1)} g prot</span>
      <span class="macro-chip">${info.carbs.toFixed(1)} g carbs</span>
      <span class="macro-chip">${info.fat.toFixed(1)} g grasa</span>
      <span class="macro-chip">${info.cost.toFixed(2)} €</span>
    </div>
    <div class="sheet-section">
      <h4>Por qué esta receta</h4>
      <div class="why-block">${whySentences.map((s) => `<p>${s}</p>`).join("")}</div>
    </div>
    <div class="sheet-section">
      <h4>Ingredientes (1 ración)</h4>
      ${r.ingredients.map(([id, qty]) => {
        const food = FOODS[id];
        const role = FOOD_ROLES[food.cat];
        return `
          <div class="ingredient-row">
            <div><span class="ing-name">${food.name}</span><span class="ing-role">${role.label}</span></div>
            <div class="ing-qty">${formatQty(qty, food.unit)}</div>
          </div>`;
      }).join("")}
    </div>
    <div class="sheet-section">
      <h4>Preparación</h4>
      <ol class="steps-list">${r.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    </div>
  `;
  document.getElementById("recipe-sheet").classList.remove("hidden");
}

function closeSheet() {
  document.getElementById("recipe-sheet").classList.add("hidden");
}

// ---------- Lista de la compra ----------

function renderCompra() {
  const { plan, bought } = state;
  const { bySection, grandTotal } = buildShoppingList(plan);
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
    state.profile = readProfileFromForm(form);
    state.plan = generateWeeklyPlan(state.profile);
    state.bought = {};
    saveState();
    if (document.getElementById("tab-bar").classList.contains("hidden")) {
      enterApp();
    } else {
      renderDashboard();
      renderPlan();
      renderCompra();
      renderPerfil();
      showView("dashboard");
    }
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  document.getElementById("regenerate-btn").addEventListener("click", () => {
    state.plan = generateWeeklyPlan(state.profile);
    state.bought = {};
    saveState();
    renderDashboard();
    renderPlan();
    renderCompra();
  });

  document.getElementById("sheet-close").addEventListener("click", closeSheet);
  document.getElementById("sheet-backdrop").addEventListener("click", closeSheet);

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
