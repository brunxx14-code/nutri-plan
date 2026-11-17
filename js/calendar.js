/* Calendario del mes en Informes: cada día se colorea según las comidas
   hechas, para ver de un vistazo cómo vas y no querer romper la cadena. */

let calMonthOffset = 0; // 0 = este mes, -1 = el anterior...

function calLocale() {
  return currentLang === "es" ? "es-ES" : "en-GB";
}

/* El mes más antiguo con algo apuntado, para no dejar ir más atrás. */
function earliestCalOffset() {
  const days = Object.keys(state.daily || {}).sort();
  if (!days.length) return 0;
  const [y, m] = days[0].split("-").map(Number);
  const now = new Date();
  return Math.min(0, (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()));
}

function calendarMonth(offset) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // lunes = 0
  const today = todayIso();
  const cells = [];
  let onPlan = 0, best = 0, run = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = isoDate(new Date(first.getFullYear(), first.getMonth(), d));
    const entry = state.daily[iso];
    const done = mealsDone(entry);
    const future = iso > today;
    if (!future && done >= MEALS_FOR_STREAK) { onPlan++; run++; best = Math.max(best, run); } else if (!future && iso !== today) run = 0;
    cells.push({ d, iso, done, future, today: iso === today, frozen: !!(entry && entry.frozen), water: (entry && entry.water) || 0, off: entry && entry.offPlan ? Object.keys(entry.offPlan).length : 0 });
  }
  return { first, lead, cells, onPlan, best };
}

function calendarCardHtml() {
  const min = earliestCalOffset();
  calMonthOffset = Math.max(min, Math.min(0, calMonthOffset));
  const m = calendarMonth(calMonthOffset);
  const title = m.first.toLocaleDateString(calLocale(), { month: "long", year: "numeric" });
  return `
    <div class="cal-card" id="cal-card">
      <div class="cal-head">
        <button type="button" class="cal-nav" id="cal-prev" aria-label="Mes anterior" ${calMonthOffset <= min ? "disabled" : ""}>‹</button>
        <div class="cal-title">🗓️ <span class="cal-month">${title}</span></div>
        <button type="button" class="cal-nav" id="cal-next" aria-label="Mes siguiente" ${calMonthOffset >= 0 ? "disabled" : ""}>›</button>
      </div>
      <div class="cal-grid">
        ${DAYS.map((_, i) => `<span class="cal-wd">${dayInitial(i)}</span>`).join("")}
        ${"<span></span>".repeat(m.lead)}
        ${m.cells.map((c, i) => `
          <button type="button" class="cal-day lvl-${c.future ? "f" : c.done} ${c.today ? "today" : ""} ${c.frozen ? "frozen" : ""}" data-iso="${c.iso}" ${c.future ? "disabled" : ""} style="animation-delay:${i * 0.012}s">
            <span>${c.d}</span>${c.off ? '<i class="cal-off" aria-hidden="true"></i>' : ""}
          </button>`).join("")}
      </div>
      <div class="cal-legend">
        <span>Menos</span>${[0, 1, 2, 3, 4].map((l) => `<i class="cal-swatch lvl-${l}"></i>`).join("")}<span>Más</span>
      </div>
      <div class="cal-detail" id="cal-detail">Toca un día para ver el detalle</div>
      <div class="cal-stats">
        <div><b>${m.onPlan}</b><span>días cumplidos</span></div>
        <div><b>${m.best}</b><span>mejor racha</span></div>
      </div>
    </div>`;
}

function bindCalendarCard(root) {
  const card = root.querySelector("#cal-card");
  if (!card) return;
  const rerender = (delta) => {
    calMonthOffset += delta;
    buzz(6);
    card.outerHTML = calendarCardHtml();
    bindCalendarCard(root);
  };
  card.querySelector("#cal-prev").addEventListener("click", () => rerender(-1));
  card.querySelector("#cal-next").addEventListener("click", () => rerender(1));
  card.querySelectorAll(".cal-day[data-iso]").forEach((btn) => {
    btn.addEventListener("click", () => {
      card.querySelectorAll(".cal-day.sel").forEach((b) => b.classList.remove("sel"));
      btn.classList.add("sel");
      buzz(5);
      const iso = btn.dataset.iso;
      const entry = state.daily[iso];
      const [y, mo, d] = iso.split("-").map(Number);
      const label = new Date(y, mo - 1, d).toLocaleDateString(calLocale(), { weekday: "long", day: "numeric", month: "long" });
      const off = entry && entry.offPlan ? Object.keys(entry.offPlan).length : 0;
      card.querySelector("#cal-detail").innerHTML = `
        <b class="cal-date">${label}</b>
        <span>🍽️ ${mealsDone(entry)}/${MEAL_SLOTS.length} comidas</span>
        <span>💧 ${(entry && entry.water) || 0} vasos</span>
        ${off ? `<span>🍔 ${off} fuera del plan</span>` : ""}
        ${entry && entry.frozen ? "<span>🧊 Racha salvada con un protector</span>" : ""}`;
    });
  });
}
