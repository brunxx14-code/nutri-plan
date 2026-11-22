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

// «1 vaso», no «1 vasos» (en inglés, «1 glass»)
function waterLabel(n) {
  return n === 1 ? "1 vaso" : `${n} vasos`;
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

/* El lector de pantalla oía solo «21»; ahora oye el día y cómo fue,
   con las mismas palabras que «Tu semana»: «sábado, 21 de noviembre: 2 comidas». */
function calDayLabel(c) {
  const [y, mo, d] = c.iso.split("-").map(Number);
  const name = new Date(y, mo - 1, d).toLocaleDateString(calLocale(), { weekday: "long", day: "numeric", month: "long" });
  if (c.future) return `${name}: todavía no ha llegado`;
  if (c.done >= MEALS_FOR_STREAK) return `${name}: día cumplido`;
  // el día con 🧊 lo decía solo el color; ahora también el lector de pantalla
  if (c.frozen) return `${name}: racha salvada con un protector`;
  if (!c.done) return `${name}: sin comidas`;
  return c.done === 1 ? `${name}: 1 comida` : `${name}: ${c.done} comidas`;
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
          <button type="button" class="cal-day lvl-${c.future ? "f" : c.done} ${c.today ? "today" : ""} ${c.frozen ? "frozen" : ""}" data-iso="${c.iso}" aria-label="${calDayLabel(c)}" aria-pressed="false" ${c.today ? 'aria-current="date"' : ""} ${c.future ? "disabled" : ""} style="animation-delay:${i * 0.012}s">
            <span>${c.d}</span>${c.off ? '<i class="cal-off" aria-hidden="true"></i>' : ""}
          </button>`).join("")}
      </div>
      <div class="cal-legend">
        <span>Menos</span>${[0, 1, 2, 3, 4].map((l) => `<i class="cal-swatch lvl-${l}"></i>`).join("")}<span>Más</span>
      </div>
      <div class="cal-detail" id="cal-detail" aria-live="polite">Toca un día para ver el detalle</div>
      <div class="cal-stats">
        <div><b>${m.onPlan}</b><span>días cumplidos</span></div>
        <div><b>${m.best}</b><span>mejor racha</span></div>
      </div>
    </div>`;
}

function bindCalendarCard(root) {
  const card = root.querySelector("#cal-card");
  if (!card) return;
  const rerender = (delta, fromDay) => {
    calMonthOffset += delta;
    buzz(6);
    card.outerHTML = calendarCardHtml();
    bindCalendarCard(root);
    if (fromDay) {
      // con RePág/AvPág desde un día, el foco pasa al mismo día del otro mes (o al último que haya)
      const left = [...root.querySelectorAll("#cal-card .cal-day[data-iso]:not(:disabled)")];
      const to = left.find((b) => Number(b.dataset.iso.slice(8)) === fromDay) || left[left.length - 1];
      if (to) { to.focus({ preventScroll: true }); return; }
    }
    // el foco se queda en la flecha que pulsaste; si ya no se puede ir más allá, pasa a la otra
    const same = root.querySelector(delta < 0 ? "#cal-prev" : "#cal-next");
    const other = root.querySelector(delta < 0 ? "#cal-next" : "#cal-prev");
    (same.disabled ? other : same).focus({ preventScroll: true });
  };
  card.querySelector("#cal-prev").addEventListener("click", () => rerender(-1));
  card.querySelector("#cal-next").addEventListener("click", () => rerender(1));
  // con teclado los días se recorren con las flechas, como un calendario del sistema:
  // ← → un día, ↑ ↓ una semana, Inicio y Fin al primero y al último, RePág y AvPág de mes; Tab entra solo en uno
  const days = [...card.querySelectorAll(".cal-day[data-iso]")];
  const usable = days.filter((b) => !b.disabled);
  const rove = (btn) => days.forEach((b) => b.setAttribute("tabindex", b === btn ? "0" : "-1"));
  rove(usable.find((b) => b.classList.contains("today")) || usable[0]);
  card.querySelector(".cal-grid").addEventListener("keydown", (e) => {
    const i = days.indexOf(e.target);
    if (i < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    let to = null;
    if (step) to = days[i + step];
    else if (e.key === "Home") to = usable[0];
    else if (e.key === "End") to = usable[usable.length - 1];
    else if (e.key === "PageUp" || e.key === "PageDown") {
      // RePág y AvPág cambian de mes, como ‹ y ›
      e.preventDefault();
      const arrow = card.querySelector(e.key === "PageUp" ? "#cal-prev" : "#cal-next");
      if (!arrow.disabled) rerender(e.key === "PageUp" ? -1 : 1, Number(e.target.dataset.iso.slice(8)));
      return;
    }
    else return;
    e.preventDefault();
    if (!to || to.disabled) return;
    rove(to);
    to.focus({ preventScroll: true });
  });
  days.forEach((btn) => btn.addEventListener("focus", () => rove(btn)));
  days.forEach((btn) => {
    btn.addEventListener("click", () => {
      card.querySelectorAll(".cal-day.sel").forEach((b) => { b.classList.remove("sel"); b.setAttribute("aria-pressed", "false"); });
      btn.classList.add("sel");
      btn.setAttribute("aria-pressed", "true");
      buzz(5);
      const iso = btn.dataset.iso;
      const entry = state.daily[iso];
      const [y, mo, d] = iso.split("-").map(Number);
      const label = new Date(y, mo - 1, d).toLocaleDateString(calLocale(), { weekday: "long", day: "numeric", month: "long" });
      const off = entry && entry.offPlan ? Object.keys(entry.offPlan).length : 0;
      card.querySelector("#cal-detail").innerHTML = `
        <b class="cal-date">${label}</b>
        <span>🍽️ ${mealsDone(entry)}/${MEAL_SLOTS.length} comidas</span>
        <span>💧 ${waterLabel((entry && entry.water) || 0)}</span>
        ${off ? `<span>🍔 ${off} fuera del plan</span>` : ""}
        ${entry && entry.frozen ? "<span>🧊 Racha salvada con un protector</span>" : ""}`;
    });
  });
}
