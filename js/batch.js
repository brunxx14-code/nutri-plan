/* Batch cooking: a partir de las comidas y cenas de tu semana, prepara una
   sesión de cocina del domingo. Junta lo que se puede cocinar de una vez
   (cereales, legumbres, carne, patata y boniato, verdura cortada), con las
   cantidades de tus raciones, el orden para aprovechar horno y fuegos, y qué
   va a la nevera y qué al congelador.

   Seguridad alimentaria (AESAN y USDA FSIS):
   - La comida cocinada aguanta 3-4 días en la nevera: de lunes a miércoles.
     Lo de jueves a domingo se congela y se pasa a la nevera la noche antes.
   - Enfriar y guardar en menos de 2 horas. El arroz, cuanto antes: si pasa
     horas a temperatura ambiente puede crecer Bacillus cereus.
   - El pescado fresco se cocina el mismo día o se congela crudo. */

const BATCH_FRIDGE_DAYS = 3; // lunes, martes y miércoles salen de la nevera
const BATCH_SLOTS = ["comida", "cena"];

/* Qué se hace con cada alimento en la sesión. min = minutos aproximados. */
const BATCH_PREP = {
  arroz:          { kind: "fuego", min: 18, how: "Cuece el arroz y enfríalo extendido en una bandeja", raw: true },
  pasta:          { kind: "fuego", min: 10, how: "Cuece la pasta al dente y mézclala con un hilo de aceite", raw: true },
  quinoa:         { kind: "fuego", min: 15, how: "Lava la quinoa y cuécela", raw: true },
  lentejas:       { kind: "fuego", min: 35, how: "Cuece las lentejas (en olla exprés, 10 min)", raw: true },
  patata:         { kind: "horno", min: 40, how: "Asa o cuece la patata en dados" },
  boniato:        { kind: "horno", min: 35, how: "Asa el boniato en dados" },
  pollo_pechuga:  { kind: "horno", min: 25, how: "Hornea las pechugas de pollo a 200 °C" },
  pollo_muslo:    { kind: "horno", min: 35, how: "Hornea los contramuslos a 200 °C" },
  pavo_filete:    { kind: "fuego", min: 10, how: "Haz los filetes de pavo a la plancha" },
  lomo_cerdo:     { kind: "fuego", min: 10, how: "Haz el lomo a la plancha" },
  ternera_picada: { kind: "fuego", min: 15, how: "Sofríe la carne picada" },
  tofu:           { kind: "horno", min: 25, how: "Escurre el tofu, córtalo en dados y hornéalo hasta que dore", emoji: "🧈" },
  brocoli:        { kind: "fuego", min: 6, how: "Escalda el brócoli en ramitos (que quede firme)" },
  pimiento:       { kind: "corte", min: 4, how: "Corta el pimiento en tiras" },
  cebolla:        { kind: "corte", min: 4, how: "Pica la cebolla" },
  calabacin:      { kind: "corte", min: 4, how: "Corta el calabacín en dados" },
  zanahoria:      { kind: "corte", min: 4, how: "Pela y corta la zanahoria" },
};
const BATCH_FISH = ["salmon", "merluza", "gambas"];
const BATCH_KIND = {
  horno: { emoji: "🔥", label: "Al horno, todo a la vez" },
  fuego: { emoji: "🍳", label: "En los fuegos, mientras el horno trabaja" },
  corte: { emoji: "🔪", label: "Cortar y guardar en táperes" },
};

/* La sesión de esta semana a partir del plan. */
function batchSession() {
  const totals = {};
  const meals = [];
  let fish = 0;
  DAYS.forEach((dayName, i) => {
    const factor = dayFactor(i);
    for (const slot of BATCH_SLOTS) {
      const recipe = getRecipeInfo(state.plan[i][slot]).recipe;
      const uses = [];
      for (const [id, qty] of recipe.ingredients) {
        if (BATCH_PREP[id]) {
          totals[id] = (totals[id] || 0) + qty * factor;
          uses.push(id);
        } else if (BATCH_FISH.includes(id)) fish++;
      }
      meals.push({ day: i, dayName, slot, recipe, uses, store: i < BATCH_FRIDGE_DAYS ? "nevera" : "congelador" });
    }
  });
  const tasks = Object.entries(totals).map(([id, qty]) => ({ id, qty, ...BATCH_PREP[id] }));
  const byKind = { horno: [], fuego: [], corte: [] };
  tasks.forEach((t) => byKind[t.kind].push(t));
  Object.values(byKind).forEach((list) => list.sort((a, b) => b.min - a.min));
  // El horno va en paralelo; con dos fuegos, lo de la cocina tarda la mitad.
  const oven = Math.max(0, ...byKind.horno.map((t) => t.min));
  const stove = byKind.fuego.reduce((s, t) => s + t.min, 0) / 2;
  const chop = byKind.corte.reduce((s, t) => s + t.min, 0);
  const minutes = tasks.length ? Math.ceil((Math.max(oven, stove) + chop + 15) / 15) * 15 : 0;
  const containers = meals.filter((m) => m.uses.length).length;
  return { byKind, meals, minutes, containers, fish, count: tasks.length };
}

function formatMinutes(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

function batchBannerHtml() {
  const s = batchSession();
  if (!s.count) return "";
  return `
    <button type="button" class="batch-banner" id="batch-banner">
      <span class="batch-emoji" aria-hidden="true">🥡</span>
      <span class="batch-text"><b>Batch cooking del domingo</b><small>Unos ${formatMinutes(s.minutes)} de cocina y ${s.containers} comidas listas</small></span>
      <span class="chevron-right" aria-hidden="true">›</span>
    </button>`;
}

function openBatchSheet() {
  track("batch-abierto");
  const s = batchSession();
  const body = document.getElementById("sheet-body");
  const done = (state.batchDone && state.batchDone.week === weekDates()[0]) ? state.batchDone.steps : {};
  const stepHtml = (t) => `
    <label class="batch-step ${done[t.id] ? "done" : ""}">
      <input type="checkbox" data-step="${t.id}" ${done[t.id] ? "checked" : ""}>
      <span class="batch-step-text">${t.emoji || FOOD_EMOJI[t.id] || "•"} ${t.how}
        <small>${formatQty(t.qty, FOODS[t.id].unit)}${t.raw ? " en crudo" : ""} · ${t.min} min</small></span>
    </label>`;

  body.innerHTML = `
    <h3>🥡 Batch cooking del domingo</h3>
    <div class="batch-stats">
      <div><b>${formatMinutes(s.minutes)}</b><span>de cocina</span></div>
      <div><b>${s.containers}</b><span>táperes</span></div>
      <div><b>${BATCH_FRIDGE_DAYS}</b><span>días en nevera</span></div>
    </div>
    <p class="hint">Cantidades para las comidas y cenas de toda la semana, ya ajustadas a tus raciones. Marca cada paso al terminarlo.</p>
    ${Object.entries(BATCH_KIND).map(([kind, k]) => s.byKind[kind].length ? `
      <div class="sheet-section">
        <h4>${k.emoji} ${k.label}</h4>
        ${s.byKind[kind].map(stepHtml).join("")}
      </div>` : "").join("")}
    ${s.fish ? `<p class="batch-tip">🐟 El pescado no entra en la sesión: cocínalo el mismo día, o congélalo crudo en raciones y descongélalo en la nevera la noche antes.</p>` : ""}
    <div class="sheet-section">
      <h4>📦 Cómo repartirlo</h4>
      <div class="batch-days">
        ${s.meals.filter((m) => m.uses.length).map((m) => `
          <div class="batch-day">
            <span class="batch-store ${m.store}">${m.store === "nevera" ? "🧊 Nevera" : "❄️ Congelar"}</span>
            <div><b>${m.dayName} · ${MEAL_SLOTS.find((x) => x.key === m.slot).label.toLowerCase()}</b>
            <small>${m.recipe.name}: ${m.uses.map((id) => FOODS[id].name.toLowerCase()).join(", ")}</small></div>
          </div>`).join("")}
      </div>
    </div>
    <div class="batch-safety">
      <b>🛡️ Para que dure bien</b>
      <ul>
        <li>Guarda todo en la nevera o el congelador en menos de 2 horas. El arroz, en cuanto se temple.</li>
        <li>En la nevera, como mucho 3-4 días. Lo de jueves a domingo, al congelador.</li>
        <li>Descongela en la nevera la noche antes, no en la encimera.</li>
        <li>Recalienta hasta que humee (unos 75 °C en el centro) y no recalientes dos veces.</li>
      </ul>
      <small>Fuente: AESAN y USDA FSIS.</small>
    </div>
  `;
  body.querySelectorAll("[data-step]").forEach((cb) => cb.addEventListener("change", () => {
    const week = weekDates()[0];
    if (!state.batchDone || state.batchDone.week !== week) state.batchDone = { week, steps: {} };
    state.batchDone.steps[cb.dataset.step] = cb.checked;
    saveState();
    buzz(6);
    cb.closest(".batch-step").classList.toggle("done", cb.checked);
    const all = body.querySelectorAll("[data-step]");
    if ([...all].every((x) => x.checked)) {
      track("batch-terminado");
      burstConfetti();
      showToast("🥡 ¡Semana lista! Ya tienes la comida hecha");
    }
  }));
  openSheet();
}

const BATCH_CSS = `
.batch-banner { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 12px 14px; margin: 0 0 12px; border: 0; border-radius: var(--radius-lg); background: var(--amber-light); color: var(--ink); font: inherit; cursor: pointer; box-shadow: var(--shadow-card); }
.batch-banner:active { transform: scale(.985); }
.batch-emoji { font-size: 26px; }
.batch-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.batch-text b { font-size: 14.5px; }
.batch-text small { color: var(--muted); font-size: 12.5px; }
.batch-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0 4px; }
.batch-stats div { background: var(--bg); border-radius: var(--radius-md); padding: 10px 6px; text-align: center; display: flex; flex-direction: column; gap: 2px; }
.batch-stats b { font-size: 17px; }
.batch-stats span { font-size: 11.5px; color: var(--muted); }
.batch-step { display: flex; flex-direction: row; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); cursor: pointer; font-size: 14px; }
.batch-step input { -webkit-appearance: checkbox; appearance: auto; accent-color: var(--green); width: 20px; height: 20px; min-width: 0; padding: 0; margin: 1px 0 0; flex: none; }
.batch-step-text { display: flex; flex-direction: column; gap: 2px; line-height: 1.35; }
.batch-step-text small { color: var(--muted); font-size: 12px; }
.batch-step.done .batch-step-text { text-decoration: line-through; color: var(--muted); }
.batch-tip { background: var(--purple-light); border-radius: var(--radius-md); padding: 10px 12px; font-size: 13px; line-height: 1.45; margin-top: 12px; }
.batch-days { display: flex; flex-direction: column; gap: 8px; }
.batch-day { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; }
.batch-day small { display: block; color: var(--muted); font-size: 12px; line-height: 1.35; margin-top: 2px; }
.batch-store { flex: none; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 999px; white-space: nowrap; }
.batch-store.nevera { background: var(--green-light); color: var(--green-dark); }
.batch-store.congelador { background: var(--purple-light); color: var(--purple-dark); }
.batch-safety { margin-top: 16px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--bg); font-size: 13px; line-height: 1.45; }
.batch-safety ul { margin: 6px 0; padding-left: 18px; }
.batch-safety small { color: var(--muted); }
`;

document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = BATCH_CSS;
  document.head.appendChild(style);

  const basePlanDays = renderPlanDays;
  renderPlanDays = function () {
    basePlanDays.apply(this, arguments);
    const el = document.getElementById("plan-content");
    el.insertAdjacentHTML("afterbegin", batchBannerHtml());
    const banner = document.getElementById("batch-banner");
    if (banner) banner.addEventListener("click", openBatchSheet);
  };
});
