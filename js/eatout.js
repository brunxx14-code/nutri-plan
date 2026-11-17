/* ¿Comes fuera? Qué pedir en cada tipo de sitio sin salirte del plan.

   Para cada sitio: lo que mejor encaja, lo que conviene pedir de vez en
   cuando y un par de trucos. Las calorías son rangos orientativos de una
   ración normal, a partir de la base de datos española BEDCA y de las tablas
   nutricionales que publican las cadenas. Varían mucho según el sitio, así
   que sirven para comparar opciones, no para contar al detalle.

   Nada está prohibido: el enfoque es elegir mejor la mayoría de veces
   (ver el informe "El mito de los alimentos prohibidos"). Y si al final
   comes otra cosa, se apunta con "Comí otra cosa" y la semana se reajusta. */

const EAT_OUT_PLACES = [
  {
    key: "menu", emoji: "🍽️", name: "Menú del día",
    best: [
      ["De primero: ensalada, verdura, legumbre o gazpacho", "150-400 kcal"],
      ["De segundo: pescado, pollo o carne a la plancha", "250-450 kcal"],
      ["Guarnición de ensalada o verdura en vez de patatas fritas", "−200 kcal"],
      ["De postre: fruta, yogur o café", "50-120 kcal"],
    ],
    limit: ["Rebozados y fritos", "Guisos con mucha salsa", "Más de un trozo de pan (unos 80 kcal cada uno)"],
    tips: ["Pide el agua en la jarra y el pan fuera si no lo vas a echar de menos.", "Si el primero es contundente (paella, cocido), el segundo, ligero."],
  },
  {
    key: "burger", emoji: "🍔", name: "Hamburguesería",
    best: [
      ["Hamburguesa sencilla o de pollo a la plancha", "250-450 kcal"],
      ["Wrap o ensalada con pollo a la plancha, salsa aparte", "300-450 kcal"],
      ["Patatas pequeñas, o compartir las medianas", "230-330 kcal"],
      ["Agua, refresco sin azúcar o café", "0-5 kcal"],
    ],
    limit: ["Doble con queso y bacon (800-1.000 kcal)", "Pollo rebozado y nuggets grandes", "Batidos (400-700 kcal)"],
    tips: ["Quita una de las salsas: cada una suma 80-150 kcal.", "Si tienes mucha hambre, mejor una segunda hamburguesa sencilla que patatas grandes: más proteína por menos."],
  },
  {
    key: "pizza", emoji: "🍕", name: "Pizzería",
    best: [
      ["Ensalada de entrante para compartir", "150-300 kcal"],
      ["2-3 porciones de masa fina con verduras, jamón o atún", "450-700 kcal"],
      ["Pasta con salsa de tomate o marinera", "550-750 kcal"],
    ],
    limit: ["Bordes rellenos y masa gruesa", "Cuatro quesos, barbacoa o carbonara (una pizza entera puede pasar de 1.200 kcal)", "Pan de ajo"],
    tips: ["Media pizza y una ensalada llenan casi igual que una entera.", "Pide la mitad de queso o más verdura: casi nadie nota la diferencia."],
  },
  {
    key: "asia", emoji: "🥡", name: "Chino o asiático",
    best: [
      ["Wok de verduras con pollo, ternera o gambas", "350-550 kcal"],
      ["Arroz blanco al vapor en vez de tres delicias", "−150 kcal"],
      ["Sopa (wantán, agripicante) de entrante", "100-200 kcal"],
    ],
    limit: ["Rollitos y empanadillas fritas", "Pollo o cerdo agridulce rebozado", "Tallarines y arroz fritos en raciones grandes"],
    tips: ["Comparte un plato de fritos y pide el resto salteado.", "Las salsas dulces suman: pídelas aparte."],
  },
  {
    key: "sushi", emoji: "🍣", name: "Japonés o sushi",
    best: [
      ["Sashimi y nigiris", "40-70 kcal la pieza"],
      ["Edamame o sopa de miso para empezar", "100-200 kcal"],
      ["Poke con la mitad de arroz y más proteína", "450-600 kcal"],
    ],
    limit: ["Rolls de tempura o con queso crema", "Salsas con mayonesa (spicy mayo)", "Gyozas fritas en cantidad"],
    tips: ["Con 10-12 piezas y un entrante sueles comer de sobra.", "La salsa de soja tiene mucha sal: mójala, no la bañes."],
  },
  {
    key: "kebab", emoji: "🥙", name: "Kebab o turco",
    best: [
      ["Plato de pollo con mucha ensalada y sin patatas", "450-600 kcal"],
      ["Pan de pita en vez de durum grande", "−150 kcal"],
      ["Salsa de yogur aparte, en vez de la picante con mayonesa", "−100 kcal"],
    ],
    limit: ["Durum grande con patatas dentro (800-1.000 kcal)", "Doble de carne de cordero", "Patatas fritas de acompañamiento"],
    tips: ["Pide extra de ensalada: no suele costar más.", "El falafel es frito: está bien, pero cuenta como ración grande."],
  },
  {
    key: "mex", emoji: "🌮", name: "Mexicano",
    best: [
      ["Fajitas de pollo con pico de gallo", "450-600 kcal"],
      ["Burrito en bol, sin nata y con frijoles", "500-650 kcal"],
      ["Tacos de pescado o pollo a la plancha (2-3)", "350-500 kcal"],
    ],
    limit: ["Nachos con queso de entrante", "Quesadillas y chimichangas", "Nata agria y queso extra"],
    tips: ["El guacamole es grasa buena, pero en cantidad: una porción, no un bol.", "El agua de jamaica o la limonada suelen llevar mucho azúcar."],
  },
  {
    key: "tapas", emoji: "🍤", name: "Bar de tapas",
    best: [
      ["Pulpo, gambas, sepia o calamar a la plancha", "150-300 kcal la ración"],
      ["Boquerones en vinagre, pimientos o ensalada", "100-250 kcal"],
      ["Una ración de tortilla o de jamón para compartir", "200-350 kcal"],
    ],
    limit: ["Croquetas, bravas y calamares fritos", "Alioli y salsas", "Mucho pan con la tapa"],
    tips: ["Pide de una en una: es fácil pedir de más por la vista.", "Cerveza o vino: cada caña son unas 100 kcal. Alterna con agua."],
  },
  {
    key: "cafe", emoji: "☕", name: "Cafetería",
    best: [
      ["Tostada con tomate y aceite, o con jamón", "200-350 kcal"],
      ["Café con leche o bebida vegetal sin azúcar", "60-120 kcal"],
      ["Una pieza de fruta o un yogur", "60-120 kcal"],
    ],
    limit: ["Bollería: cruasán, napolitana (250-450 kcal)", "Zumos y batidos (azúcar sin la fibra de la fruta)", "Cafés con nata y sirope"],
    tips: ["Si vas a desayunar fuera a menudo, la tostada con tomate es de las mejores opciones de cualquier carta."],
  },
];

/* Lo que tu plan tenía para la próxima comida, como referencia. */
function eatOutReference() {
  const entry = dailyEntry();
  const slotKey = nextMealSlot(entry) || "comida";
  const slot = MEAL_SLOTS.find((s) => s.key === slotKey);
  const dayIdx = todayPlanIndex();
  const info = getRecipeInfo(state.plan[dayIdx][slotKey]);
  return { slot, kcal: Math.round(info.kcal * dayFactor(dayIdx)), prot: Math.round(info.prot * dayFactor(dayIdx)) };
}

function eatOutGoalTip() {
  const goal = state.profile.goal;
  if (goal === "perder") return "🔥 Tu objetivo es perder grasa: prioriza proteína y verdura, y elige una sola cosa de \"con moderación\".";
  if (goal === "ganar") return "💪 Tu objetivo es ganar músculo: asegúrate de que el plato principal tenga una buena ración de proteína, y no te quedes con hambre.";
  return "⚖️ Tu objetivo es mantenerte: equilibra, y si un día te pasas, la semana se reajusta sola.";
}

function eatOutCardHtml() {
  return `
    <button type="button" class="eatout-card" id="eatout-card">
      <span class="eatout-emoji" aria-hidden="true">🍽️</span>
      <span class="eatout-body"><b>¿Comes fuera hoy?</b><small>Qué pedir en cada sitio sin salirte del plan</small></span>
      <span class="chevron-right" aria-hidden="true">›</span>
    </button>`;
}

function openEatOutSheet(placeKey) {
  const body = document.getElementById("sheet-body");
  const ref = eatOutReference();
  const place = EAT_OUT_PLACES.find((p) => p.key === placeKey);
  if (place) track(`fuera-${place.key}`); else track("fuera-abierto");

  body.innerHTML = `
    <h3>🍽️ ¿Dónde vas a comer?</h3>
    <div class="eatout-places" role="tablist">
      ${EAT_OUT_PLACES.map((p) => `
        <button type="button" role="tab" class="eatout-place ${p === place ? "on" : ""}" data-place="${p.key}" aria-selected="${p === place}">
          <span aria-hidden="true">${p.emoji}</span>${p.name}
        </button>`).join("")}
    </div>
    ${place ? `
      <div class="eatout-ref">🎯 Para tu ${ref.slot.label.toLowerCase()}, tu plan tenía unas ${ref.kcal} kcal y ${ref.prot} g de proteína. Busca algo parecido.</div>
      <div class="sheet-section">
        <h4>✅ Lo que mejor encaja</h4>
        ${place.best.map(([text, kcal]) => `
          <div class="eatout-row"><span>${text}</span><small>${kcal}</small></div>`).join("")}
      </div>
      <div class="sheet-section">
        <h4>🤏 De vez en cuando</h4>
        <ul class="eatout-limit">${place.limit.map((t) => `<li>${t}</li>`).join("")}</ul>
      </div>
      <div class="sheet-section">
        <h4>💡 Trucos</h4>
        ${place.tips.map((t) => `<p class="eatout-tip">${t}</p>`).join("")}
        <p class="eatout-tip goal">${eatOutGoalTip()}</p>
      </div>
      <p class="hint">Calorías orientativas de una ración normal (BEDCA y tablas de las cadenas). Cambian mucho de un sitio a otro.</p>
      <button type="button" class="btn block" id="eatout-log">✍️ Apuntar lo que he comido</button>
    ` : `
      <p class="hint">Elige el tipo de sitio y te decimos qué pedir para seguir en tu objetivo. Ningún plato está prohibido: se trata de elegir mejor la mayoría de veces.</p>`}
  `;
  body.querySelectorAll("[data-place]").forEach((b) => b.addEventListener("click", () => {
    buzz(6);
    openEatOutSheet(b.dataset.place);
  }));
  const log = body.querySelector("#eatout-log");
  if (log) log.addEventListener("click", () => openOffPlanSheet(ref.slot.key));
  if (document.getElementById("recipe-sheet").classList.contains("hidden")) openSheet();
}

const EATOUT_CSS = `
.eatout-card { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 14px; margin: 0 0 14px; border: 0; border-radius: var(--radius-lg); background: var(--card); box-shadow: var(--shadow-card); color: var(--ink); font: inherit; cursor: pointer; }
.eatout-card:active { transform: scale(.985); }
.eatout-emoji { font-size: 26px; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; background: var(--rose-light); flex: none; }
.eatout-body { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.eatout-body b { font-size: 15px; }
.eatout-body small { color: var(--muted); font-size: 12.5px; }
.eatout-places { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 4px; }
.eatout-place { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--ink); font: inherit; font-size: 13px; cursor: pointer; }
.eatout-place.on { background: var(--ink); border-color: var(--ink); color: var(--card); font-weight: 600; }
.eatout-ref { margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--coral-light); font-size: 13px; line-height: 1.45; }
.eatout-row { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 13.5px; line-height: 1.35; }
.eatout-row small { flex: none; color: var(--green-dark); font-weight: 700; font-size: 12px; white-space: nowrap; }
.eatout-limit { margin: 0; padding-left: 18px; font-size: 13.5px; line-height: 1.6; }
.eatout-tip { margin: 0 0 8px; font-size: 13.5px; line-height: 1.45; }
.eatout-tip.goal { background: var(--bg); border-radius: var(--radius-sm); padding: 9px 11px; }
`;

(function installEatOut() {
  const style = document.createElement("style");
  style.textContent = EATOUT_CSS;
  document.head.appendChild(style);

  // Este archivo se carga después de app.js: se engancha al momento.
  const baseDashboard = renderDashboard;
  renderDashboard = function () {
    baseDashboard.apply(this, arguments);
    const el = document.getElementById("dashboard-content");
    const anchor = el.querySelector("#today-card");
    if (anchor) anchor.insertAdjacentHTML("afterend", eatOutCardHtml());
    else el.insertAdjacentHTML("beforeend", eatOutCardHtml());
    document.getElementById("eatout-card").addEventListener("click", () => openEatOutSheet());
  };
})();
