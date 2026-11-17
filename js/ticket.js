/* Escanear el ticket del súper (prototipo).

   Haces una foto al ticket, el texto se lee en tu propio móvil con
   Tesseract.js (OCR en el navegador: la foto no se sube a ningún sitio) y la
   app reconoce los productos que están en su catálogo. Tú revisas lo que ha
   leído y, al guardar, esos precios pasan a ser los tuyos: el plan, la
   compra y el presupuesto se calculan con lo que pagas de verdad.

   Si la foto no se lee bien, también se puede pegar el texto del ticket
   digital (por ejemplo, el que llega por correo).

   Esto ataca el problema de los precios desactualizados: cada ticket los
   pone al día sin depender de que alguien revise la tabla a mano. */

const OCR_LIB = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const OCR_OPTIONS = {
  workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
  corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
  langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int",
};
const TICKET_SUSPICIOUS = 4; // ×4 o ÷4 respecto a la referencia: mejor revisarlo

/* Palabras que identifican cada alimento en un ticket (sin tildes). */
const TICKET_KEYWORDS = {
  pollo_pechuga: ["PECHUGA"], pollo_muslo: ["CONTRAMUSLO", "MUSLO"], pavo_filete: ["PAVO"],
  ternera_picada: ["PICADA", "PICADO"], lomo_cerdo: ["LOMO"],
  salmon: ["SALMON"], merluza: ["MERLUZA"], gambas: ["GAMBA", "LANGOSTINO"], atun_lata: ["ATUN"],
  huevos: ["HUEVO"], leche_semi: ["SEMIDESNATADA", "LECHE SEMI", "LECHE"], yogur_griego: ["GRIEGO"],
  yogur_natural: ["YOGUR"], queso_fresco: ["QUESO FRESCO", "BATIDO 0"], queso_curado: ["CURADO", "QUESO"],
  arroz: ["ARROZ"], pasta: ["MACARRON", "ESPAGUETI", "SPAGHETTI", "TALLARIN", "PASTA", "PLUMAS", "HELICES"],
  avena: ["AVENA"], quinoa: ["QUINOA"], lentejas: ["LENTEJA"], garbanzos: ["GARBANZO"],
  pan_integral: ["PAN INTEGRAL", "PAN"], aceite_oliva: ["ACEITE", "AOVE"], almendras: ["ALMENDRA"],
  crema_cacahuete: ["CACAHUETE"], tofu: ["TOFU"], miel: ["MIEL"],
  platano: ["PLATANO", "BANANA"], manzana: ["MANZANA"], aguacate: ["AGUACATE"], tomate: ["TOMATE"],
  brocoli: ["BROCOLI"], espinacas: ["ESPINACA"], pimiento: ["PIMIENTO"], cebolla: ["CEBOLLA"],
  calabacin: ["CALABACIN"], zanahoria: ["ZANAHORIA"], patata: ["PATATA"], boniato: ["BONIATO"],
  limon: ["LIMON"], ajo: ["AJO"], lechuga: ["LECHUGA", "ICEBERG", "ROMANA"],
};

let ticketLines = [];

function normalizeTicket(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

function parseEuro(s) {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

/* El alimento del catálogo que mejor encaja: gana la palabra más larga. */
function matchTicketFood(desc) {
  const text = normalizeTicket(desc);
  let best = null, bestLen = 0;
  for (const [id, words] of Object.entries(TICKET_KEYWORDS)) {
    for (const w of words) {
      if (w.length > bestLen && new RegExp(`\\b${w}`).test(text)) { best = id; bestLen = w.length; }
    }
  }
  return best;
}

/* Cantidad comprada en la unidad del alimento (g, ml o ud), si se deduce. */
function ticketQuantity(desc, foodId, count, weightKg) {
  const unit = FOODS[foodId].unit;
  const text = normalizeTicket(desc);
  if (unit === "g" && weightKg) return weightKg * 1000;
  const pack = text.match(/(\d+)\s*X\s*(\d+)/); // 3X80G
  if (unit === "ud") {
    if (pack) return Number(pack[1]) * count;
    const uds = text.match(/(\d+)\s*(?:UDS?|UNID|U)\b/) || text.match(/\b(6|12|18|24|30)\b/);
    if (/DOCENA/.test(text)) return 12 * count;
    if (uds) return Number(uds[1]) * count;
    return count;
  }
  const size = text.match(/(\d+(?:[.,]\d+)?)\s*(KG|GR?|L|ML|CL)\b/);
  if (!size) return null;
  const n = Number(size[1].replace(",", "."));
  const factor = { KG: 1000, G: 1, GR: 1, L: 1000, ML: 1, CL: 10 }[size[2]];
  const each = pack ? Number(pack[1]) * Number(pack[2]) : n * factor;
  return each * count;
}

/* Lee las líneas del ticket: "2 YOGUR GRIEGO 1,65 3,30", "PECHUGA POLLO 4,95",
   y la línea de peso que ponen debajo los productos al peso:
   "0,654 kg 7,49 €/kg 4,90". */
function parseTicket(text) {
  const lines = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const weight = line.match(/(\d+[.,]\d{2,3})\s*KG\b.*?(\d+[.,]\d{2})\s*€?\s*\/\s*KG.*?(\d+[.,]\d{2})\s*€?$/i);
    if (weight && lines.length) {
      const prev = lines[lines.length - 1];
      prev.weightKg = Number(weight[1].replace(",", "."));
      prev.total = parseEuro(weight[3]);
      continue;
    }
    const m = line.match(/^(?:(\d{1,2})\s+)?([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 .,%/\-]*?[A-ZÁÉÍÓÚÑÜ0-9%.])(?:\s+(\d+,\d{2}))?(?:\s+(\d+,\d{2}))?\s*€?$/i);
    if (!m) continue;
    const desc = m[2].trim();
    if (/TOTAL|IVA|TARJETA|EFECTIVO|CAMBIO|ENTREGADO|BASE|CUOTA|FACTURA|NIF|CIF/i.test(desc)) continue;
    const foodId = matchTicketFood(desc);
    if (!foodId) continue;
    const count = m[1] ? Number(m[1]) : 1;
    const total = m[4] ? parseEuro(m[4]) : m[3] ? parseEuro(m[3]) : null;
    lines.push({ desc, foodId, count, total });
  }
  return lines
    .filter((l) => l.total)
    .map((l) => ({ ...l, qty: ticketQuantity(l.desc, l.foodId, l.count, l.weightKg) }));
}

/* Precio por 100 g / 100 ml / unidad, como en FOODS. */
function ticketUnitPrice(line) {
  if (!line.qty || !line.total || !line.foodId) return null;
  const unit = FOODS[line.foodId].unit;
  return unit === "ud" ? line.total / line.qty : (line.total / line.qty) * 100;
}

function myPrices() {
  if (!state.myPrices || typeof state.myPrices !== "object") state.myPrices = {};
  return state.myPrices;
}

/* Precios de referencia originales, antes de aplicar los del usuario. */
const REF_PRICES = {};
function applyMyPrices() {
  for (const [id, f] of Object.entries(FOODS)) if (!(id in REF_PRICES)) REF_PRICES[id] = f.price;
  for (const id of Object.keys(FOODS)) {
    const mine = myPrices()[id];
    FOODS[id].price = mine ? mine.base : REF_PRICES[id];
  }
  Object.keys(RECIPE_CACHE).forEach((k) => delete RECIPE_CACHE[k]);
}

function formatUnitPrice(p, unit) {
  return `${p.toFixed(2).replace(".", ",")} €/${unit === "ud" ? "ud" : unit === "ml" ? "100 ml" : "100 g"}`;
}

function ticketCardHtml() {
  const mine = Object.entries(myPrices());
  const last = mine.reduce((d, [, v]) => (v.date > d ? v.date : d), "");
  return `
    <button type="button" class="ticket-card" id="ticket-card">
      <span class="ticket-emoji" aria-hidden="true">🧾</span>
      <span class="ticket-body"><b>Escanea tu ticket</b>
        <small>${mine.length
          ? `${mine.length} ${mine.length === 1 ? "precio tuyo" : "precios tuyos"} · último ticket el ${new Date(last).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`
          : "Pon los precios reales de tu súper con una foto"}</small></span>
      <span class="chevron-right" aria-hidden="true">›</span>
    </button>`;
}

function loadOcrLib() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = OCR_LIB;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error("No se pudo cargar el lector de tickets"));
    document.head.appendChild(s);
  });
}

async function readTicketImage(file, onProgress) {
  const Tesseract = await loadOcrLib();
  const worker = await Tesseract.createWorker("spa", 1, {
    ...OCR_OPTIONS,
    logger: (m) => { if (m.status === "recognizing text") onProgress(m.progress); },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

function openTicketSheet() {
  track("ticket-abierto");
  const body = document.getElementById("sheet-body");
  const mine = Object.entries(myPrices());
  body.innerHTML = `
    <h3>🧾 Escanea tu ticket</h3>
    <p class="hint">Haz una foto al ticket entero, recto y con buena luz. Se lee en tu móvil: la foto no sale de él.</p>
    <label class="btn block ticket-photo-btn">📸 Hacer foto o elegir imagen
      <input type="file" accept="image/*" capture="environment" id="ticket-file" hidden>
    </label>
    <details class="ticket-paste">
      <summary>¿Tienes el ticket digital? Pega el texto</summary>
      <textarea id="ticket-text" rows="6" placeholder="1 PECHUGA POLLO 500G 4,95&#10;HUEVOS L 12 UDS 2,40"></textarea>
      <button type="button" class="btn secondary small" id="ticket-read-text">Leer texto</button>
    </details>
    <div id="ticket-status" class="ticket-status hidden" role="status"></div>
    <div id="ticket-results"></div>
    ${mine.length ? `
      <div class="sheet-section">
        <h4>💶 Tus precios</h4>
        ${mine.map(([id, v]) => `
          <div class="ticket-saved"><span>${FOOD_EMOJI[id] || "•"} ${FOODS[id].name}</span>
          <small>${formatUnitPrice(v.real, FOODS[id].unit)}</small></div>`).join("")}
        <button type="button" class="btn ghost small" id="ticket-reset">Volver a los precios de referencia</button>
      </div>` : ""}
  `;
  const status = body.querySelector("#ticket-status");
  const setStatus = (html) => { status.classList.remove("hidden"); status.innerHTML = html; };

  body.querySelector("#ticket-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    track("ticket-foto");
    setStatus("⏳ Preparando el lector… la primera vez tarda un poco más.");
    try {
      const text = await readTicketImage(file, (p) => setStatus(`🔍 Leyendo el ticket… ${Math.round(p * 100)} %`));
      showTicketResults(text);
    } catch (err) {
      setStatus("😕 No hemos podido leer la foto. Prueba con más luz o pega el texto del ticket digital.");
    }
  });
  body.querySelector("#ticket-read-text").addEventListener("click", () => {
    track("ticket-texto");
    showTicketResults(body.querySelector("#ticket-text").value);
  });
  const reset = body.querySelector("#ticket-reset");
  if (reset) reset.addEventListener("click", () => {
    state.myPrices = {};
    saveState();
    applyMyPrices();
    renderAll();
    openTicketSheet();
    showToast("Precios de referencia restaurados");
  });
  if (document.getElementById("recipe-sheet").classList.contains("hidden")) openSheet();
}

function showTicketResults(text) {
  ticketLines = parseTicket(text || "");
  const status = document.getElementById("ticket-status");
  const out = document.getElementById("ticket-results");
  status.classList.remove("hidden");
  if (!ticketLines.length) {
    status.innerHTML = "😕 No hemos encontrado productos de la app en el ticket. Si la foto salió torcida o borrosa, prueba otra vez.";
    out.innerHTML = "";
    return;
  }
  status.innerHTML = `✅ Hemos reconocido ${ticketLines.length} ${ticketLines.length === 1 ? "producto" : "productos"}. Revisa la cantidad y guarda.`;
  out.innerHTML = `
    <div class="ticket-lines">
      ${ticketLines.map((l, i) => ticketLineHtml(l, i)).join("")}
    </div>
    <button type="button" class="btn block" id="ticket-save">Guardar mis precios</button>`;
  showTicketResultsBind();
}

function ticketLineHtml(l, i) {
  const food = l.foodId && FOODS[l.foodId];
  const price = ticketUnitPrice(l);
  const ref = food ? REF_PRICES[l.foodId] * storeIndex() : null;
  const ratio = price && ref ? price / ref : 1;
  const odd = ratio > TICKET_SUSPICIOUS || ratio < 1 / TICKET_SUSPICIOUS;
  if (l.use === undefined) l.use = !!price && !odd;
  return `
    <div class="ticket-line ${odd ? "odd" : ""}" data-line="${i}">
      <div class="ticket-line-top">
        <input type="checkbox" class="ticket-use" ${l.use ? "checked" : ""} ${price ? "" : "disabled"} aria-label="Usar este precio">
        <div class="ticket-desc"><b>${l.desc}</b><small>${l.total.toFixed(2).replace(".", ",")} € en el ticket</small></div>
      </div>
      <div class="ticket-line-edit">
        <select aria-label="Alimento">
          <option value="">— No está en la app —</option>
          ${Object.entries(FOODS).map(([id, f]) => `<option value="${id}" ${id === l.foodId ? "selected" : ""}>${f.name}</option>`).join("")}
        </select>
        ${food ? `<label class="ticket-qty"><input type="number" inputmode="decimal" min="0" step="any" value="${l.qty ? Math.round(l.qty * 100) / 100 : ""}" placeholder="?"> ${food.unit}</label>` : ""}
      </div>
      ${price ? `<small class="ticket-compare">${formatUnitPrice(price, food.unit)} · referencia ${formatUnitPrice(ref, food.unit)}${odd ? " · ⚠️ muy distinto, revisa la cantidad" : ""}</small>`
        : food ? `<small class="ticket-compare">Indica cuánto has comprado para calcular el precio.</small>` : ""}
    </div>`;
}

function showTicketResultsBind() {
  const out = document.getElementById("ticket-results");
  out.querySelectorAll("[data-line]").forEach((row) => {
    const i = Number(row.dataset.line);
    const sel = row.querySelector("select");
    if (!sel.dataset.bound) {
      sel.dataset.bound = "1";
      sel.addEventListener("change", (e) => {
        ticketLines[i].foodId = e.target.value || null;
        ticketLines[i].use = undefined;
        if (ticketLines[i].foodId) ticketLines[i].qty = ticketQuantity(ticketLines[i].desc, ticketLines[i].foodId, ticketLines[i].count, ticketLines[i].weightKg);
        row.outerHTML = ticketLineHtml(ticketLines[i], i);
        showTicketResultsBind();
      });
    }
    const qty = row.querySelector(".ticket-qty input");
    if (qty && !qty.dataset.bound) {
      qty.dataset.bound = "1";
      qty.addEventListener("change", () => {
        ticketLines[i].qty = Number(qty.value) || null;
        ticketLines[i].use = undefined;
        row.outerHTML = ticketLineHtml(ticketLines[i], i);
        showTicketResultsBind();
      });
    }
    const use = row.querySelector(".ticket-use");
    use.onchange = () => { ticketLines[i].use = use.checked; };
  });
  const save = document.getElementById("ticket-save");
  save.onclick = () => {
    const today = todayIso();
    let n = 0;
    for (const l of ticketLines) {
      const real = ticketUnitPrice(l);
      if (!l.use || !real) continue;
      // se guarda "a precio Mercadona" para que el índice del súper elegido no lo cuente dos veces
      myPrices()[l.foodId] = { real, base: real / storeIndex(), date: today };
      n++;
    }
    if (!n) { showToast("Marca al menos un precio para guardarlo"); return; }
    saveState();
    applyMyPrices();
    track("ticket-guardado");
    renderAll();
    showToast(`🧾 ${n} ${n === 1 ? "precio actualizado" : "precios actualizados"} con tu ticket`);
    openTicketSheet();
  };
}

const TICKET_CSS = `
.ticket-card { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 12px 14px; margin: 0 0 14px; border: 0; border-radius: var(--radius-lg); background: var(--card); box-shadow: var(--shadow-card); color: var(--ink); font: inherit; cursor: pointer; }
.ticket-emoji { font-size: 24px; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; background: var(--green-light); flex: none; }
.ticket-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.ticket-body b { font-size: 14.5px; }
.ticket-body small { color: var(--muted); font-size: 12.5px; }
.ticket-photo-btn { margin-top: 12px; display: flex; flex-direction: row; justify-content: center; color: #fff; cursor: pointer; }
.ticket-paste { margin-top: 12px; font-size: 13.5px; }
.ticket-paste summary { cursor: pointer; color: var(--coral-dark); font-weight: 600; }
.ticket-paste textarea { width: 100%; margin: 8px 0; font: inherit; font-size: 13px; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--card); color: var(--ink); }
.ticket-status { margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--bg); font-size: 13px; line-height: 1.45; }
.ticket-lines { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
.ticket-line { border: 1px solid var(--border); border-radius: var(--radius-md); padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.ticket-line.odd { border-color: var(--amber); }
.ticket-line-top { display: flex; gap: 10px; align-items: flex-start; }
.ticket-use { -webkit-appearance: checkbox; appearance: auto; accent-color: var(--green); width: 20px; height: 20px; min-width: 0; padding: 0; margin: 2px 0 0; flex: none; }
.ticket-desc { display: flex; flex-direction: column; gap: 2px; font-size: 13.5px; }
.ticket-desc small, .ticket-compare { color: var(--muted); font-size: 12px; }
.ticket-line.odd .ticket-compare { color: var(--amber-dark); }
.ticket-line-edit { display: flex; gap: 8px; align-items: center; }
.ticket-line-edit select { flex: 1; min-width: 0; font-size: 13px; padding: 8px; }
.ticket-qty { display: flex; flex-direction: row; align-items: center; gap: 4px; font-size: 13px; flex: none; }
.ticket-qty input { width: 76px; padding: 8px; font-size: 13px; }
.ticket-saved { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 13.5px; }
.ticket-saved small { color: var(--green-dark); font-weight: 700; white-space: nowrap; }
#ticket-reset { margin-top: 10px; }
`;

(function installTicket() {
  const style = document.createElement("style");
  style.textContent = TICKET_CSS;
  document.head.appendChild(style);

  // Los precios del usuario se aplican antes de que se pinte nada.
  applyMyPrices();

  // Este archivo se carga después de app.js: se engancha al momento.
  const baseCompra = renderCompra;
  renderCompra = function () {
    baseCompra.apply(this, arguments);
    const el = document.getElementById("compra-content");
    el.insertAdjacentHTML("afterbegin", ticketCardHtml());
    document.getElementById("ticket-card").addEventListener("click", openTicketSheet);
  };
})();
