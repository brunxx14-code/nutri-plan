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
        <span class="fav-meta">${Math.round(info.kcal * factor)} kcal · ${Math.round(info.prot * factor)} g prot · ${euro(info.cost * factor)} €</span>
        <div class="fav-actions">
          ${slots.map((s) => state.plan[today][s.key] === info.recipe.id
            ? `<span class="fav-today">✓ En tu ${s.label.toLowerCase()} de hoy</span>`
            : `<button type="button" class="chip-btn small" data-put="${info.recipe.id}" data-slot="${s.key}">+ ${s.label} de hoy</button>`).join("")}
        </div>
      </div>
      ${favButtonHtml(info.recipe.id)}
    </div>`;
}

let recipesSheetView = { tab: "fav", filter: "all", sort: "rec", query: "" };

const RECIPE_SORTS = [
  { key: "rec", label: "✨ Recomendadas" },
  { key: "prot", label: "💪 Más proteína" },
  { key: "cost", label: "💶 Más baratas" },
  { key: "kcal", label: "🔥 Menos kcal" },
];

function normalizeText(t) {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* Busca en el nombre de la receta y en sus ingredientes. */
function recipeMatches(recipe, query) {
  if (!query) return true;
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  const haystack = normalizeText([recipe.name, ...recipe.ingredients.map(([id]) => FOODS[id].name)].join(" "));
  return words.every((w) => haystack.includes(w));
}

function recipesForView() {
  const { tab, filter, sort, query } = recipesSheetView;
  const list = RECIPES.filter((r) => matchesProfile(r, state.profile))
    .filter((r) => tab !== "fav" || isFavorite(r.id))
    .filter((r) => filter === "all" || r.mealType === filter)
    .filter((r) => tab !== "all" || recipeMatches(r, query))
    .map((r) => getRecipeInfo(r.id));
  const by = {
    prot: (a, b) => b.prot / b.kcal - a.prot / a.kcal,
    cost: (a, b) => a.cost - b.cost,
    kcal: (a, b) => a.kcal - b.kcal,
  }[sort];
  if (tab === "all" && by) list.sort(by);
  return list;
}

function recipesResultsHtml(list, today, factor) {
  const { tab, query } = recipesSheetView;
  if (!list.length) return `<p class="hint fav-none">${tab === "all" && query ? "No hay recetas que coincidan con tu búsqueda." : "No hay recetas de este tipo."}</p>${tab === "all" && query ? `<button type="button" class="chip-btn small" id="recipe-search-clear">✕ Borrar búsqueda</button>` : ""}`;
  return `
    ${tab === "fav" ? `<p class="hint">Salen más a menudo cuando regeneras el plan. También puedes ponerlas hoy mismo.</p>` : `<p class="hint">${list.length} recetas que encajan con tu dieta. Guarda las que te gusten con el corazón.</p>`}
    <div class="fav-list">${list.map((info) => recipeListItemHtml(info, today, factor)).join("")}</div>`;
}

function openFavoritesSheet(view) {
  if (view) recipesSheetView = { ...recipesSheetView, ...view };
  const { tab, filter, sort, query } = recipesSheetView;
  track(tab === "fav" ? "favoritas-vistas" : "recetario-visto");
  const today = todayPlanIndex();
  const factor = dayFactor(today);
  const favCount = RECIPES.filter((r) => matchesProfile(r, state.profile) && isFavorite(r.id)).length;
  const list = recipesForView();
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <h3>📖 Tus recetas</h3>
    <div class="seg" role="tablist">
      <button type="button" role="tab" class="seg-btn ${tab === "fav" ? "on" : ""}" data-tab="fav" aria-selected="${tab === "fav"}" tabindex="${tab === "fav" ? 0 : -1}">❤️ Favoritas${favCount ? ` <span class="seg-count">${favCount}</span>` : ""}</button>
      <button type="button" role="tab" class="seg-btn ${tab === "all" ? "on" : ""}" data-tab="all" aria-selected="${tab === "all"}" tabindex="${tab === "all" ? 0 : -1}">📖 Recetario</button>
    </div>
    ${tab === "all" ? `
      <label class="recipe-search">
        <span aria-hidden="true">🔍</span>
        <input type="search" id="recipe-search" placeholder="Busca por plato o ingrediente" aria-label="Busca por plato o ingrediente" value="${query.replace(/"/g, "&quot;")}" autocomplete="off">
      </label>` : ""}
    ${tab === "all" || favCount ? `<div class="recipe-filters" role="group" aria-label="Tipo de plato">
      ${RECIPE_FILTERS.map((f) => `<button type="button" class="chip-btn filter ${f.key === filter ? "on" : ""}" data-filter="${f.key}" aria-pressed="${f.key === filter}">${f.label}</button>`).join("")}
    </div>` : ""}
    ${tab === "all" ? `<div class="recipe-filters sorts" role="group" aria-label="Ordenar por">
      ${RECIPE_SORTS.map((o) => `<button type="button" class="chip-btn filter sort ${o.key === sort ? "on" : ""}" data-sort="${o.key}" aria-pressed="${o.key === sort}">${o.label}</button>`).join("")}
    </div>` : ""}
    ${tab === "fav" && !favCount ? `
      <div class="fav-empty">
        <div class="fav-empty-heart">🤍</div>
        <p>Aún no tienes favoritas. Toca el corazón de cualquier receta para guardarla aquí.</p>
        <button type="button" class="btn secondary" data-tab="all">📖 Ver el recetario</button>
      </div>` : `<div id="recipes-results">${recipesResultsHtml(list, today, factor)}</div>`}
  `;
  bindRecipeResults(body, today);
  body.querySelectorAll("[data-sort]").forEach((btn) => btn.addEventListener("click", () => {
    buzz(6);
    rerenderRecipesSheet({ sort: btn.dataset.sort }, `[data-sort="${btn.dataset.sort}"]`);
  }));
  const search = body.querySelector("#recipe-search");
  if (search) {
    let timer = null;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        recipesSheetView.query = search.value.trim();
        const box = body.querySelector("#recipes-results");
        box.innerHTML = recipesResultsHtml(recipesForView(), today, dayFactor(today));
        bindRecipeResults(box, today);
      }, 120);
    });
    search.addEventListener("change", () => { if (search.value.trim()) track("receta-buscada"); });
  }
  const goTab = (t) => {
    buzz(6);
    openFavoritesSheet({ tab: t, filter: "all", query: "" });
    document.querySelector(`#sheet-body [role="tab"][data-tab="${t}"]`)?.focus({ preventScroll: true });
  };
  body.querySelectorAll("[data-tab]").forEach((btn) => btn.addEventListener("click", () => goTab(btn.dataset.tab)));
  // pestañas con teclado: ← y → pasan de «Favoritas» a «Recetario» y al revés
  body.querySelectorAll('[role="tab"]').forEach((btn) => btn.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    goTab(btn.dataset.tab === "fav" ? "all" : "fav");
  }));
  body.querySelectorAll("[data-filter]").forEach((btn) => btn.addEventListener("click", () => {
    buzz(6);
    rerenderRecipesSheet({ filter: btn.dataset.filter }, `[data-filter="${btn.dataset.filter}"]`);
  }));
  openSheet();
}

/* Al cambiar filtro u orden con la hoja abierta, la hoja no sube arriba
   y el foco se queda en el botón que tocaste. */
function rerenderRecipesSheet(view, focusSelector) {
  const card = document.querySelector("#recipe-sheet .sheet-card");
  const top = card ? card.scrollTop : 0;
  openFavoritesSheet(view);
  if (card) card.scrollTop = top;
  const target = document.querySelector(`#sheet-body ${focusSelector}`);
  if (target) target.focus({ preventScroll: true });
}

function bindRecipeResults(root, today) {
  const clear = root.querySelector("#recipe-search-clear");
  if (clear) clear.addEventListener("click", () => {
    const search = document.getElementById("recipe-search");
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    search.focus();
  });
  bindFavButtons(root, () => {
    if (recipesSheetView.tab === "fav") openFavoritesSheet();
    else updateFavCount(document.getElementById("sheet-body"));
  });
  root.querySelectorAll("[data-put]").forEach((btn) => {
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
}

function updateFavCount(body) {
  const n = RECIPES.filter((r) => matchesProfile(r, state.profile) && isFavorite(r.id)).length;
  const tab = body.querySelector('[data-tab="fav"]');
  if (tab) tab.innerHTML = `❤️ Favoritas${n ? ` <span class="seg-count">${n}</span>` : ""}`;
}
