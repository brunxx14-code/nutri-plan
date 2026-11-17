/* Asistente de cambios: "¿puedo cambiar X por Y?".

   Responde sin IA ni servidor, con los datos nutricionales de la app:
   - Calcula cuánto de Y equivale a tu cantidad de X. Se iguala el nutriente
     por el que X está en el plato: proteína para carnes, pescados, huevos y
     lácteos; hidratos para cereales y tubérculos; grasa para aceites y
     frutos secos; y calorías en el resto. Es el mismo principio que las
     listas de intercambio de alimentos que usan los dietistas-nutricionistas
     (p. ej. las de la Academy of Nutrition and Dietetics).
   - Dice qué cambia en calorías, proteína, hidratos, grasa y precio.
   - Avisa si el cambio no encaja con tu dieta (vegetariana, vegana) o si
     cambia el papel del alimento en el plato (proteína por hidrato...).
   - Propone alternativas parecidas.

   Una IA conversacional podría venir después; esta versión ya es gratis,
   instantánea y no envía ningún dato fuera del móvil. */

/* Grupos de intercambio: dentro de un grupo se iguala su nutriente clave. */
const SWAP_GROUP = {
  proteina_magra: "prot", proteina_grasa: "prot", lacteo: "prot", carbohidrato: "carbs",
  legumbre: "legumbre", grasa_saludable: "fat", verdura: "veg", fruta: "fruit", condimento: "cond",
};
const SWAP_GROUP_KEY = { prot: "prot", carbs: "carbs", legumbre: "kcal", fat: "fat", veg: "weight", fruit: "kcal", cond: "kcal" };
const SWAP_NUTRIENT_LABEL = { weight: "la misma cantidad", prot: "la misma proteína", carbs: "los mismos hidratos", fat: "la misma grasa", kcal: "las mismas calorías" };
const SWAP_MEAT_FISH = ["pollo_pechuga", "pollo_muslo", "pavo_filete", "ternera_picada", "lomo_cerdo", "salmon", "merluza", "gambas", "atun_lata"];
const SWAP_ANIMAL = [...SWAP_MEAT_FISH, "huevos", "leche_semi", "yogur_griego", "yogur_natural", "queso_fresco", "queso_curado", "miel"];
const SWAP_NO_ALT = ["limon", "ajo"]; // se usan para dar sabor, no como sustituto
const SWAP_GOOD_DIFF = 0.15; // ±15 % de calorías: cambio equivalente

/* Palabras con las que la gente nombra cada alimento al preguntar. */
const SWAP_WORDS = {
  pollo_pechuga: ["pechuga", "pollo"], pollo_muslo: ["contramuslo", "muslo"], pavo_filete: ["pavo"],
  ternera_picada: ["ternera", "carne picada", "picada"], lomo_cerdo: ["lomo", "cerdo"],
  salmon: ["salmon"], merluza: ["merluza", "pescado blanco"], gambas: ["gambas", "gamba", "langostinos"], atun_lata: ["atun"],
  huevos: ["huevo", "huevos"], leche_semi: ["leche"], yogur_griego: ["yogur griego", "griego"], yogur_natural: ["yogur"],
  queso_fresco: ["queso fresco", "queso batido"], queso_curado: ["queso curado", "queso"],
  arroz: ["arroz"], pasta: ["pasta", "macarrones", "espaguetis"], avena: ["avena"], quinoa: ["quinoa"],
  lentejas: ["lentejas"], garbanzos: ["garbanzos"], pan_integral: ["pan"], aceite_oliva: ["aceite"],
  almendras: ["almendras", "frutos secos"], crema_cacahuete: ["crema de cacahuete", "cacahuete"], tofu: ["tofu"], miel: ["miel", "azucar"],
  platano: ["platano"], manzana: ["manzana"], aguacate: ["aguacate"], tomate: ["tomate"], brocoli: ["brocoli"],
  espinacas: ["espinacas"], pimiento: ["pimiento"], cebolla: ["cebolla"], calabacin: ["calabacin"], zanahoria: ["zanahoria"],
  patata: ["patata", "patatas"], boniato: ["boniato"], limon: ["limon"], ajo: ["ajo"], lechuga: ["lechuga", "ensalada"],
};

const DEFAULT_SWAP_QTY = { g: 100, ml: 200, ud: 1 };
const DEFAULT_SWAP_QTY_FOOD = { aceite_oliva: 10, miel: 10, almendras: 30, crema_cacahuete: 20, ajo: 1, limon: 1 };
const SWAP_MAX_RATIO = 2.5; // más de 2,5 veces la cantidad deja de ser un plato realista

function defaultSwapQty(id) {
  return DEFAULT_SWAP_QTY_FOOD[id] || DEFAULT_SWAP_QTY[FOODS[id].unit];
}

function swapNorm(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* Encuentra los alimentos de una pregunta, en el orden en que aparecen. */
function foodsInQuestion(q) {
  const text = ` ${swapNorm(q)} `;
  const hits = [];
  for (const [id, words] of Object.entries(SWAP_WORDS)) {
    for (const w of words) {
      const i = text.search(new RegExp(`[^a-z]${w}[^a-z]`));
      if (i !== -1) { hits.push({ id, i, len: w.length }); break; }
    }
  }
  // si dos palabras se pisan ("queso fresco" y "queso"), gana la más larga
  hits.sort((a, b) => a.i - b.i || b.len - a.len);
  const out = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (last && h.i < last.i + last.len) continue;
    out.push(h);
  }
  return out.map((h) => h.id);
}

function nutrientsFor(id, qty) {
  const f = FOODS[id];
  const k = f.unit === "ud" ? qty : qty / 100;
  return { kcal: f.kcal * k, prot: f.prot * k, carbs: f.carbs * k, fat: f.fat * k, cost: f.price * k };
}

/* Cantidad de `to` equivalente a `qty` de `from`. */
function sameSwapGroup(a, b) {
  return SWAP_GROUP[FOODS[a].cat] === SWAP_GROUP[FOODS[b].cat];
}

function swapEquivalent(from, to, qty) {
  const a = FOODS[from], b = FOODS[to];
  let key = sameSwapGroup(from, to) ? SWAP_GROUP_KEY[SWAP_GROUP[a.cat]] : "kcal";
  if (key === "weight" && a.unit !== b.unit) key = "kcal";
  if (key === "weight") return { qty, key, full: null };
  if (b[key] < 0.5 || a[key] < 0.5) key = "kcal";
  const base = nutrientsFor(from, qty)[key];
  const perUnit = b[key] / (b.unit === "ud" ? 1 : 100); // por gramo/ml o por unidad
  let out = base / perUnit;
  let full = null;
  // Dentro de hidratos y legumbres no se limita: 100 g de arroz o lentejas en
  // seco son unos 250-300 g ya cocidos, así que el peso cambia mucho.
  const limited = !sameSwapGroup(from, to) || key === "prot" || key === "fat";
  if (a.unit !== "ud" && b.unit !== "ud" && limited && out > qty * SWAP_MAX_RATIO) {
    full = out;
    out = qty * SWAP_MAX_RATIO;
  }
  if (b.unit === "ud") out = Math.max(1, Math.round(out * 2) / 2);
  return { qty: out, key, full };
}

function dietProblem(id) {
  const diet = state.profile.dietType;
  if (diet === "vegano" && SWAP_ANIMAL.includes(id)) return "no es vegano";
  if (diet === "vegetariano" && SWAP_MEAT_FISH.includes(id)) return "no es vegetariano";
  if ((state.profile.dislikes || []).includes(id)) return "lo marcaste como algo que no te gusta";
  return null;
}

function swapVerdict(from, to, a, b) {
  const problems = [];
  const diet = dietProblem(to);
  if (diet) problems.push(`⚠️ ${FOODS[to].name} ${diet}.`);
  if (!sameSwapGroup(from, to)) {
    problems.push(`⚠️ Cambia el papel en el plato: ${FOOD_ROLES[FOODS[from].cat].label.toLowerCase()} por ${FOOD_ROLES[FOODS[to].cat].label.toLowerCase()}. El plato quedará con otro reparto de nutrientes.`);
  }
  const diff = a.kcal ? (b.kcal - a.kcal) / a.kcal : 0;
  // entre verduras se cambia peso por peso: la diferencia de calorías es mínima
  const ok = !problems.length && (Math.abs(diff) <= SWAP_GOOD_DIFF || SWAP_GROUP[FOODS[from].cat] === "veg");
  return { ok, problems, diff };
}

function closeAlternatives(from, qty) {
  return Object.keys(FOODS)
    .filter((id) => id !== from && sameSwapGroup(id, from) && !dietProblem(id) && !SWAP_NO_ALT.includes(id))
    // una lechuga entera no sustituye a 100 g de brócoli: entre verduras, misma unidad
    .filter((id) => SWAP_GROUP[FOODS[from].cat] !== "veg" || FOODS[id].unit === FOODS[from].unit)
    .map((id) => {
      const eq = swapEquivalent(from, id, qty);
      const a = nutrientsFor(from, qty), b = nutrientsFor(id, eq.qty);
      return { id, eq, score: Math.abs(b.kcal - a.kcal) / (a.kcal || 1) + Math.abs(b.prot - a.prot) / (a.prot + 5) };
    })
    .sort((x, y) => x.score - y.score)
    .slice(0, 4);
}

function fmtDelta(v, unit, digits = 0) {
  const r = Number(v.toFixed(digits));
  if (!r) return `= ${unit}`.trim();
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(digits).replace(".", ",")} ${unit}`;
}

function swapAnswerHtml(from, to, qty) {
  if (!from || !to) return "";
  if (from === to) return `<div class="swap-answer"><p>Es el mismo alimento 🙂</p></div>`;
  const eq = swapEquivalent(from, to, qty);
  const a = nutrientsFor(from, qty), b = nutrientsFor(to, eq.qty);
  const v = swapVerdict(from, to, a, b);
  const row = (label, x, y, unit, digits = 0) => `
    <div class="swap-cmp"><span>${label}</span><span>${x.toFixed(digits).replace(".", ",")} ${unit}</span><span>${y.toFixed(digits).replace(".", ",")} ${unit}</span><b class="${Math.abs(y - x) < 0.5 ? "" : y > x ? "up" : "down"}">${fmtDelta(y - x, unit, digits)}</b></div>`;
  return `
    <div class="swap-answer ${v.ok ? "ok" : "warn"}">
      <div class="swap-verdict">${v.ok ? "✅ Sí, es un buen cambio" : v.problems.length ? "🤔 Se puede, pero ojo" : "👍 Se puede, con matices"}</div>
      <p class="swap-eq"><b>${formatQty(qty, FOODS[from].unit)}</b> de ${FOODS[from].name.toLowerCase()} ≈ <b>${formatQty(eq.qty, FOODS[to].unit)}</b> de ${FOODS[to].name.toLowerCase()}</p>
      <p class="hint">Calculado para que tenga ${SWAP_NUTRIENT_LABEL[eq.key]}.</p>
      ${eq.full ? `<p class="swap-problem">⚠️ Para tener ${SWAP_NUTRIENT_LABEL[eq.key]} harían falta ${formatQty(eq.full, FOODS[to].unit)}, demasiado para un plato. Con esta cantidad, completa con otra fuente (legumbre, huevo, yogur…).</p>` : ""}
      ${v.problems.map((p) => `<p class="swap-problem">${p}</p>`).join("")}
      ${!v.problems.length && !v.ok ? `<p class="swap-problem">Las calorías cambian un ${Math.round(Math.abs(v.diff) * 100)} %: ${v.diff > 0 ? "un poco más de energía" : "un poco menos de energía"} en esa comida.</p>` : ""}
      <div class="swap-table">
        <div class="swap-cmp head"><span></span><span>Antes</span><span>Después</span><span></span></div>
        ${row("🔥 kcal", a.kcal, b.kcal, "kcal")}
        ${row("🍗 Proteína", a.prot, b.prot, "g")}
        ${row("🌾 Hidratos", a.carbs, b.carbs, "g")}
        ${row("🥑 Grasa", a.fat, b.fat, "g")}
        ${row("🛒 Precio", a.cost * storeIndex(), b.cost * storeIndex(), "€", 2)}
      </div>
    </div>`;
}

function foodOptions(selected, placeholder) {
  const bySection = {};
  for (const [id, f] of Object.entries(FOODS)) (bySection[f.section] = bySection[f.section] || []).push([id, f]);
  return `<option value="">${placeholder}</option>` + Object.entries(bySection).map(([sec, list]) => `
    <optgroup label="${sec}">${list.map(([id, f]) => `<option value="${id}" ${id === selected ? "selected" : ""}>${f.name}</option>`).join("")}</optgroup>`).join("");
}

let swapAssist = { from: null, to: null, qty: null, question: "" };

function openSwapAssistant(opts = {}) {
  swapAssist = { ...swapAssist, ...opts };
  const { from, to } = swapAssist;
  const qty = swapAssist.qty || (from ? defaultSwapQty(from) : null);
  track("asistente-cambios");
  const body = document.getElementById("sheet-body");
  const alts = from ? closeAlternatives(from, qty) : [];
  body.innerHTML = `
    <h3>🔁 ¿Puedo cambiar…?</h3>
    <form class="swap-ask" id="swap-ask">
      <input type="text" id="swap-question" placeholder="p. ej. ¿puedo cambiar el arroz por patata?" value="${swapAssist.question.replace(/"/g, "&quot;")}" autocomplete="off">
      <button type="submit" class="btn small">Preguntar</button>
    </form>
    <div class="swap-pickers">
      <label>Cambiar<select id="swap-from">${foodOptions(from, "Elige alimento")}</select></label>
      ${from ? `<label class="swap-qty">Cantidad<span><input type="number" id="swap-qty" min="0" step="any" inputmode="decimal" value="${FOODS[from].unit === "ud" ? Math.round(qty * 2) / 2 : Math.round(qty)}"> ${FOODS[from].unit}</span></label>` : ""}
      <label>Por<select id="swap-to">${foodOptions(to, "Elige alimento")}</select></label>
    </div>
    ${swapAnswerHtml(from, to, qty)}
    ${alts.length ? `
      <div class="sheet-section">
        <h4>💡 Cambios parecidos a ${FOODS[from].name.toLowerCase()}</h4>
        <div class="swap-alts">
          ${alts.map((x) => `<button type="button" class="chip-btn small" data-alt="${x.id}">${FOOD_EMOJI[x.id] || ""} ${formatQty(x.eq.qty, FOODS[x.id].unit)} de ${FOODS[x.id].name.toLowerCase()}</button>`).join("")}
        </div>
      </div>` : ""}
    ${!from ? `<p class="hint">Escribe tu duda o elige los alimentos. Te decimos cuánto poner para que el plato siga cuadrando con tu plan.</p>` : ""}
    <p class="hint">Cálculo con la tabla de alimentos de la app. No es consejo médico.</p>
    ${opts.back ? `<button type="button" class="btn ghost block" id="swap-assist-back">Volver a la receta</button>` : ""}
  `;
  body.querySelector("#swap-ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = body.querySelector("#swap-question").value;
    const found = foodsInQuestion(q);
    if (!found.length) { showToast("No reconozco esos alimentos. Prueba a elegirlos abajo"); return; }
    track("asistente-pregunta");
    openSwapAssistant({ question: q, from: found[0], to: found[1] || null, qty: null, back: opts.back });
  });
  body.querySelector("#swap-from").addEventListener("change", (e) => openSwapAssistant({ from: e.target.value || null, qty: null, question: "", back: opts.back }));
  body.querySelector("#swap-to").addEventListener("change", (e) => openSwapAssistant({ to: e.target.value || null, question: "", back: opts.back }));
  const q = body.querySelector("#swap-qty");
  if (q) q.addEventListener("change", () => openSwapAssistant({ qty: Number(q.value) || null, back: opts.back }));
  body.querySelectorAll("[data-alt]").forEach((b) => b.addEventListener("click", () => openSwapAssistant({ to: b.dataset.alt, question: "", back: opts.back })));
  const back = body.querySelector("#swap-assist-back");
  if (back) back.addEventListener("click", () => openRecipeSheet(opts.back.day, opts.back.slot));
  if (document.getElementById("recipe-sheet").classList.contains("hidden")) openSheet();
}

const SWAP_CSS = `
.swap-ask { display: flex; gap: 8px; margin-top: 12px; }
.swap-ask input { flex: 1; min-width: 0; }
.swap-pickers { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 14px; }
.swap-qty span { display: flex; align-items: center; gap: 6px; }
.swap-qty input { width: 110px; }
.swap-answer { margin-top: 14px; padding: 14px; border-radius: var(--radius-md); background: var(--bg); border: 1px solid var(--border); }
.swap-answer.ok { border-color: var(--green); background: var(--green-light); }
.swap-verdict { font-weight: 800; font-size: 15px; margin-bottom: 6px; }
.swap-eq { margin: 0; font-size: 14px; line-height: 1.45; }
.swap-answer .hint { margin-top: 4px; }
.swap-problem { margin: 8px 0 0; font-size: 13px; line-height: 1.45; }
.swap-table { margin-top: 10px; display: flex; flex-direction: column; }
.swap-cmp { display: grid; grid-template-columns: 1.3fr 1fr 1fr 1fr; gap: 6px; padding: 6px 0; border-top: 1px solid var(--border); font-size: 12.5px; align-items: center; }
.swap-cmp.head { border-top: 0; color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.swap-cmp b { text-align: right; font-size: 12px; color: var(--muted); }
.swap-cmp b.up { color: var(--amber-dark); }
.swap-cmp b.down { color: var(--green-dark); }
.swap-alts { display: flex; flex-wrap: wrap; gap: 6px; }
.ing-swap { border: 0; background: var(--bg); border-radius: 999px; width: 30px; height: 30px; flex: none; cursor: pointer; font-size: 14px; }
.swap-assist-open { margin-top: 8px; }
`;

(function installSwapAssistant() {
  const style = document.createElement("style");
  style.textContent = SWAP_CSS;
  document.head.appendChild(style);

  // Acceso directo desde la cabecera del plan.
  const header = document.querySelector("#view-plan .header-btns");
  if (header) {
    header.insertAdjacentHTML("afterbegin", `<button id="swap-assist-btn" class="icon-btn" type="button" aria-label="¿Puedo cambiar un alimento?">🔁</button>`);
    document.getElementById("swap-assist-btn").addEventListener("click", () => openSwapAssistant({ from: null, to: null, qty: null, question: "", back: null }));
  }

  // Este archivo se carga después de app.js: se engancha al momento.
  // En cada receta: un botón 🔁 por ingrediente y otro general.
  const baseRecipe = openRecipeSheet;
  openRecipeSheet = function (dayIdx, slotKey) {
    baseRecipe.apply(this, arguments);
    const body = document.getElementById("sheet-body");
    const recipe = getRecipeInfo(state.plan[dayIdx][slotKey]).recipe;
    const factor = dayFactor(dayIdx);
    const back = { day: dayIdx, slot: slotKey };
    body.querySelectorAll(".ingredient-row").forEach((row, i) => {
      const ing = recipe.ingredients[i];
      if (!ing) return;
      row.insertAdjacentHTML("beforeend", `<button type="button" class="ing-swap" aria-label="Cambiar ${FOODS[ing[0]].name}">🔁</button>`);
      row.querySelector(".ing-swap").addEventListener("click", () => openSwapAssistant({ from: ing[0], to: null, qty: ing[1] * factor, question: "", back }));
    });
    const swapBtn = body.querySelector("#swap-open-btn");
    if (swapBtn) {
      swapBtn.insertAdjacentHTML("afterend", `<button type="button" class="btn ghost block swap-assist-open" id="swap-assist-open">🔁 ¿Puedo cambiar un ingrediente?</button>`);
      body.querySelector("#swap-assist-open").addEventListener("click", () => openSwapAssistant({ from: null, to: null, qty: null, question: "", back }));
    }
  };
})();
