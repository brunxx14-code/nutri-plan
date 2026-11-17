/* ¿Qué cocino con lo que tengo? Marcas lo que hay en la nevera y la despensa,
   y la app ordena las recetas que encajan con tu dieta según lo poco que te
   falta. Si eliges una, sustituye la próxima comida de hoy de ese tipo, con
   la ración ya ajustada a tus calorías.

   Aprovechar lo que ya tienes es la forma más directa de tirar menos comida:
   en España casi la mitad del desperdicio alimentario se produce en los
   hogares (MAPA, Panel de desperdicio alimentario 2023). */

// Básicos que casi todo el mundo tiene; no cuentan como "te falta".
const FRIDGE_STAPLES = ["aceite_oliva", "ajo", "limon", "miel"];
const FRIDGE_MAX_RESULTS = 8;
const FRIDGE_MAX_MISSING = 2;

function fridgeItems() {
  if (!Array.isArray(state.fridge)) state.fridge = [];
  return state.fridge;
}

function fridgeHas(id) {
  return FRIDGE_STAPLES.includes(id) || fridgeItems().includes(id);
}

/* Recetas que puedes hacer, de menos a más ingredientes por comprar. */
function fridgeMatches() {
  if (!fridgeItems().length) return [];
  return RECIPES.filter((r) => matchesProfile(r, state.profile))
    .map((r) => {
      const needed = r.ingredients.map(([id]) => id).filter((id) => !FRIDGE_STAPLES.includes(id));
      const have = needed.filter((id) => fridgeHas(id));
      const missing = needed.filter((id) => !fridgeHas(id));
      return { recipe: r, have, missing, coverage: needed.length ? have.length / needed.length : 0 };
    })
    .filter((m) => m.have.length && m.missing.length <= FRIDGE_MAX_MISSING)
    .sort((a, b) => a.missing.length - b.missing.length || b.coverage - a.coverage)
    .slice(0, FRIDGE_MAX_RESULTS);
}

/* Hueco de hoy donde encaja la receta: el siguiente sin hacer de ese tipo. */
function fridgeTargetSlot(recipe) {
  const entry = dailyEntry();
  const eaten = (entry && entry.eaten) || {};
  const slots = MEAL_SLOTS.filter((s) => s.mealType === recipe.mealType);
  return slots.find((s) => !eaten[s.key]) || slots[0];
}

function fridgeCardHtml() {
  const n = fridgeItems().length;
  const best = fridgeMatches()[0];
  return `
    <button type="button" class="fridge-card" id="fridge-card">
      <span class="fridge-emoji" aria-hidden="true">🧊</span>
      <span class="fridge-body">
        <b>¿Qué cocino con lo que tengo?</b>
        <small>${n
          ? best ? `Con lo que tienes: ${best.recipe.name}${best.missing.length ? ` (te falta ${best.missing.length})` : ""}` : "Añade algo más a tu nevera para ver ideas"
          : "Marca lo que hay en tu nevera y te damos ideas"}</small>
      </span>
      <span class="chevron-right" aria-hidden="true">›</span>
    </button>`;
}

function openFridgeSheet(tab = fridgeItems().length ? "ideas" : "nevera") {
  track(tab === "ideas" ? "nevera-ideas" : "nevera-abierta");
  const body = document.getElementById("sheet-body");
  const sections = {};
  for (const [id, f] of Object.entries(FOODS)) {
    if (FRIDGE_STAPLES.includes(id)) continue;
    (sections[f.section] = sections[f.section] || []).push(id);
  }
  const bought = Object.keys(state.bought || {}).filter((id) => state.bought[id] && FOODS[id]);
  const matches = fridgeMatches();
  const factor = dayFactor(todayPlanIndex());

  body.innerHTML = `
    <h3>🧊 Cocina con lo que tienes</h3>
    <div class="seg" role="tablist">
      <button type="button" role="tab" class="seg-btn ${tab === "nevera" ? "on" : ""}" data-fridge-tab="nevera" aria-selected="${tab === "nevera"}">🧺 Mi nevera <span class="seg-count">${fridgeItems().length}</span></button>
      <button type="button" role="tab" class="seg-btn ${tab === "ideas" ? "on" : ""}" data-fridge-tab="ideas" aria-selected="${tab === "ideas"}">💡 Ideas</button>
    </div>
    ${tab === "nevera" ? `
      <p class="hint">Toca lo que tienes en casa. Aceite, ajo, limón y miel ya los damos por hechos.</p>
      ${bought.length ? `<button type="button" class="chip-btn small fridge-bought" id="fridge-from-bought">🛒 Añadir lo que marcaste en la compra (${bought.length})</button>` : ""}
      ${Object.entries(sections).map(([sec, ids]) => `
        <div class="fridge-section">
          <div class="section-kicker">${(SECTION_STYLE[sec] || {}).emoji || ""} ${sec}</div>
          <div class="fridge-grid">
            ${ids.map((id) => `
              <button type="button" class="fridge-item ${fridgeItems().includes(id) ? "on" : ""}" data-food="${id}" aria-pressed="${fridgeItems().includes(id)}">
                <span aria-hidden="true">${FOOD_EMOJI[id] || "•"}</span>${FOODS[id].name}
              </button>`).join("")}
          </div>
        </div>`).join("")}
      <div class="fridge-actions">
        ${fridgeItems().length ? `<button type="button" class="btn ghost small" id="fridge-clear">Vaciar</button>` : ""}
        <button type="button" class="btn" data-fridge-tab="ideas">Ver qué puedo cocinar</button>
      </div>` : `
      ${matches.length ? `
        <p class="hint">Ordenadas por lo poco que te falta. Al elegir una, cambia tu próxima comida de hoy de ese tipo.</p>
        <div class="fridge-results">
          ${matches.map((m) => {
            const info = getRecipeInfo(m.recipe.id);
            const slot = fridgeTargetSlot(m.recipe);
            return `
            <div class="fridge-result">
              ${recipePhoto(m.recipe.id, { width: 120, className: "photo-thumb", fallback: mealEmoji(slot.key) })}
              <div class="fridge-result-body">
                <b>${m.recipe.name}</b>
                <small>${m.missing.length
                  ? `Te falta: ${m.missing.map((id) => FOODS[id].name.toLowerCase()).join(", ")}`
                  : "✅ Lo tienes todo"} · ${Math.round(info.kcal * factor)} kcal</small>
                <button type="button" class="chip-btn small" data-cook="${m.recipe.id}" data-slot="${slot.key}">🍳 Para ${slot.label.toLowerCase()} de hoy</button>
              </div>
            </div>`;
          }).join("")}
        </div>` : `
        <div class="fav-empty">
          <div class="fav-empty-heart">🧺</div>
          <p>${fridgeItems().length
            ? "Con eso aún no sale ninguna receta. Añade algún ingrediente más, como una proteína o un cereal."
            : "Primero cuéntanos qué tienes en casa."}</p>
          <button type="button" class="btn secondary" data-fridge-tab="nevera">🧺 Ir a mi nevera</button>
        </div>`}`}
  `;

  body.querySelectorAll("[data-fridge-tab]").forEach((b) => b.addEventListener("click", () => openFridgeSheet(b.dataset.fridgeTab)));
  body.querySelectorAll(".fridge-item").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.food;
    const list = fridgeItems();
    const i = list.indexOf(id);
    if (i === -1) list.push(id); else list.splice(i, 1);
    saveState();
    buzz(6);
    b.classList.toggle("on", i === -1);
    b.setAttribute("aria-pressed", i === -1);
    const count = body.querySelector('[data-fridge-tab="nevera"] .seg-count');
    if (count) count.textContent = list.length;
  }));
  const fromBought = body.querySelector("#fridge-from-bought");
  if (fromBought) fromBought.addEventListener("click", () => {
    const list = fridgeItems();
    bought.forEach((id) => { if (!list.includes(id)) list.push(id); });
    saveState();
    track("nevera-desde-compra");
    openFridgeSheet("nevera");
  });
  const clear = body.querySelector("#fridge-clear");
  if (clear) clear.addEventListener("click", () => {
    state.fridge = [];
    saveState();
    openFridgeSheet("nevera");
  });
  body.querySelectorAll("[data-cook]").forEach((b) => b.addEventListener("click", () => {
    const dayIdx = todayPlanIndex();
    state.plan[dayIdx][b.dataset.slot] = b.dataset.cook;
    saveState();
    track("nevera-cocinar");
    renderPlanDays();
    renderDashboard();
    renderCompra();
    openRecipeSheet(dayIdx, b.dataset.slot);
    showToast("🧊 Plato cambiado: aprovechas lo que tienes");
  }));
  if (!document.getElementById("recipe-sheet").classList.contains("hidden")) return;
  openSheet();
}

function refreshFridgeCard() {
  const card = document.getElementById("fridge-card");
  if (!card) return;
  card.outerHTML = fridgeCardHtml();
  document.getElementById("fridge-card").addEventListener("click", () => openFridgeSheet());
}

const FRIDGE_CSS = `
.fridge-card { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 14px; margin: 0 0 14px; border: 0; border-radius: var(--radius-lg); background: var(--card); box-shadow: var(--shadow-card); color: var(--ink); font: inherit; cursor: pointer; }
.fridge-card:active { transform: scale(.985); }
.fridge-emoji { font-size: 26px; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; background: var(--purple-light); flex: none; }
.fridge-body { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.fridge-body b { font-size: 15px; }
.fridge-body small { color: var(--muted); font-size: 12.5px; line-height: 1.35; }
.fridge-bought { margin: 4px 0 6px; }
.fridge-section { margin-top: 14px; }
.fridge-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.fridge-item { display: inline-flex; align-items: center; gap: 6px; padding: 7px 11px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--ink); font: inherit; font-size: 13px; cursor: pointer; }
.fridge-item.on { background: var(--green-light); border-color: var(--green); color: var(--green-dark); font-weight: 600; }
.fridge-actions { display: flex; gap: 8px; margin-top: 18px; position: sticky; bottom: 0; padding: 10px 0 4px; background: var(--card); }
.fridge-actions .btn:last-child { flex: 1; }
.fridge-results { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.fridge-result { display: flex; gap: 12px; align-items: flex-start; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-md); }
.fridge-result .photo-thumb { flex: none; }
.fridge-result-body { flex: 1; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; min-width: 0; }
.fridge-result-body b { font-size: 14px; }
.fridge-result-body small { color: var(--muted); font-size: 12px; line-height: 1.35; }
`;

document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = FRIDGE_CSS;
  document.head.appendChild(style);

  const baseDashboard = renderDashboard;
  renderDashboard = function () {
    baseDashboard.apply(this, arguments);
    const el = document.getElementById("dashboard-content");
    const anchor = el.querySelector("#today-card");
    if (anchor) anchor.insertAdjacentHTML("afterend", fridgeCardHtml());
    else el.insertAdjacentHTML("beforeend", fridgeCardHtml());
    document.getElementById("fridge-card").addEventListener("click", () => openFridgeSheet());
  };

  // al cerrar la hoja, la tarjeta del resumen refleja lo que has marcado
  const baseClose = closeSheet;
  closeSheet = function () {
    baseClose.apply(this, arguments);
    refreshFridgeCard();
  };
});
