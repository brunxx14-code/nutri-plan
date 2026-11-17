/* Recetas favoritas: se guardan con el corazón de cada receta, salen más a
   menudo al regenerar el plan y se pueden poner en el día de hoy. */

function favorites() {
  if (!Array.isArray(state.favorites)) state.favorites = [];
  return state.favorites;
}

function isFavorite(recipeId) {
  return favorites().includes(recipeId);
}

function toggleFavorite(recipeId) {
  const favs = favorites();
  const i = favs.indexOf(recipeId);
  if (i >= 0) favs.splice(i, 1);
  else favs.push(recipeId);
  saveState();
  const on = i < 0;
  track(on ? "favorita-guardada" : "favorita-quitada");
  if (on && favs.length >= 3) unlockBadge("sibarita");
  return on;
}

function favButtonHtml(recipeId) {
  const on = isFavorite(recipeId);
  return `<button type="button" class="fav-btn ${on ? "on" : ""}" data-fav="${recipeId}" aria-pressed="${on}" aria-label="${on ? "Quitar de favoritas" : "Guardar en favoritas"}">${on ? "❤️" : "🤍"}</button>`;
}

/* Conecta los corazones de un trozo de pantalla; onChange se llama después. */
function bindFavButtons(root, onChange) {
  root.querySelectorAll("[data-fav]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const on = toggleFavorite(btn.dataset.fav);
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on);
      btn.setAttribute("aria-label", on ? "Quitar de favoritas" : "Guardar en favoritas");
      btn.textContent = on ? "❤️" : "🤍";
      btn.classList.remove("pop");
      void btn.offsetWidth;
      btn.classList.add("pop");
      buzz(on ? 14 : 8);
      if (on) showToast("❤️ Guardada en tus favoritas");
      renderPlanDays();
      if (onChange) onChange(on);
    });
  });
}

// ---------- Hoja de favoritas y recetario ----------

const RECIPE_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "desayuno", label: "🌅 Desayunos" },
  { key: "principal", label: "🍽️ Comidas y cenas" },
  { key: "merienda", label: "🍎 Meriendas" },
];

function recipeListItemHtml(info, today, factor) {
  const slots = MEAL_SLOTS.filter((s) => s.mealType === info.recipe.mealType);
  return `
    <div class="fav-item">
      ${recipePhoto(info.recipe.id, { width: 120, className: "photo-thumb", fallback: mealEmoji(slots[0].key) })}
      <div class="fav-info">
        <span class="fav-name">${info.recipe.name}</span>
        <span class="fav-meta">${Math.round(info.kcal * factor)} kcal · ${Math.round(info.prot * factor)} g prot · ${(info.cost * factor).toFixed(2)} €</span>
        <div class="fav-actions">
          ${slots.map((s) => state.plan[today][s.key] === info.recipe.id
            ? `<span class="fav-today">✓ En tu ${s.label.toLowerCase()} de hoy</span>`
            : `<button type="button" class="chip-btn small" data-put="${info.recipe.id}" data-slot="${s.key}">+ ${s.label} de hoy</button>`).join("")}
        </div>
      </div>
      ${favButtonHtml(info.recipe.id)}
    </div>`;
}

let recipesSheetView = { tab: "fav", filter: "all" };

function openFavoritesSheet(view) {
  if (view) recipesSheetView = { ...recipesSheetView, ...view };
  const { tab, filter } = recipesSheetView;
  track(tab === "fav" ? "favoritas-vistas" : "recetario-visto");
  const today = todayPlanIndex();
  const factor = dayFactor(today);
  const fitting = RECIPES.filter((r) => matchesProfile(r, state.profile));
  const favCount = fitting.filter((r) => isFavorite(r.id)).length;
  const list = (tab === "fav" ? fitting.filter((r) => isFavorite(r.id)) : fitting)
    .filter((r) => filter === "all" || r.mealType === filter)
    .map((r) => getRecipeInfo(r.id));
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <h3>📖 Tus recetas</h3>
    <div class="seg" role="tablist">
      <button type="button" role="tab" class="seg-btn ${tab === "fav" ? "on" : ""}" data-tab="fav" aria-selected="${tab === "fav"}">❤️ Favoritas${favCount ? ` <span class="seg-count">${favCount}</span>` : ""}</button>
      <button type="button" role="tab" class="seg-btn ${tab === "all" ? "on" : ""}" data-tab="all" aria-selected="${tab === "all"}">📖 Recetario</button>
    </div>
    ${tab === "all" || favCount ? `<div class="recipe-filters">
      ${RECIPE_FILTERS.map((f) => `<button type="button" class="chip-btn filter ${f.key === filter ? "on" : ""}" data-filter="${f.key}">${f.label}</button>`).join("")}
    </div>` : ""}
    ${list.length ? `
      ${tab === "fav" ? `<p class="hint">Salen más a menudo cuando regeneras el plan. También puedes ponerlas hoy mismo.</p>` : `<p class="hint">${list.length} recetas que encajan con tu dieta. Guarda las que te gusten con el corazón.</p>`}
      <div class="fav-list">${list.map((info) => recipeListItemHtml(info, today, factor)).join("")}</div>` : tab === "fav" && !favCount ? `
      <div class="fav-empty">
        <div class="fav-empty-heart">🤍</div>
        <p>Aún no tienes favoritas. Toca el corazón de cualquier receta para guardarla aquí.</p>
        <button type="button" class="btn secondary" data-tab="all">📖 Ver el recetario</button>
      </div>` : `<p class="hint fav-none">No hay recetas de este tipo.</p>`}
  `;
  body.querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => {
    buzz(6);
    openFavoritesSheet({ tab: btn.dataset.tab, filter: "all" });
  }));
  body.querySelectorAll("[data-filter]").forEach((btn) => btn.addEventListener("click", () => {
    buzz(6);
    openFavoritesSheet({ filter: btn.dataset.filter });
  }));
  bindFavButtons(body, () => {
    if (recipesSheetView.tab === "fav") openFavoritesSheet();
    else updateFavCount(body);
  });
  body.querySelectorAll("[data-put]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.plan[today][btn.dataset.slot] = btn.dataset.put;
      saveState();
      track("favorita-puesta-hoy");
      buzz(12);
      renderPlanDays();
      renderDashboard();
      renderCompra();
      showToast("✅ ¡Hecho! Ya está en tu plan de hoy");
      openRecipeSheet(today, btn.dataset.slot);
    });
  });
  openSheet();
}

function updateFavCount(body) {
  const n = RECIPES.filter((r) => matchesProfile(r, state.profile) && isFavorite(r.id)).length;
  const tab = body.querySelector('[data-tab="fav"]');
  if (tab) tab.innerHTML = `❤️ Favoritas${n ? ` <span class="seg-count">${n}</span>` : ""}`;
}
