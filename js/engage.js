/* Enganche: puntos (XP) por cuidarte, niveles, logros, reto del día, el tour
   de bienvenida para quien entra por primera vez y la animación de "creando
   tu plan". Se carga después de app.js y usa su estado y sus utilidades. */

const XP_REWARDS = { comida: 10, agua: 2, dia: 30, peso: 20, compra: 25, fuera: 5, informe: 10, cambio: 5, reto: 50 };

const LEVELS = [
  { xp: 0, name: "Principiante", emoji: "🌱" },
  { xp: 100, name: "En marcha", emoji: "🚶" },
  { xp: 300, name: "Constante", emoji: "🔥" },
  { xp: 600, name: "Disciplinado", emoji: "💪" },
  { xp: 1000, name: "Imparable", emoji: "🚀" },
  { xp: 1600, name: "Leyenda", emoji: "👑" },
];

const BADGES = [
  { id: "primer_paso", emoji: "👣", name: "Primer paso", desc: "Marca tu primera comida" },
  { id: "dia_perfecto", emoji: "🌟", name: "Día perfecto", desc: "Haz las 4 comidas de un día" },
  { id: "racha_3", emoji: "🔥", name: "En racha", desc: "3 días seguidos cumpliendo" },
  { id: "racha_7", emoji: "🏆", name: "Semana de oro", desc: "7 días seguidos cumpliendo" },
  { id: "hidratado", emoji: "💧", name: "Bien hidratado", desc: "Cumple tu objetivo de agua" },
  { id: "primer_peso", emoji: "⚖️", name: "Me peso", desc: "Registra tu peso" },
  { id: "comprador", emoji: "🛒", name: "Carro lleno", desc: "Completa la lista de la compra" },
  { id: "lector", emoji: "📚", name: "Curioso", desc: "Lee 3 informes" },
  { id: "explorador", emoji: "🧭", name: "Explorador", desc: "Cambia 3 platos del plan" },
  { id: "sincero", emoji: "🙌", name: "Sin trampas", desc: "Anota una comida fuera del plan" },
  { id: "sibarita", emoji: "❤️", name: "Sibarita", desc: "Guarda 3 recetas favoritas" },
  { id: "retador", emoji: "🎯", name: "Retador", desc: "Supera 3 retos del día" },
];

/* Un reto distinto cada día; progress() devuelve [hecho, objetivo]. */
const CHALLENGES = [
  { id: "comidas", emoji: "🍽️", text: () => "Marca las 4 comidas de hoy", progress: (e) => [mealsDone(e), MEAL_SLOTS.length] },
  { id: "agua", emoji: "💧", text: () => `Bebe ${waterGoalGlasses()} vasos de agua`, progress: (e) => [e.water, waterGoalGlasses()] },
  { id: "informe", emoji: "📚", text: () => "Lee un informe de nutrición", progress: (e) => [Math.min(1, e.read || 0), 1] },
  { id: "cambio", emoji: "🔄", text: () => "Cambia un plato por otro que te apetezca", progress: (e) => [Math.min(1, e.swaps || 0), 1] },
  { id: "desayuno", emoji: "☀️", text: () => "Desayuna y márcalo antes de las 11", progress: (e) => [e.breakfastEarly ? 1 : 0, 1] },
];

if (typeof state.xp !== "number") state.xp = 0;
if (!state.badges || typeof state.badges !== "object") state.badges = {};
if (!state.counters || typeof state.counters !== "object") state.counters = {};

function levelFor(xp) {
  let idx = 0;
  LEVELS.forEach((l, i) => { if (xp >= l.xp) idx = i; });
  const next = LEVELS[idx + 1];
  const pct = next ? (xp - LEVELS[idx].xp) / (next.xp - LEVELS[idx].xp) : 1;
  return { idx, level: LEVELS[idx], next, pct };
}

function floatXp(amount, anchor) {
  if (!anchor || prefersReducedMotion()) return;
  const shell = document.getElementById("app-shell");
  const box = anchor.getBoundingClientRect();
  const shellBox = shell.getBoundingClientRect();
  const el = document.createElement("span");
  el.className = "xp-float";
  el.textContent = `+${amount} XP`;
  el.style.left = `${box.left - shellBox.left + box.width / 2}px`;
  el.style.top = `${box.top - shellBox.top}px`;
  shell.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

/* Suma puntos por una acción y celebra si sube de nivel. */
function reward(kind, anchor) {
  const amount = XP_REWARDS[kind] || 0;
  const before = levelFor(state.xp).idx;
  state.xp += amount;
  saveState();
  floatXp(amount, anchor);
  updateLevelChip();
  const after = levelFor(state.xp);
  if (after.idx > before) {
    track(`nivel-${after.idx + 1}`);
    queueCelebration({ type: "level", ...after });
    if (grantStreakFreeze()) setTimeout(() => showToast("🧊 +1 protector de racha"), 1200);
  }
}

function unlockBadge(id) {
  if (state.badges[id]) return;
  state.badges[id] = todayIso();
  saveState();
  track(`logro-${id}`);
  queueCelebration({ type: "badge", badge: BADGES.find((b) => b.id === id) });
  document.querySelectorAll(".badge-shelf").forEach((shelf) => { shelf.outerHTML = badgeShelfHtml(); });
}

function bumpCounter(name) {
  state.counters[name] = (state.counters[name] || 0) + 1;
  saveState();
  return state.counters[name];
}

/* Logros que dependen de la racha: se revisan cada vez que se marca comida. */
function checkStreakBadges() {
  const streak = currentStreak();
  if (streak >= 3) unlockBadge("racha_3");
  if (streak >= 7) unlockBadge("racha_7");
}

// ---------- Celebraciones (una detrás de otra) ----------

const celebrationQueue = [];
let celebrating = false;

function queueCelebration(item) {
  celebrationQueue.push(item);
  if (!celebrating) setTimeout(nextCelebration, 450);
}

function nextCelebration() {
  const item = celebrationQueue.shift();
  if (!item) { celebrating = false; return; }
  celebrating = true;
  const el = document.createElement("div");
  el.className = `celebrate celebrate-${item.type}`;
  el.innerHTML = item.type === "level" ? `
      <div class="celebrate-card">
        <div class="celebrate-kicker">¡Subes de nivel!</div>
        <div class="celebrate-emoji">${item.level.emoji}</div>
        <div class="celebrate-title">Nivel ${item.idx + 1} · ${item.level.name}</div>
        <p class="celebrate-sub">${item.next ? `Siguiente: ${item.next.emoji} ${item.next.name} a ${item.next.xp} XP` : "Has llegado a lo más alto 👑"}</p>
        <button type="button" class="btn block">¡Vamos!</button>
      </div>` : `
      <div class="celebrate-card">
        <div class="celebrate-kicker">¡Logro desbloqueado!</div>
        <div class="celebrate-emoji">${item.badge.emoji}</div>
        <div class="celebrate-title">${item.badge.name}</div>
        <p class="celebrate-sub">${item.badge.desc}</p>
        <button type="button" class="btn block">Genial</button>
      </div>`;
  document.getElementById("app-shell").appendChild(el);
  burstConfetti();
  buzz(25);
  const close = () => {
    if (el.classList.contains("hide")) return;
    el.classList.add("hide");
    setTimeout(() => { el.remove(); nextCelebration(); }, 300);
  };
  el.addEventListener("click", close);
  setTimeout(close, item.type === "level" ? 5000 : 3500);
}

// ---------- Nivel en el resumen ----------

function levelChipHtml() {
  const { idx, level, pct } = levelFor(state.xp);
  return `
    <button type="button" class="level-chip" id="level-chip">
      <span class="level-emoji">${level.emoji}</span>
      <span class="level-text">Nv. ${idx + 1}</span>
      <span class="level-bar"><i style="width:${Math.round(pct * 100)}%"></i></span>
    </button>`;
}

function updateLevelChip() {
  const chip = document.getElementById("level-chip");
  if (!chip) return;
  const { idx, level, pct } = levelFor(state.xp);
  chip.querySelector(".level-emoji").textContent = level.emoji;
  chip.querySelector(".level-text").textContent = `Nv. ${idx + 1}`;
  chip.querySelector(".level-bar i").style.width = `${Math.round(pct * 100)}%`;
  chip.classList.remove("pop");
  void chip.offsetWidth;
  chip.classList.add("pop");
}

function bindLevelChip(root) {
  const chip = root.querySelector("#level-chip");
  if (chip) chip.addEventListener("click", openAchievementsSheet);
}

function badgeShelfHtml() {
  const got = BADGES.filter((b) => state.badges[b.id]).length;
  return `
    <div class="badge-shelf">
      <div class="badge-shelf-head"><span>🏅 Logros</span><b>${got}/${BADGES.length}</b></div>
      <div class="badge-grid">
        ${BADGES.map((b, i) => `
          <div class="badge ${state.badges[b.id] ? "won" : "locked"}" style="animation-delay:${i * 0.04}s">
            <span class="badge-emoji">${state.badges[b.id] ? b.emoji : "🔒"}</span>
            <span class="badge-name">${b.name}</span>
            <span class="badge-desc">${b.desc}</span>
          </div>`).join("")}
      </div>
    </div>`;
}

function openAchievementsSheet() {
  const { idx, level, next, pct } = levelFor(state.xp);
  track("logros-vistos");
  document.getElementById("sheet-body").innerHTML = `
    <span class="tag tag-amber">⭐ ${state.xp} XP</span>
    <h3>${level.emoji} Nivel ${idx + 1} · ${level.name}</h3>
    <div class="level-track"><i style="width:${Math.round(pct * 100)}%"></i></div>
    <p class="hint">${next ? `Te faltan ${next.xp - state.xp} XP para ${next.emoji} ${next.name}.` : "Has llegado a lo más alto 👑"}</p>
    <div class="xp-howto">
      <span>🍽️ Comida hecha <b>+${XP_REWARDS.comida}</b></span>
      <span>🌟 Día completo <b>+${XP_REWARDS.dia}</b></span>
      <span>🎯 Reto del día <b>+${XP_REWARDS.reto}</b></span>
      <span>⚖️ Pesarte <b>+${XP_REWARDS.peso}</b></span>
    </div>
    ${badgeShelfHtml()}
  `;
  openSheet();
}

// ---------- Reto del día ----------

function todayChallenge() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  return CHALLENGES[dayOfYear % CHALLENGES.length];
}

function challengeCardHtml() {
  const ch = todayChallenge();
  const entry = dailyEntry();
  const [done, goal] = ch.progress(entry);
  const complete = !!entry.challengeDone;
  return `
    <div class="challenge-card ${complete ? "complete" : ""}" id="challenge-card">
      <div class="challenge-emoji">${complete ? "🏅" : ch.emoji}</div>
      <div class="challenge-body">
        <div class="challenge-kicker">${complete ? "¡Reto superado!" : "Reto del día"}</div>
        <div class="challenge-text">${ch.text()}</div>
        <div class="challenge-bar"><i style="width:${Math.min(100, (done / goal) * 100)}%"></i></div>
      </div>
      <div class="challenge-xp">${complete ? "✓" : `+${XP_REWARDS.reto} XP`}</div>
    </div>`;
}

/* Se llama tras cada acción: si el reto de hoy se ha cumplido, lo celebra. */
function checkChallenge() {
  const entry = dailyEntry();
  const card = document.getElementById("challenge-card");
  const [done, goal] = todayChallenge().progress(entry);
  if (!entry.challengeDone && done >= goal) {
    entry.challengeDone = true;
    saveState();
    track(`reto-${todayChallenge().id}`);
    reward("reto", card);
    showToast("🎯 ¡Reto del día superado!");
    if (bumpCounter("challenges") >= 3) unlockBadge("retador");
  }
  if (card) {
    card.outerHTML = challengeCardHtml();
    const fresh = document.getElementById("challenge-card");
    if (entry.challengeDone && done >= goal && fresh) fresh.classList.add("just-done");
  }
}

// ---------- Ganchos desde las acciones de la app ----------

const engage = {
  mealEaten(slotKey, anchor) {
    const entry = dailyEntry();
    // los puntos de cada comida se dan una vez al día, aunque se desmarque y se vuelva a marcar
    if (!entry.xpMeals) entry.xpMeals = {};
    if (!entry.xpMeals[slotKey]) {
      entry.xpMeals[slotKey] = true;
      reward("comida", anchor);
    }
    unlockBadge("primer_paso");
    if (slotKey === "desayuno" && new Date().getHours() < 11) entry.breakfastEarly = true;
    if (mealsDone(entry) === MEAL_SLOTS.length && !entry.perfectRewarded) {
      entry.perfectRewarded = true;
      reward("dia");
      unlockBadge("dia_perfecto");
    }
    checkStreakBadges();
    checkChallenge();
  },
  water(increased, reachedGoal, anchor) {
    const entry = dailyEntry();
    if (increased && entry.water > (entry.xpWater || 0)) {
      entry.xpWater = entry.water;
      reward("agua", anchor);
    }
    if (reachedGoal) unlockBadge("hidratado");
    checkChallenge();
  },
  weighed(anchor) {
    const entry = dailyEntry();
    if (!entry.xpWeigh) {
      entry.xpWeigh = true;
      reward("peso", anchor);
    }
    unlockBadge("primer_peso");
  },
  shoppingDone() {
    const week = weekDates()[0];
    if (state.counters.shoppingWeek !== week) {
      state.counters.shoppingWeek = week; // una vez por semana
      reward("compra");
    }
    unlockBadge("comprador");
  },
  offPlan() {
    reward("fuera");
    unlockBadge("sincero");
    checkChallenge();
  },
  articleRead(id) {
    const entry = dailyEntry();
    entry.read = (entry.read || 0) + 1;
    const read = new Set(state.counters.articles || []);
    if (!read.has(id)) {
      read.add(id);
      state.counters.articles = [...read];
      reward("informe");
      if (read.size >= 3) unlockBadge("lector");
    }
    saveState();
    checkChallenge();
  },
  swapped() {
    const entry = dailyEntry();
    entry.swaps = (entry.swaps || 0) + 1;
    if (entry.swaps <= 3) reward("cambio"); // como mucho 3 cambios con puntos al día
    if (bumpCounter("swaps") >= 3) unlockBadge("explorador");
    checkChallenge();
  },
};

// ---------- Tour de bienvenida (primera vez) ----------

const TOUR_SLIDES = [
  { art: ["🥗", "🍗", "🥑", "🍳"], title: "Tu plan de comidas, hecho para ti", text: "Según tu cuerpo, tu deporte y tu objetivo: perder grasa, mantenerte o ganar músculo." },
  { art: ["🛒", "💸", "📍", "🧾"], title: "La compra más barata, cerca de ti", text: "Tu lista lista para llevar, con lo que cuesta en los súper de tu zona." },
  { art: ["🔄", "🍕", "⚖️", "📈"], title: "Se adapta a tu vida", text: "¿Comiste fuera? Reajustamos tu semana. ¿Tu peso no se mueve? Ajustamos tus calorías." },
];

function showTour() {
  const el = document.createElement("div");
  el.id = "tour";
  el.innerHTML = `
    <button type="button" class="tour-skip" id="tour-skip">Saltar</button>
    <div class="tour-track" id="tour-track">
      ${TOUR_SLIDES.map((s, i) => `
        <section class="tour-slide" data-i="${i}">
          <div class="tour-art">
            <span class="tour-main">${s.art[0]}</span>
            ${s.art.slice(1).map((e, k) => `<span class="tour-orbit o${k}">${e}</span>`).join("")}
          </div>
          <h2>${s.title}</h2>
          <p>${s.text}</p>
        </section>`).join("")}
    </div>
    <div class="tour-dots">${TOUR_SLIDES.map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("")}</div>
    <button type="button" class="btn block tour-next" id="tour-next">Siguiente</button>
    <p class="tour-free">Gratis · sin registro · 1 minuto</p>
  `;
  document.getElementById("app-shell").appendChild(el);
  track("tour-visto");

  const slider = el.querySelector("#tour-track");
  const next = el.querySelector("#tour-next");
  let current = 0;
  const finish = (how) => {
    state.tourSeen = true;
    saveState();
    track(`tour-${how}`);
    el.classList.add("hide");
    setTimeout(() => el.remove(), 450);
  };
  const go = (i) => slider.scrollTo({ left: i * slider.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  slider.addEventListener("scroll", () => {
    const i = Math.round(slider.scrollLeft / slider.clientWidth);
    if (i === current) return;
    current = i;
    el.querySelectorAll(".tour-dots i").forEach((d, k) => d.classList.toggle("on", k === i));
    el.querySelectorAll(".tour-slide").forEach((s, k) => s.classList.toggle("active", k === i));
    next.textContent = i === TOUR_SLIDES.length - 1 ? "Crear mi plan gratis" : "Siguiente";
    buzz(6);
  });
  el.querySelector(".tour-slide").classList.add("active");
  next.addEventListener("click", () => (current < TOUR_SLIDES.length - 1 ? go(current + 1) : finish("completo")));
  el.querySelector("#tour-skip").addEventListener("click", () => finish("saltado"));
}

// ---------- "Creando tu plan" ----------

function showPlanReveal(onDone) {
  const targets = currentTargets();
  const { grandTotal } = storeShoppingList();
  const meals = DAYS.length * MEAL_SLOTS.length;
  const steps = [
    { emoji: "🔥", text: "Calculando tus calorías", value: `${targets.calories} kcal/día` },
    { emoji: "🍗", text: "Repartiendo tus macros", value: `${targets.protein} g proteína` },
    { emoji: "🍽️", text: "Eligiendo tus comidas", value: `${meals} platos` },
    { emoji: "🛒", text: "Preparando tu compra", value: `${grandTotal.toFixed(2)} €` },
  ];
  const el = document.createElement("div");
  el.id = "plan-reveal";
  el.innerHTML = `
    <div class="reveal-spinner"><span>🥗</span></div>
    <h2 class="reveal-title">Creando tu plan…</h2>
    <div class="reveal-steps">
      ${steps.map((s, i) => `
        <div class="reveal-step" data-i="${i}">
          <span class="reveal-icon">${s.emoji}</span>
          <span class="reveal-text">${s.text}</span>
          <span class="reveal-value">${s.value}</span>
          <span class="reveal-check">✓</span>
        </div>`).join("")}
    </div>
    <button type="button" class="btn block reveal-go hidden" id="reveal-go">Ver mi plan →</button>
  `;
  document.getElementById("app-shell").appendChild(el);
  const stepMs = prefersReducedMotion() ? 120 : 650;
  steps.forEach((_, i) => {
    setTimeout(() => el.querySelector(`.reveal-step[data-i="${i}"]`).classList.add("on"), 250 + i * stepMs);
    setTimeout(() => { el.querySelector(`.reveal-step[data-i="${i}"]`).classList.add("done"); buzz(8); }, 250 + i * stepMs + stepMs * 0.8);
  });
  setTimeout(() => {
    el.classList.add("ready");
    el.querySelector(".reveal-title").textContent = "¡Tu plan está listo! 🎉";
    el.querySelector("#reveal-go").classList.remove("hidden");
    burstConfetti();
  }, 250 + steps.length * stepMs + 200);
  el.querySelector("#reveal-go").addEventListener("click", () => {
    el.classList.add("hide");
    onDone();
    setTimeout(() => el.remove(), 450);
  });
}
