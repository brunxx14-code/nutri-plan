/* Anotar lo que has comido con una foto.

   En "¿Qué has comido?" aparece un botón para hacer una foto al plato (o
   elegirla de la galería). La foto se reduce en el propio móvil y:

   - Si hay un servidor de reconocimiento configurado (FOOD_AI_URL, ver
     server/README.md), se le envía y devuelve el plato, sus ingredientes,
     gramos aproximados, calorías y macros. Tú lo revisas y lo corriges.
   - Si no lo hay (o falla, o no hay conexión), la foto se guarda igual y
     añades los ingredientes con un buscador sobre los alimentos de la app,
     con raciones típicas que se ajustan con − / +.

   Al guardar, la comida cuenta en las barras de hoy y la diferencia con lo
   que tocaba se reparte en el resto de la semana (weekRebalance, app.js).
   Con el modo "sin números" activado no se enseñan calorías ni gramos: las
   cantidades se eligen como poco / normal / mucho. */

/* Dirección del servidor que reconoce la comida. Vacío = sin IA: la foto se
   guarda y los ingredientes se añaden a mano. */
const FOOD_AI_URL = "";
const FOOD_AI_TIMEOUT_MS = 45000;
const PHOTO_MAX_PX = 1024;     // lo que se envía a la IA (~1.300 tokens de imagen)
const PHOTO_THUMB_PX = 200;    // miniatura que se guarda en el móvil
const PHOTO_KEEP_DAYS = 14;    // las miniaturas más antiguas se borran
const FP_SIZES = { poco: { label: "Poco", factor: 0.6 }, normal: { label: "Normal", factor: 1 }, mucho: { label: "Mucho", factor: 1.5 } };

let fpDraft = null;

function fpNoNumbers() {
  return !!(state.prefs && state.prefs.noNumbers);
}

function fpEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fpNorm(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ---------- Raciones típicas sacadas de las propias recetas ----------

let fpPortionCache = null;
function fpTypicalPortion(foodId) {
  if (!fpPortionCache) {
    fpPortionCache = {};
    const sums = {};
    for (const r of RECIPES) {
      for (const [id, qty] of r.ingredients) {
        if (!sums[id]) sums[id] = [];
        sums[id].push(qty);
      }
    }
    for (const [id, list] of Object.entries(sums)) {
      list.sort((a, b) => a - b);
      fpPortionCache[id] = list[Math.floor(list.length / 2)];
    }
  }
  const food = FOODS[foodId];
  return fpPortionCache[foodId] || (food.unit === "ud" ? 1 : 100);
}

function fpStep(item) {
  if (item.unit === "ud" || item.unit === "racion") return item.qty < 1 ? 0.5 : 1;
  return item.qty >= 150 ? 25 : 10;
}

function fpFoodItem(foodId) {
  const f = FOODS[foodId];
  const qty = fpTypicalPortion(foodId);
  return {
    foodId, name: f.name, emoji: (typeof FOOD_EMOJI !== "undefined" && FOOD_EMOJI[foodId]) || "🍴",
    unit: f.unit, qty, baseQty: qty,
    per: { kcal: f.kcal, prot: f.prot, carbs: f.carbs, fat: f.fat }, // por 100 g/ml o por unidad
  };
}

/* Platos típicos de fuera (OFF_PLAN_PRESETS, app.js) como una ración entera. */
function fpDishItem(preset) {
  const rest = Math.max(0, preset.kcal - preset.prot * 4);
  return {
    presetId: preset.id, name: preset.name, emoji: preset.emoji, unit: "racion", qty: 1, baseQty: 1,
    per: { kcal: preset.kcal, prot: preset.prot, carbs: Math.round((rest * 0.55) / 4), fat: Math.round((rest * 0.45) / 9) },
  };
}

/* Lo que devuelve la IA: totales para unos gramos; se pasa a "por 100 g". */
function fpAiItem(it) {
  const grams = Math.max(1, Number(it.grams) || 100);
  const k = 100 / grams;
  return {
    name: String(it.name || "Ingrediente").slice(0, 40), emoji: "🍴", unit: "g", qty: grams, baseQty: grams,
    per: { kcal: (+it.kcal || 0) * k, prot: (+it.prot || 0) * k, carbs: (+it.carbs || 0) * k, fat: (+it.fat || 0) * k },
  };
}

function fpItemMacros(item) {
  const m = item.unit === "g" || item.unit === "ml" ? item.qty / 100 : item.qty;
  return { kcal: item.per.kcal * m, prot: item.per.prot * m, carbs: item.per.carbs * m, fat: item.per.fat * m };
}

function fpTotals(items) {
  const t = { kcal: 0, prot: 0, carbs: 0, fat: 0 };
  for (const it of items) {
    const m = fpItemMacros(it);
    t.kcal += m.kcal; t.prot += m.prot; t.carbs += m.carbs; t.fat += m.fat;
  }
  return t;
}

function fpQtyLabel(item) {
  if (fpNoNumbers()) {
    const r = item.qty / (item.baseQty || 1);
    return r < 0.8 ? "Poco" : r > 1.25 ? "Mucho" : "Normal";
  }
  if (item.unit === "racion") return `${item.qty} ${item.qty === 1 ? "ración" : "raciones"}`;
  if (item.unit === "ud") return `${item.qty} ud`;
  return `${Math.round(item.qty)} ${item.unit}`;
}

// ---------- Búsqueda ----------

function fpSearch(q) {
  const nq = fpNorm(q.trim());
  if (!nq) return [];
  const results = [];
  for (const p of OFF_PLAN_PRESETS) {
    if (fpNorm(p.name).includes(nq)) results.push({ kind: "dish", id: p.id, name: p.name, emoji: p.emoji });
  }
  for (const [id, f] of Object.entries(FOODS)) {
    if (fpNorm(f.name).includes(nq)) results.push({ kind: "food", id, name: f.name, emoji: (typeof FOOD_EMOJI !== "undefined" && FOOD_EMOJI[id]) || "🍴" });
  }
  return results.slice(0, 8);
}

// ---------- Foto: reducir en el móvil ----------

function fpLoadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagen")); };
    img.src = url;
  });
}

function fpResize(img, maxPx, quality) {
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/* Miniatura cuadrada para la tarjeta de hoy. */
function fpThumb(img) {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PHOTO_THUMB_PX;
  canvas.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_THUMB_PX, PHOTO_THUMB_PX);
  return canvas.toDataURL("image/jpeg", 0.6);
}

function fpPickPhoto(onPicked) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.setAttribute("capture", "environment");
  input.style.display = "none";
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    try {
      const img = await fpLoadImage(file);
      onPicked({ full: fpResize(img, PHOTO_MAX_PX, 0.8), thumb: fpThumb(img) });
    } catch (e) {
      showToast("No hemos podido abrir esa foto. Prueba con otra");
    }
  });
  document.body.appendChild(input);
  input.click();
}

// ---------- Reconocimiento con IA (si hay servidor) ----------

async function fpRecognize(fullDataUrl, slotKey) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FOOD_AI_TIMEOUT_MS);
  try {
    const res = await fetch(FOOD_AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: fullDataUrl.split(",")[1],
        mediaType: "image/jpeg",
        meal: slotKey,
        lang: typeof currentLang !== "undefined" ? currentLang : "es",
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.items)) throw new Error("respuesta");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Hoja de revisión ----------

function fpOpenReview(slotKey, draft) {
  fpDraft = Object.assign({ slotKey, items: [], name: "", photo: null, full: null, status: "manual", note: "" }, draft);
  fpRenderReview();
  openSheet();
  if (fpDraft.status === "analyzing") fpRunAi();
}

async function fpRunAi() {
  const d = fpDraft;
  try {
    const data = await fpRecognize(d.full, d.slotKey);
    if (fpDraft !== d) return; // el usuario ya cerró o empezó otra
    d.items = data.items.map(fpAiItem);
    if (!d.name) d.name = String(data.dish || "").slice(0, 40);
    d.emoji = data.emoji || "📷";
    d.status = "ai";
    d.note = data.note || "";
    d.confidence = data.confidence || "";
    track("foto-comida-reconocida");
  } catch (e) {
    if (fpDraft !== d) return;
    d.status = "ai-error";
    track("foto-comida-error");
  }
  d.full = null; // la foto grande no se guarda
  fpRenderReview();
}

function fpStatusHtml(d) {
  if (d.status === "analyzing") {
    return `<div class="fp-status analyzing"><span class="fp-spinner" aria-hidden="true"></span> Mirando tu plato…</div>`;
  }
  if (d.status === "ai") {
    const low = d.confidence === "baja";
    return `<div class="fp-status ok">✨ Esto es lo que vemos${low ? " (no estamos muy seguros)" : ""}. Corrige lo que no cuadre.${d.note ? `<br><span class="fp-note">${fpEsc(d.note)}</span>` : ""}</div>`;
  }
  if (d.status === "ai-error") {
    return `<div class="fp-status warn">No hemos podido analizar la foto ahora. Añade lo que llevaba con el buscador.</div>`;
  }
  if (d.status === "edit") {
    return `<div class="fp-status">Puedes cambiar cantidades, quitar o añadir cosas.</div>`;
  }
  if (d.photo) {
    return `<div class="fp-status">Foto guardada. Añade lo que llevaba y ajusta las cantidades.</div>`;
  }
  return "";
}

function fpRemainingHtml(totals) {
  if (fpNoNumbers()) return `<p class="hint fp-rest">Lo tendremos en cuenta en tu plan. Sin dramas: comer fuera del plan es normal.</p>`;
  const targets = currentTargets();
  const entry = dailyEntry();
  // lo de hoy sin contar esta comida (por si estamos editándola)
  const saved = entry.offPlan && entry.offPlan[fpDraft.slotKey];
  const wasEaten = entry.eaten[fpDraft.slotKey];
  if (saved) delete entry.offPlan[fpDraft.slotKey];
  entry.eaten[fpDraft.slotKey] = false;
  const today = todayTotals();
  if (saved) entry.offPlan[fpDraft.slotKey] = saved;
  entry.eaten[fpDraft.slotKey] = wasEaten;
  const leftKcal = Math.round(targets.calories - today.kcal - totals.kcal);
  const leftProt = Math.round(targets.protein - today.prot - totals.prot);
  const kcalTxt = leftKcal >= 0 ? `te quedan ~${leftKcal} kcal` : `vas ~${-leftKcal} kcal por encima`;
  const protTxt = leftProt > 0 ? ` y ${leftProt} g de proteína` : "";
  const tip = leftProt > 25 ? " Prioriza la proteína en lo que queda del día." : "";
  return `<p class="hint fp-rest">Con esto, hoy ${kcalTxt}${protTxt}.${tip} Lo que sobre o falte lo repartimos en el resto de la semana.</p>`;
}

function fpRenderReview() {
  const d = fpDraft;
  const slot = MEAL_SLOTS.find((s) => s.key === d.slotKey);
  const noNum = fpNoNumbers();
  const totals = fpTotals(d.items);
  const body = document.getElementById("sheet-body");
  const existing = dailyEntry().offPlan && dailyEntry().offPlan[d.slotKey];

  body.innerHTML = `
    <span class="tag tag-amber">${mealEmoji(d.slotKey)} ${slot.label} de hoy</span>
    <h3>¿Qué has comido?</h3>
    <div class="fp-head">
      ${d.photo
        ? `<img class="fp-photo" src="${d.photo}" alt="Tu foto">`
        : `<button type="button" class="fp-photo fp-photo-empty" id="fp-retake" aria-label="Hacer una foto">📷</button>`}
      <div class="fp-head-main">
        <input type="text" id="fp-name" maxlength="40" placeholder="Nombre del plato (opcional)" value="${fpEsc(d.name)}">
        ${d.photo ? `<button type="button" class="fp-link" id="fp-retake">Cambiar foto</button>` : ""}
      </div>
    </div>
    ${fpStatusHtml(d)}
    <div class="fp-items">
      ${d.items.map((it, i) => {
        const m = fpItemMacros(it);
        return `
          <div class="fp-item">
            <span class="fp-item-emoji" aria-hidden="true">${it.emoji}</span>
            <span class="fp-item-main">
              <span class="fp-item-name">${fpEsc(it.name)}</span>
              ${noNum ? "" : `<span class="fp-item-macros">${Math.round(m.kcal)} kcal · ${Math.round(m.prot)} g prot</span>`}
            </span>
            <span class="fp-qty">
              <button type="button" data-fp-minus="${i}" aria-label="Menos ${fpEsc(it.name)}">−</button>
              <span class="fp-qty-val">${fpQtyLabel(it)}</span>
              <button type="button" data-fp-plus="${i}" aria-label="Más ${fpEsc(it.name)}">+</button>
            </span>
            <button type="button" class="fp-remove" data-fp-remove="${i}" aria-label="Quitar ${fpEsc(it.name)}">✕</button>
          </div>`;
      }).join("")}
    </div>
    <div class="fp-search">
      <input type="search" id="fp-search" placeholder="${d.items.length ? "Añadir algo más…" : "Busca qué llevaba: pollo, arroz, pizza…"}" autocomplete="off">
      <div class="fp-results" id="fp-results"></div>
    </div>
    ${d.items.length && !noNum ? `
      <div class="fp-totals">
        <div><b>${Math.round(totals.kcal)}</b><span>kcal</span></div>
        <div><b>${Math.round(totals.prot)} g</b><span>proteína</span></div>
        <div><b>${Math.round(totals.carbs)} g</b><span>hidratos</span></div>
        <div><b>${Math.round(totals.fat)} g</b><span>grasas</span></div>
      </div>
      <p class="hint fp-approx">Son cantidades aproximadas: no hace falta que sean exactas.</p>` : ""}
    ${d.items.length ? fpRemainingHtml(totals) : ""}
    <button type="button" class="btn block" id="fp-save" ${d.items.length && d.status !== "analyzing" ? "" : "disabled"}>Guardar y reajustar</button>
    <button type="button" class="btn ghost block fp-back" id="fp-back">${existing ? "Elegir un plato parecido" : "Volver"}</button>
    ${existing ? `<button type="button" class="btn ghost block off-undo" id="fp-undo">Al final comí lo del plan</button>` : ""}
  `;

  const nameInput = document.getElementById("fp-name");
  nameInput.addEventListener("input", () => { d.name = nameInput.value; });

  document.getElementById("fp-retake").addEventListener("click", () => fpStartPhoto(d.slotKey, d));

  body.querySelectorAll("[data-fp-minus]").forEach((b) => b.addEventListener("click", () => {
    const it = d.items[Number(b.dataset.fpMinus)];
    if (noNum) it.qty = Math.max(it.baseQty * FP_SIZES.poco.factor, fpPrevSize(it));
    else it.qty = Math.max(fpStep(it) === 0.5 ? 0.5 : fpStep(it), +(it.qty - fpStep(it)).toFixed(2));
    buzz(6);
    fpRenderReview();
  }));
  body.querySelectorAll("[data-fp-plus]").forEach((b) => b.addEventListener("click", () => {
    const it = d.items[Number(b.dataset.fpPlus)];
    if (noNum) it.qty = fpNextSize(it);
    else it.qty = +(it.qty + fpStep(it)).toFixed(2);
    buzz(6);
    fpRenderReview();
  }));
  body.querySelectorAll("[data-fp-remove]").forEach((b) => b.addEventListener("click", () => {
    d.items.splice(Number(b.dataset.fpRemove), 1);
    buzz(8);
    fpRenderReview();
  }));

  const search = document.getElementById("fp-search");
  const results = document.getElementById("fp-results");
  search.addEventListener("input", () => {
    const list = fpSearch(search.value);
    results.innerHTML = list.length
      ? list.map((r) => `<button type="button" class="fp-result" data-kind="${r.kind}" data-id="${r.id}"><span aria-hidden="true">${r.emoji}</span> ${fpEsc(r.name)}</button>`).join("")
      : search.value.trim() ? `<p class="hint">No lo tenemos. Elige lo más parecido o usa "Elegir un plato parecido".</p>` : "";
    results.querySelectorAll(".fp-result").forEach((b) => b.addEventListener("click", () => {
      d.items.push(b.dataset.kind === "dish"
        ? fpDishItem(OFF_PLAN_PRESETS.find((p) => p.id === b.dataset.id))
        : fpFoodItem(b.dataset.id));
      if (!d.name && b.dataset.kind === "dish") d.name = b.textContent.trim();
      buzz(8);
      fpRenderReview();
      const again = document.getElementById("fp-search");
      if (again) again.focus();
    }));
  });

  document.getElementById("fp-save").addEventListener("click", fpSave);
  document.getElementById("fp-back").addEventListener("click", () => {
    fpDraft = null;
    fpOffPlanSheet(d.slotKey, { skipReview: true });
  });
  const undo = document.getElementById("fp-undo");
  if (undo) undo.addEventListener("click", () => {
    const entry = dailyEntry();
    delete entry.offPlan[d.slotKey];
    fpDraft = null;
    saveState();
    closeSheet();
    renderAll();
    showToast("↩️ Vuelto al plato del plan");
  });
}

function fpPrevSize(it) {
  const r = it.qty / it.baseQty;
  return it.baseQty * (r > 1.25 ? FP_SIZES.normal.factor : FP_SIZES.poco.factor);
}
function fpNextSize(it) {
  const r = it.qty / it.baseQty;
  return it.baseQty * (r < 0.8 ? FP_SIZES.normal.factor : FP_SIZES.mucho.factor);
}

function fpSave() {
  const d = fpDraft;
  if (!d || !d.items.length) return;
  const t = fpTotals(d.items);
  const entry = dailyEntry();
  if (!entry.offPlan) entry.offPlan = {};
  const existing0 = entry.offPlan[d.slotKey];
  const name = (d.name || "").trim() || (d.items.length === 1 ? d.items[0].name : "Comida con foto");
  entry.offPlan[d.slotKey] = {
    presetId: d.photo ? "foto" : "a-mano", size: "normal",
    emoji: d.emoji || (d.photo ? "📷" : "🍴"), name: name.slice(0, 40),
    baseKcal: Math.round(t.kcal), kcal: Math.round(t.kcal), prot: Math.round(t.prot),
    carbs: Math.round(t.carbs), fat: Math.round(t.fat),
    items: d.items.map((it) => ({ name: it.name, emoji: it.emoji, unit: it.unit, qty: it.qty, baseQty: it.baseQty, per: it.per, foodId: it.foodId, presetId: it.presetId })),
    photo: d.photo || null, source: d.status === "ai" ? "ia" : (existing0 && existing0.source) || "manual",
  };
  entry.eaten[d.slotKey] = true;
  fpDraft = null;
  fpPruneOldPhotos();
  saveState();
  track(d.photo ? "foto-comida-guardada" : "comida-a-mano-guardada");
  if (typeof engage !== "undefined" && engage.offPlan) engage.offPlan();
  closeSheet();
  renderAll();
  const { perDay, remaining } = weekRebalance();
  showToast(fpNoNumbers()
    ? "✅ Anotado. Tu plan se ajusta solo"
    : perDay
      ? `🔄 Semana reajustada: ${rebalanceText(perDay)}`
      : remaining ? "✅ Anotado. ¡Casi igual que tu plan!" : "✅ Anotado. La semana que viene empezamos de cero");
}

/* Las fotos ocupan sitio en el móvil: solo guardamos las de las últimas semanas. */
function fpPruneOldPhotos() {
  const limit = new Date();
  limit.setDate(limit.getDate() - PHOTO_KEEP_DAYS);
  const cutoff = isoDate(limit);
  for (const [date, entry] of Object.entries(state.daily || {})) {
    if (date >= cutoff || !entry.offPlan) continue;
    for (const off of Object.values(entry.offPlan)) delete off.photo;
  }
}

function fpStartPhoto(slotKey, prevDraft) {
  fpPickPhoto(({ full, thumb }) => {
    const keep = prevDraft && prevDraft.status !== "analyzing" ? prevDraft : null;
    const useAi = !!FOOD_AI_URL && navigator.onLine !== false;
    fpOpenReview(slotKey, {
      photo: thumb, full: useAi ? full : null,
      items: keep && !useAi ? keep.items : [],
      name: keep && !useAi ? keep.name : "",
      status: useAi ? "analyzing" : "manual",
    });
    track("foto-comida");
  });
}

// ---------- Enganches con la app ----------

const fpOffPlanSheet = (function () {
  const original = openOffPlanSheet;
  return function (slotKey, opts = {}) {
    const entry = dailyEntry();
    const existing = entry.offPlan && entry.offPlan[slotKey];
    if (!opts.skipReview && existing && Array.isArray(existing.items)) {
      fpOpenReview(slotKey, {
        items: existing.items.map((it) => Object.assign({}, it, { per: Object.assign({}, it.per) })),
        name: existing.name, photo: existing.photo, emoji: existing.emoji, status: "edit",
      });
      return;
    }
    original(slotKey);
    fpInjectEntry(slotKey);
  };
})();

/* Botones de foto y de buscador encima de los platos típicos. */
function fpInjectEntry(slotKey) {
  const body = document.getElementById("sheet-body");
  const hint = body.querySelector(".hint");
  if (!hint || body.querySelector(".fp-entry")) return;
  hint.insertAdjacentHTML("afterend", `
    <div class="fp-entry">
      <button type="button" class="fp-cta" id="fp-cta-photo">
        <span class="fp-cta-icon" aria-hidden="true">📷</span>
        <span><b>Haz una foto a tu plato</b><small>${FOOD_AI_URL ? "Te decimos qué lleva y cuánto, más o menos" : "La guardamos y tú indicas qué llevaba"}</small></span>
      </button>
      <button type="button" class="fp-cta secondary" id="fp-cta-search">
        <span class="fp-cta-icon" aria-hidden="true">🔎</span>
        <span><b>Buscar lo que comiste</b><small>Ingrediente a ingrediente, con raciones típicas</small></span>
      </button>
    </div>
    <div class="section-kicker fp-or">O elige algo parecido</div>`);
  document.getElementById("fp-cta-photo").addEventListener("click", () => fpStartPhoto(slotKey));
  document.getElementById("fp-cta-search").addEventListener("click", () => {
    fpOpenReview(slotKey, { status: "manual" });
    const s = document.getElementById("fp-search");
    if (s) s.focus();
  });
}

openOffPlanSheet = fpOffPlanSheet;

/* La miniatura de la foto en la tarjeta de hoy. */
const fpOriginalBindTodayCard = bindTodayCard;
bindTodayCard = function () {
  fpOriginalBindTodayCard.apply(this, arguments);
  const entry = dailyEntry();
  if (!entry.offPlan) return;
  for (const [slotKey, off] of Object.entries(entry.offPlan)) {
    if (!off.photo) continue;
    const thumb = document.querySelector(`#today-card .today-meal[data-slot="${slotKey}"] .photo-thumb`);
    if (thumb && !thumb.querySelector("img")) {
      thumb.insertAdjacentHTML("beforeend", `<img src="${off.photo}" alt="" class="loaded">`);
    }
  }
};

(function fpInjectCss() {
  const css = `
  .fp-entry { display: grid; gap: 8px; margin: 14px 0 6px; }
  .fp-cta { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 14px; border-radius: var(--radius-md, 14px); border: none; cursor: pointer; font: inherit; color: #fff; background: linear-gradient(135deg, var(--coral), #c24e32); box-shadow: 0 6px 16px rgba(217,88,58,.25); }
  .fp-cta.secondary { background: var(--card); color: var(--ink); border: 1px solid var(--border); box-shadow: none; }
  .fp-cta b { display: block; font-size: 15px; }
  .fp-cta small { display: block; font-size: 12.5px; opacity: .85; margin-top: 2px; }
  .fp-cta-icon { font-size: 24px; flex: none; }
  .fp-cta:active { transform: scale(.98); }
  .fp-or { margin: 16px 0 0; }
  .fp-head { display: flex; gap: 12px; align-items: center; margin: 12px 0 10px; }
  .fp-photo { width: 84px; height: 84px; border-radius: 14px; object-fit: cover; flex: none; background: var(--bg); }
  .fp-photo-empty { border: 1.5px dashed var(--border); font-size: 30px; cursor: pointer; color: var(--muted); }
  .fp-head-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .fp-head-main input { width: 100%; }
  .fp-link { border: none; background: none; color: var(--coral-dark); font: inherit; font-size: 13px; font-weight: 600; padding: 2px 0; cursor: pointer; }
  .fp-status { font-size: 13px; line-height: 1.45; padding: 10px 12px; border-radius: 12px; background: var(--bg); color: var(--ink); margin-bottom: 10px; }
  .fp-status.ok { background: var(--green-light); color: var(--green-dark); }
  .fp-status.warn { background: var(--amber-light); color: var(--amber-dark); }
  .fp-status.analyzing { display: flex; align-items: center; gap: 10px; }
  .fp-note { opacity: .85; font-size: 12.5px; }
  .fp-spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border); border-top-color: var(--coral); animation: fpSpin .8s linear infinite; flex: none; }
  @keyframes fpSpin { to { transform: rotate(360deg); } }
  .fp-items { display: flex; flex-direction: column; gap: 6px; }
  .fp-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); }
  .fp-item-emoji { font-size: 20px; flex: none; }
  .fp-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .fp-item-name { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fp-item-macros { font-size: 12px; color: var(--muted); }
  .fp-qty { display: flex; align-items: center; gap: 4px; flex: none; }
  .fp-qty button { width: 30px; height: 30px; border-radius: 9px; border: 1px solid var(--border); background: var(--bg); color: var(--ink); font-size: 17px; line-height: 1; cursor: pointer; }
  .fp-qty-val { min-width: 58px; text-align: center; font-size: 12.5px; font-weight: 700; }
  .fp-remove { border: none; background: none; color: var(--muted); font-size: 13px; width: 26px; height: 30px; cursor: pointer; flex: none; }
  .fp-search { margin: 10px 0 12px; }
  .fp-search input { width: 100%; }
  .fp-results { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .fp-result { border: 1px solid var(--border); background: var(--card); color: var(--ink); border-radius: 999px; padding: 7px 12px; font: inherit; font-size: 13px; cursor: pointer; }
  .fp-result:active { transform: scale(.96); }
  .fp-totals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; text-align: center; background: var(--bg); border-radius: 12px; padding: 10px 6px; }
  .fp-totals b { display: block; font-size: 15px; }
  .fp-totals span { font-size: 11.5px; color: var(--muted); }
  .fp-approx { margin: 6px 0 0; }
  .fp-rest { margin: 8px 0 14px; color: var(--ink); }
  .fp-back { margin-top: 8px; }
  @media (max-width: 360px) { .fp-qty-val { min-width: 44px; } }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();
