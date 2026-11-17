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

// ---------- Hoja de favoritas ----------

function openFavoritesSheet() {
  track("favoritas-vistas");
  const today = todayPlanIndex();
  const favs = favorites()
    .filter((id) => RECIPES.some((r) => r.id === id))
    .map((id) => getRecipeInfo(id))
    .filter((info) => matchesProfile(info.recipe, state.profile));
  const factor = dayFactor(today);
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <h3>❤️ Tus favoritas</h3>
    ${favs.length ? `
      <p class="hint">Salen más a menudo cuando regeneras el plan. También puedes ponerlas hoy mismo.</p>
      <div class="fav-list">
        ${favs.map((info) => {
          const slots = MEAL_SLOTS.filter((s) => s.mealType === info.recipe.mealType);
          return `
          <div class="fav-item">
            ${recipePhoto(info.recipe.id, { width: 120, className: "photo-thumb", fallback: mealEmoji(slots[0].key) })}
            <div class="fav-info">
              <span class="fav-name">${info.recipe.name}</span>
              <span class="fav-meta">${Math.round(info.kcal * factor)} kcal · ${Math.round(info.prot * factor)} g prot</span>
              <div class="fav-actions">
                ${slots.map((s) => state.plan[today][s.key] === info.recipe.id
                  ? `<span class="fav-today">✓ En tu ${s.label.toLowerCase()} de hoy</span>`
                  : `<button type="button" class="chip-btn small" data-put="${info.recipe.id}" data-slot="${s.key}">+ ${s.label} de hoy</button>`).join("")}
              </div>
            </div>
            ${favButtonHtml(info.recipe.id)}
          </div>`;
        }).join("")}
      </div>` : `
      <div class="fav-empty">
        <div class="fav-empty-heart">🤍</div>
        <p>Aún no tienes favoritas. Toca el corazón de cualquier receta para guardarla aquí.</p>
      </div>`}
  `;
  bindFavButtons(body, (on) => { if (!on) openFavoritesSheet(); });
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
