/* Cuidado y privacidad.

   NutriPlan da orientación general sobre alimentación, no consejo médico.
   Este módulo:
   - Deja claro ese aviso al empezar y en el perfil.
   - Pregunta por situaciones en las que un déficit de calorías no es buena
     idea sin un profesional: menores de 18 años, embarazo, lactancia,
     trastornos de la conducta alimentaria (TCA) y enfermedades que cambian
     la dieta. En esos casos el plan nunca baja de las calorías de
     mantenimiento y se recomienda hablar con un profesional.
     Base: las guías de EFSA y de la AAP desaconsejan dietas restrictivas en
     menores sin seguimiento; en embarazo y lactancia las necesidades
     aumentan (EFSA, 2013); y en TCA el recuento de calorías y el peso
     pueden mantener el trastorno (NICE NG69, 2017).
   - Ofrece un "modo sin números" que oculta calorías y peso. Se activa solo
     si alguien indica un TCA.
   - Permite borrar todos los datos del móvil. El peso y la salud son datos
     de salud (art. 9 RGPD) y no salen nunca del dispositivo.

   Funciona envolviendo funciones de app.js, sin tocar ese archivo. */

const SAFETY_SITUATIONS = {
  ninguna: { emoji: "✅", label: "Ninguna de estas" },
  embarazo: { emoji: "🤰", label: "Estoy embarazada" },
  lactancia: { emoji: "🍼", label: "Estoy dando el pecho" },
  tca: { emoji: "💛", label: "Tengo o he tenido un trastorno de la conducta alimentaria" },
  medica: { emoji: "🩺", label: "Tengo una enfermedad que afecta a lo que como (diabetes, riñón, corazón...)" },
};
const NO_NUMBERS_CLASS = "np-no-numbers";
const ADULT_AGE = 18;

/* Quien está en una de estas situaciones no recibe un plan con déficit. */
function needsCare(profile) {
  if (!profile) return false;
  return (profile.age && profile.age < ADULT_AGE) || ["embarazo", "lactancia", "tca", "medica"].includes(profile.special);
}

function careReason(profile) {
  if (!profile) return "";
  if (profile.special === "embarazo") return "Durante el embarazo tu cuerpo necesita más energía, no menos.";
  if (profile.special === "lactancia") return "Dando el pecho necesitas más energía que de costumbre.";
  if (profile.special === "tca") return "Con un trastorno de la conducta alimentaria, contar calorías o perder peso puede hacer daño.";
  if (profile.special === "medica") return "Con una enfermedad que afecta a la dieta, los cambios los tiene que guiar tu médico.";
  if (profile.age && profile.age < ADULT_AGE) return "Mientras estás creciendo, tu cuerpo necesita toda la energía que gasta.";
  return "";
}

function noNumbersOn() {
  return !!(state.prefs && state.prefs.noNumbers);
}

function setNoNumbers(on) {
  state.prefs = state.prefs || {};
  state.prefs.noNumbers = !!on;
  saveState();
  applyNoNumbers();
}

/* ---------- Modo sin números ---------- */

// "520 kcal", "1.200 / 2.100 kcal", "+150 kcal/día"...
const KCAL_TEXT = /[+−-]?\s*\d[\d.,]*\s*(?:\/\s*\d[\d.,]*\s*)?kcal(?:\s*\/\s*(?:día|day))?/gi;

function stripKcal(node) {
  const v = node.nodeValue;
  if (!/kcal/i.test(v)) return;
  let next = v.replace(KCAL_TEXT, "").replace(/^\s*·\s*/, "").replace(/\s*·\s*$/, "").replace(/·\s*·/g, "·");
  if (next !== v) node.nodeValue = next;
}

function stripKcalIn(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) return stripKcal(root);
  if (root.nodeType !== Node.ELEMENT_NODE || root.closest("script, style, textarea")) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(stripKcal);
}

let noNumbersObserver = null;
function applyNoNumbers() {
  const on = noNumbersOn();
  document.documentElement.classList.toggle(NO_NUMBERS_CLASS, on);
  if (!on) {
    if (noNumbersObserver) { noNumbersObserver.disconnect(); noNumbersObserver = null; }
    return;
  }
  const root = document.getElementById("app-shell");
  stripKcalIn(root);
  if (noNumbersObserver) return;
  noNumbersObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") stripKcal(m.target);
      else m.addedNodes.forEach(stripKcalIn);
    }
  });
  noNumbersObserver.observe(root, { childList: true, subtree: true, characterData: true });
}

/* ---------- Onboarding: aviso y situaciones especiales ---------- */

function safetyStepHtml() {
  return `
    <div class="safety-step" id="safety-step">
      <label class="block-label">¿Te pasa alguna de estas cosas? (opcional)</label>
      <p class="hint">Así cuidamos que el plan sea seguro para ti. Se queda solo en tu móvil.</p>
      <div class="safety-options">
        ${Object.entries(SAFETY_SITUATIONS).map(([key, s]) => `
          <label class="safety-option">
            <input type="radio" name="special" value="${key}" ${key === "ninguna" ? "checked" : ""}>
            <span class="safety-emoji" aria-hidden="true">${s.emoji}</span>
            <span>${s.label}</span>
          </label>`).join("")}
      </div>
      <div class="safety-note hidden" id="safety-note" role="status"></div>
    </div>`;
}

function disclaimerHtml(extra = "") {
  return `<p class="safety-disclaimer ${extra}">🩺 NutriPlan te da orientación general basada en guías de nutrición. No es consejo médico ni sustituye a un dietista-nutricionista o a tu médico.</p>`;
}

function updateSafetyNote() {
  const form = document.getElementById("onboarding-form");
  const note = document.getElementById("safety-note");
  if (!form || !note) return;
  // embarazo y lactancia solo se ofrecen si has marcado "Mujer"
  const isMan = form.sex && form.sex.value === "hombre";
  form.querySelectorAll('input[name="special"][value="embarazo"], input[name="special"][value="lactancia"]').forEach((r) => {
    r.closest(".safety-option").classList.toggle("hidden", isMan);
    if (isMan && r.checked) form.querySelector('input[name="special"][value="ninguna"]').checked = true;
  });
  const p = { age: Number(form.age.value) || 0, special: (form.querySelector('input[name="special"]:checked') || {}).value };
  const care = needsCare(p);
  const wantsLoss = form.goal && form.goal.value === "perder";
  note.classList.toggle("hidden", !care);
  if (!care) return;
  note.innerHTML = `💛 ${careReason(p)} ${wantsLoss
    ? "Por eso tu plan será de <b>mantenimiento</b>, sin déficit de calorías."
    : "Tu plan nunca bajará de lo que gastas."} Te recomendamos hablarlo con un profesional sanitario.${p.special === "tca" ? " Activaremos el modo sin números: no verás calorías ni peso." : ""}`;
}

function injectOnboarding() {
  const step0 = document.querySelector('.wizard-step[data-step="0"]');
  if (step0 && !document.getElementById("safety-step")) step0.insertAdjacentHTML("beforeend", safetyStepHtml());
  const step3 = document.querySelector('.wizard-step[data-step="3"]');
  if (step3 && !step3.querySelector(".safety-disclaimer")) step3.insertAdjacentHTML("beforeend", disclaimerHtml());
  const form = document.getElementById("onboarding-form");
  ["input", "change", "click"].forEach((ev) => form.addEventListener(ev, () => requestAnimationFrame(updateSafetyNote)));
}

/* ---------- Tarjetas en el resumen y el perfil ---------- */

function careCardHtml() {
  const p = state.profile;
  if (!needsCare(p) || (state.prefs && state.prefs.careCardHidden === p.special + p.age)) return "";
  return `
    <div class="care-card" id="care-card">
      <div class="care-emoji" aria-hidden="true">💛</div>
      <div class="care-body">
        <b>Tu plan es de mantenimiento</b>
        <p>${careReason(p)} Usa NutriPlan para organizarte y comer variado, y deja los cambios de peso en manos de un profesional sanitario.</p>
      </div>
      <button type="button" class="care-close" id="care-close" aria-label="Cerrar">✕</button>
    </div>`;
}

function healthCardHtml() {
  const p = state.profile;
  const s = SAFETY_SITUATIONS[p.special] || SAFETY_SITUATIONS.ninguna;
  return `
    <div class="pcard health-card" id="health-card">
      <div class="section-kicker">🛡️ Salud y privacidad</div>
      <label class="switch-row">
        <span><b>Modo sin números</b><small>Oculta calorías y peso en toda la app</small></span>
        <input type="checkbox" id="no-numbers-toggle" ${noNumbersOn() ? "checked" : ""}>
      </label>
      <div class="pline">${s.emoji} ${p.special && p.special !== "ninguna" ? s.label : "Sin situaciones especiales"}${p.age < ADULT_AGE ? " · menor de 18" : ""}</div>
      ${needsCare(p) ? `<p class="hint">💛 Tu plan no baja de tus calorías de mantenimiento.</p>` : ""}
      ${disclaimerHtml("in-card")}
      <p class="hint">🔒 Tu peso y tus datos de salud se guardan solo en este móvil. No se envían a ningún servidor.</p>
      <button type="button" class="btn ghost small block delete-data-btn" id="delete-data-btn">🗑️ Borrar todos mis datos</button>
    </div>`;
}

function deleteAllData() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("nutriplan")).forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch (e) { /* sin almacenamiento: no hay nada que borrar */ }
  location.reload();
}

function bindHealthCard(root) {
  const toggle = root.querySelector("#no-numbers-toggle");
  if (toggle) toggle.addEventListener("change", () => {
    setNoNumbers(toggle.checked);
    track(toggle.checked ? "sin-numeros-on" : "sin-numeros-off");
    renderAll();
  });
  const del = root.querySelector("#delete-data-btn");
  if (del) del.addEventListener("click", () => {
    if (!del.classList.contains("armed")) {
      del.classList.add("armed");
      del.textContent = "⚠️ Toca otra vez para borrarlo todo";
      setTimeout(() => {
        if (!del.isConnected) return;
        del.classList.remove("armed");
        del.textContent = "🗑️ Borrar todos mis datos";
      }, 4000);
      return;
    }
    deleteAllData();
  });
}

/* En modo sin números el peso también se oculta del perfil. */
function hideWeightInPerfil(el) {
  if (!noNumbersOn()) return;
  el.querySelectorAll(".profile-hero-chips span, .stat-tile").forEach((n) => {
    if (/kg|IMC|BMI/.test(n.textContent)) n.classList.add("np-weight");
  });
}

/* ---------- Enganches con app.js ---------- */

function installSafetyHooks() {
  const baseRead = readProfileFromForm;
  readProfileFromForm = function (form) {
    const p = baseRead.apply(this, arguments);
    const picked = form.querySelector('input[name="special"]:checked');
    p.special = picked ? picked.value : "ninguna";
    if (needsCare(p) && p.goal === "perder") p.goal = "mantener";
    return p;
  };

  const baseFill = fillFormFromProfile;
  fillFormFromProfile = function (form, profile) {
    baseFill.apply(this, arguments);
    const radio = form.querySelector(`input[name="special"][value="${profile.special || "ninguna"}"]`);
    if (radio) radio.checked = true;
    updateSafetyNote();
  };

  // Red de seguridad: aunque un perfil antiguo diga "perder", nunca hay déficit.
  const baseTargets = calcTargets;
  calcTargets = function (profile, calorieAdjust = 0) {
    if (!needsCare(profile)) return baseTargets.apply(this, arguments);
    const safe = profile.goal === "perder" ? { ...profile, goal: "mantener" } : profile;
    return baseTargets.call(this, safe, Math.max(0, calorieAdjust || 0));
  };

  // Con un TCA no enseñamos calorías ni en la vista previa del formulario.
  const basePreview = updateWizardPreview;
  updateWizardPreview = function () {
    basePreview.apply(this, arguments);
    const picked = document.querySelector('#onboarding-form input[name="special"]:checked');
    const box = document.getElementById("wizard-preview");
    if (box && picked && picked.value === "tca") box.classList.add("hidden");
  };

  const baseSuggest = suggestCalorieAdjustment;
  suggestCalorieAdjustment = function (profile) {
    const s = baseSuggest.apply(this, arguments);
    if (s && needsCare(profile) && s.kcal < 0) return null;
    return s;
  };

  const baseDashboard = renderDashboard;
  renderDashboard = function () {
    baseDashboard.apply(this, arguments);
    const el = document.getElementById("dashboard-content");
    const card = careCardHtml();
    if (!card) return;
    const anchor = el.querySelector(".chip-row");
    if (anchor) anchor.insertAdjacentHTML("afterend", card);
    else el.insertAdjacentHTML("afterbegin", card);
    document.getElementById("care-close").addEventListener("click", () => {
      state.prefs = state.prefs || {};
      state.prefs.careCardHidden = state.profile.special + state.profile.age;
      saveState();
      document.getElementById("care-card").remove();
    });
  };

  const basePerfil = renderPerfil;
  renderPerfil = function () {
    basePerfil.apply(this, arguments);
    const el = document.getElementById("perfil-content");
    const edit = el.querySelector("#edit-profile-btn");
    if (edit) edit.insertAdjacentHTML("beforebegin", healthCardHtml());
    else el.insertAdjacentHTML("beforeend", healthCardHtml());
    bindHealthCard(el);
    hideWeightInPerfil(el);
  };

  // Al guardar el perfil: si alguien indica un TCA, se activa el modo sin números.
  const form = document.getElementById("onboarding-form");
  form.addEventListener("submit", () => {
    const picked = form.querySelector('input[name="special"]:checked');
    if (picked && picked.value === "tca" && !(state.prefs && state.prefs.noNumbersAsked)) {
      state.prefs = state.prefs || {};
      state.prefs.noNumbersAsked = true;
      setNoNumbers(true);
    }
  }, true);
}

/* ---------- Estilos ---------- */

const SAFETY_CSS = `
.safety-step { margin-top: 18px; }
.safety-options { display: grid; gap: 8px; margin-top: 8px; }
.safety-option { display: flex; flex-direction: row; text-align: left; align-items: center; gap: 10px; padding: 11px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--card); font-size: 13.5px; line-height: 1.3; cursor: pointer; }
.safety-option input { -webkit-appearance: radio; appearance: auto; accent-color: var(--coral); flex: none; margin: 0; padding: 0; border: 0; width: 18px; height: 18px; min-width: 0; }
.safety-option:has(input:checked) { border-color: var(--coral); background: var(--coral-light); }
.safety-emoji { font-size: 18px; flex: none; }
.safety-note { margin-top: 10px; padding: 12px; border-radius: var(--radius-sm); background: var(--amber-light); color: var(--ink); font-size: 13px; line-height: 1.45; }
.safety-disclaimer { margin-top: 16px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg); border: 1px dashed var(--border); color: var(--muted); font-size: 12px; line-height: 1.45; }
.safety-disclaimer.in-card { margin-top: 10px; }
.care-card { display: flex; gap: 12px; align-items: flex-start; padding: 14px; margin-bottom: 14px; border-radius: var(--radius-lg); background: var(--amber-light); box-shadow: var(--shadow-card); }
.care-emoji { font-size: 24px; }
.care-body { flex: 1; font-size: 13px; line-height: 1.45; }
.care-body p { margin: 4px 0 0; color: var(--ink); }
.care-close { background: none; border: 0; color: var(--muted); font-size: 15px; cursor: pointer; padding: 2px 4px; }
.switch-row { display: flex; flex-direction: row; text-align: left; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0 10px; cursor: pointer; }
.switch-row small { display: block; color: var(--muted); font-size: 12px; font-weight: 500; margin-top: 2px; }
.switch-row input { appearance: none; -webkit-appearance: none; flex: none; width: 46px; min-width: 0; height: 28px; padding: 0; border: 0; border-radius: 999px; background: var(--border); position: relative; transition: background .2s; cursor: pointer; margin: 0; }
.switch-row input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .2s; }
.switch-row input:checked { background: var(--green); }
.switch-row input:checked::after { transform: translateX(18px); }
.delete-data-btn { margin-top: 10px; width: 100%; }
.delete-data-btn.armed { border-color: var(--red); color: var(--red); background: var(--red-light); }
/* Modo sin números: fuera calorías y peso */
.np-no-numbers .ring-center, .np-no-numbers .legend-val, .np-no-numbers .legend-pct, .np-no-numbers .ring-sport-note,
.np-no-numbers #wizard-preview, .np-no-numbers .pkcal, .np-no-numbers .pmacro b, .np-no-numbers .macro-tile.kcal,
.np-no-numbers #targets-why-card, .np-no-numbers .progress-card, .np-no-numbers .np-weight { display: none !important; }
`;

function injectSafetyCss() {
  const style = document.createElement("style");
  style.id = "safety-css";
  style.textContent = SAFETY_CSS;
  document.head.appendChild(style);
}

/* ---------- Inglés ---------- */

const SAFETY_EN = {
  "¿Te pasa alguna de estas cosas? (opcional)": "Does any of this apply to you? (optional)",
  "Así cuidamos que el plan sea seguro para ti. Se queda solo en tu móvil.": "So we can keep your plan safe. It stays on your phone only.",
  "Ninguna de estas": "None of these",
  "Estoy embarazada": "I'm pregnant",
  "Estoy dando el pecho": "I'm breastfeeding",
  "Tengo o he tenido un trastorno de la conducta alimentaria": "I have or have had an eating disorder",
  "Tengo una enfermedad que afecta a lo que como (diabetes, riñón, corazón...)": "I have a condition that affects what I eat (diabetes, kidney, heart...)",
  "🩺 NutriPlan te da orientación general basada en guías de nutrición. No es consejo médico ni sustituye a un dietista-nutricionista o a tu médico.": "🩺 NutriPlan gives general guidance based on nutrition guidelines. It is not medical advice and does not replace a dietitian or your doctor.",
  "Tu plan es de mantenimiento": "Your plan is a maintenance plan",
  "Salud y privacidad": "Health and privacy",
  "Modo sin números": "No-numbers mode",
  "Oculta calorías y peso en toda la app": "Hides calories and weight across the app",
  "Sin situaciones especiales": "No special situation",
  "💛 Tu plan no baja de tus calorías de mantenimiento.": "💛 Your plan never goes below your maintenance calories.",
  "🔒 Tu peso y tus datos de salud se guardan solo en este móvil. No se envían a ningún servidor.": "🔒 Your weight and health data are stored only on this phone. They are never sent to a server.",
  "Borrar todos mis datos": "Delete all my data",
  "Toca otra vez para borrarlo todo": "Tap again to delete everything",
};

document.addEventListener("DOMContentLoaded", () => {
  if (typeof I18N !== "undefined" && I18N.en) Object.assign(I18N.en.ui, SAFETY_EN);
  injectSafetyCss();
  installSafetyHooks();
  injectOnboarding();
  applyNoNumbers();
});
