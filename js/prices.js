/* Precios de la lista de la compra.

   No hay una API pública y fiable de precios de supermercado en España, así
   que la app usa una tabla de precios de referencia mantenida a mano:
   - el precio por 100 g / 100 ml / unidad de cada alimento está en FOODS
     (js/data.js), tomado como referencia de Mercadona;
   - cada cadena se ajusta con su índice de precios (SUPERMARKETS en data.js);
   - aquí está el formato en el que se vende cada producto (bandeja, paquete,
     bote...), para que la lista diga qué echar al carro y cuánto pagas en caja.

   Cuando se revisen los precios, actualiza PRICES_UPDATED. */

const PRICES_UPDATED = "2026-11-17";
const PRICES_REFERENCE = "Mercadona";

/* size en la unidad del alimento (g, ml o ud). Los alimentos que no aparecen
   aquí, o que llevan granel: true, se compran al peso o por piezas: se paga
   solo lo que se necesita, redondeado a `step`. */
const PACKS = {
  // Carnicería
  pollo_pechuga:   { size: 500,  kind: "Bandeja" },
  pollo_muslo:     { size: 600,  kind: "Bandeja" },
  pavo_filete:     { size: 400,  kind: "Bandeja" },
  ternera_picada:  { size: 400,  kind: "Bandeja" },
  lomo_cerdo:      { size: 500,  kind: "Bandeja" },
  // Pescadería
  salmon:          { size: 250,  kind: "Bandeja" },
  merluza:         { size: 400,  kind: "Bandeja" },
  gambas:          { size: 300,  kind: "Bolsa" },
  atun_lata:       { size: 3,    kind: "Pack" },
  // Lácteos y huevos
  huevos:          { size: 12,   kind: "Estuche" },
  leche_semi:      { size: 1000, kind: "Brick" },
  yogur_griego:    { size: 4,    kind: "Pack" },
  yogur_natural:   { size: 4,    kind: "Pack" },
  yogur_soja:      { size: 4,    kind: "Pack" },
  queso_fresco:    { size: 500,  kind: "Tarrina" },
  queso_curado:    { size: 250,  kind: "Cuña" },
  claras_huevo:    { size: 500,  kind: "Brick" },
  // Despensa
  arroz:           { size: 1000, kind: "Paquete" },
  pasta:           { size: 500,  kind: "Paquete" },
  avena:           { size: 500,  kind: "Paquete" },
  quinoa:          { size: 500,  kind: "Paquete" },
  lentejas:        { size: 1000, kind: "Paquete" },
  garbanzos:       { size: 400,  kind: "Bote" },
  pan_integral:    { size: 450,  kind: "Paquete" },
  aceite_oliva:    { size: 1000, kind: "Botella" },
  almendras:       { size: 200,  kind: "Bolsa" },
  crema_cacahuete: { size: 350,  kind: "Tarro" },
  tofu:            { size: 400,  kind: "Paquete" },
  miel:            { size: 500,  kind: "Tarro" },
  // Frutería: lo que suele venir embolsado; el resto, al peso
  espinacas:       { size: 300,  kind: "Bolsa" },
  zanahoria:       { size: 1000, kind: "Bolsa" },
  cebolla:         { size: 1000, kind: "Malla" },
};

/* Lo que entra en un envase "de sobra": si necesitas 510 g y el paquete es
   de 500 g, no te mandamos a comprar dos. */
const PACK_TOLERANCE = 0.05;

function formatPackSize(size, unit) {
  if (unit === "ud") return `${size} ud`;
  if (unit === "ml") return size >= 1000 ? `${(size / 1000).toString().replace(".", ",")} l` : `${size} ml`;
  return size >= 1000 ? `${(size / 1000).toString().replace(".", ",")} kg` : `${size} g`;
}

/* Qué compras para cubrir `qty` de un alimento y cuánto pagas.
   priceIndex = índice de la cadena (1 = Mercadona). */
function purchaseFor(foodId, qty, priceIndex = 1) {
  const food = FOODS[foodId];
  const perUnit = (food.unit === "ud" ? food.price : food.price / 100) * priceIndex;
  const pack = PACKS[foodId];
  if (!pack || pack.granel) {
    // al peso: redondeado a 50 g / 50 ml, o a piezas enteras
    const step = food.unit === "ud" ? 1 : 50;
    const buyQty = Math.max(step, Math.ceil(qty / step - PACK_TOLERANCE) * step);
    return { packs: null, buyQty, paid: buyQty * perUnit, label: food.unit === "ud" ? "por piezas" : "al peso" };
  }
  const packs = Math.max(1, Math.ceil(qty / pack.size - PACK_TOLERANCE));
  const buyQty = packs * pack.size;
  return {
    packs,
    buyQty,
    paid: buyQty * perUnit,
    label: `${pack.kind} de ${formatPackSize(pack.size, food.unit)}`,
  };
}

function formatPricesDate(iso = PRICES_UPDATED) {
  const [y, m, d] = iso.split("-").map(Number);
  if (typeof currentLang !== "undefined" && currentLang === "en") {
    const en = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${en[m - 1]} ${d}, ${y}`;
  }
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${d} de ${months[m - 1]} de ${y}`;
}

/* Textos en inglés de esta parte de la app (ver js/i18n.js). */
if (typeof I18N !== "undefined" && I18N.en) {
  Object.assign(I18N.en.ui, {
    "Pagas en caja": "You pay at the till",
    "Ya lo tienes en casa": "You already have it at home",
    "📤 Compartir lista": "📤 Share list",
    "Lista copiada: pégala en WhatsApp o en tus notas": "List copied: paste it in WhatsApp or your notes",
    "No se pudo compartir la lista": "Couldn't share the list",
    "Toca 🏠 en lo que ya tienes en casa y no lo contamos. Lo que sobra (aceite, arroz...) te dura para otras semanas.":
      "Tap 🏠 on what you already have at home and we won't count it. Leftovers (oil, rice...) last for other weeks.",
    "Ya lo tengo en casa": "I already have it at home",
  });
  Object.assign(I18N.en.templates, {
    "Necesitas {q}": "You need {q}",
    "{q} al peso": "{q} by weight",
    "{q} por piezas": "{q} by the piece",
    "{n} × {pack}": "{n} × {pack}",
    "Bandeja de {s}": "{s} tray",
    "Bolsa de {s}": "{s} bag",
    "Estuche de {s}": "Box of {s}",
    "Brick de {s}": "{s} carton",
    "Pack de {s}": "Pack of {s}",
    "Tarrina de {s}": "{s} tub",
    "Cuña de {s}": "{s} wedge",
    "Paquete de {s}": "{s} pack",
    "Bote de {s}": "{s} jar",
    "Botella de {s}": "{s} bottle",
    "Tarro de {s}": "{s} jar",
    "Malla de {s}": "{s} net bag",
    "Precios de referencia de {store} revisados el {date}, ajustados a cada cadena. No son precios en tiempo real: en tu tienda pueden variar.":
      "Reference prices from {store} checked on {date}, adjusted for each chain. They aren't live prices: your store may differ.",
    "Lo que comes esta semana: {n} €": "What you eat this week: €{n}",
  });
}
