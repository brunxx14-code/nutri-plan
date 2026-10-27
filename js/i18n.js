/* Idiomas. La app se escribe en español; para otro idioma, cada texto que
   aparece en pantalla se traduce al vuelo buscándolo en el diccionario de ese
   idioma (js/i18n-en.js). Las claves son el texto en español tal cual; las
   que llevan {n}, {x}... son plantillas para textos con números o nombres.
   Los datos (recetas, alimentos, informes) se traducen al cargar. */

const LANG_KEY = "nutriplan_lang";
const LANGUAGES = {
  es: { label: "Español", flag: "🇪🇸" },
  en: { label: "English", flag: "🇬🇧" },
};
const I18N = {}; // código de idioma -> { ui, templates, data }

/* Español por defecto; el usuario elige otro idioma en el perfil o al empezar. */
function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && LANGUAGES[saved]) return saved;
  } catch (e) { /* sin almacenamiento */ }
  return "es";
}

let currentLang = detectLang();

function setLang(code) {
  try { localStorage.setItem(LANG_KEY, code); } catch (e) { /* seguimos sin guardar */ }
  location.reload();
}

function dict() {
  return currentLang === "es" ? null : I18N[currentLang];
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Las plantillas se compilan una vez: "Llevas {n} días" -> /^Llevas (.+?) días$/ */
function compileTemplates(d) {
  if (d.compiled) return d.compiled;
  d.compiled = Object.entries(d.templates || {}).map(([es, out]) => {
    const names = [];
    const source = escapeRegex(es).replace(/\\\{(\w+)\\\}/g, (_, name) => {
      names.push(name);
      return "(.+?)";
    });
    return { re: new RegExp(`^${source}$`), names, out };
  });
  return d.compiled;
}

function lookup(text) {
  const d = dict();
  if (d.ui[text] !== undefined) return d.ui[text];
  for (const tpl of compileTemplates(d)) {
    const m = text.match(tpl.re);
    if (!m) continue;
    const vars = {};
    tpl.names.forEach((n, i) => { vars[n] = tr(m[i + 1]); });
    return tpl.out.replace(/\{(\w+)\}/g, (_, n) => vars[n]);
  }
  return undefined;
}

const produced = new Set(); // textos ya traducidos, para no volver a procesarlos

/* Traduce un texto completo; si no hay traducción lo devuelve igual. */
function tr(text) {
  if (!dict()) return text;
  const trimmed = text.trim();
  if (!trimmed || produced.has(trimmed)) return text;
  let out;
  // "🔥 Perder grasa": se traduce el texto y se conserva el emoji de delante
  const m = trimmed.match(/^([^\p{L}\p{N}¿¡"(]+)([¿¡"(]?[\p{L}\p{N}].*)$/u);
  if (m) {
    const rest = lookup(m[2]);
    if (rest !== undefined) out = m[1] + rest;
  }
  if (out === undefined) out = lookup(trimmed);
  if (out === undefined) {
    if (window.I18N_MISSING) window.I18N_MISSING.add(trimmed);
    return text;
  }
  produced.add(out);
  // conserva los espacios de alrededor, que separan el texto de las etiquetas vecinas
  return text.replace(trimmed, out);
}

const TRANSLATED_ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentNode && SKIP_TAGS.has(node.parentNode.nodeName)) return;
    const next = tr(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || SKIP_TAGS.has(node.nodeName)) return;
  for (const attr of TRANSLATED_ATTRS) {
    const v = node.getAttribute(attr);
    if (v) {
      const next = tr(v);
      if (next !== v) node.setAttribute(attr, next);
    }
  }
  node.childNodes.forEach(translateNode);
}

/* Datos: nombres de recetas, pasos, alimentos e informes. */
function translateData() {
  const d = dict();
  if (!d || !d.data) return;
  const { recipes = {}, foods = {}, articles = {}, sports = {} } = d.data;
  for (const r of RECIPES) if (recipes[r.id]) Object.assign(r, recipes[r.id]);
  for (const [id, name] of Object.entries(foods)) if (FOODS[id]) FOODS[id].name = name;
  for (const a of ARTICLES) if (articles[a.id]) Object.assign(a, articles[a.id]);
  for (const [id, label] of Object.entries(sports)) if (SPORTS[id]) SPORTS[id].label = label;
}

function startI18n() {
  document.documentElement.lang = currentLang;
  if (!dict()) return;
  translateData();
  document.title = tr(document.title);
  translateNode(document.body);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "characterData") translateNode(m.target);
      else if (m.type === "attributes") translateNode(m.target);
      else m.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: TRANSLATED_ATTRS,
  });
}

document.addEventListener("DOMContentLoaded", startI18n);
