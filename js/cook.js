/* Modo cocina: la receta paso a paso a pantalla completa, con letra grande,
   temporizadores sacados del propio texto ("cocina 8-10 minutos") y la
   pantalla encendida mientras cocinas. */

let cook = null; // { recipe, dayIdx, slotKey, factor, idx, timers, tick, wake }

/* "8-10 minutos" -> 10; "3 min" -> 3. Se queda con el número mayor. */
function stepMinutes(text) {
  const m = text.match(/(\d+)(?:\s*[-–a]\s*(\d+))?\s*(?:minutos?|minutes?|mins?)\b/i);
  if (!m) return 0;
  return Number(m[2] || m[1]);
}

function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function timerLeft(t) {
  return t.running ? t.end - Date.now() : t.left;
}

// ---------- Aviso al terminar un temporizador ----------

let cookAudio = null;

function beep() {
  try {
    cookAudio = cookAudio || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((delay) => {
      const osc = cookAudio.createOscillator();
      const gain = cookAudio.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(cookAudio.destination);
      const t0 = cookAudio.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  } catch (e) { /* sin sonido */ }
}

async function keepScreenOn() {
  try {
    if (navigator.wakeLock && cook) cook.wake = await navigator.wakeLock.request("screen");
  } catch (e) { /* el navegador no lo permite */ }
}

function onCookVisibility() {
  if (cook && document.visibilityState === "visible") keepScreenOn();
}

// ---------- Abrir y cerrar ----------

function openCookMode(dayIdx, slotKey) {
  const info = getRecipeInfo(state.plan[dayIdx][slotKey]);
  cook = {
    recipe: info.recipe, dayIdx, slotKey, factor: dayFactor(dayIdx),
    idx: 0, timers: {}, got: new Set(), tick: null, wake: null, title: document.title,
    opener: document.activeElement, // al salir, el foco vuelve aquí
  };
  track("modo-cocina");
  const el = document.createElement("div");
  el.className = "cook";
  el.id = "cook";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Modo cocina");
  el.setAttribute("aria-modal", "true");
  el.innerHTML = `
    <div class="cook-top">
      <button type="button" class="cook-close" id="cook-close" aria-label="Cerrar">✕</button>
      <div class="cook-title">👩‍🍳 ${cook.recipe.name}</div>
    </div>
    <div class="cook-dots" id="cook-dots" role="group" aria-label="Pasos"></div>
    <div class="cook-stage" id="cook-stage"></div>
    <div class="cook-nav">
      <button type="button" class="btn ghost" id="cook-prev">← Anterior</button>
      <button type="button" class="btn" id="cook-next">Siguiente →</button>
    </div>`;
  document.getElementById("app-shell").appendChild(el);
  requestAnimationFrame(() => el.classList.add("open"));

  el.querySelector("#cook-close").addEventListener("click", closeCookMode);
  el.querySelector("#cook-prev").addEventListener("click", () => goCookStep(cook.idx - 1));
  el.querySelector("#cook-next").addEventListener("click", () => {
    if (cook.idx < totalCookSteps() - 1) goCookStep(cook.idx + 1);
    else finishCooking();
  });
  bindCookSwipe(el.querySelector("#cook-stage"));
  document.addEventListener("visibilitychange", onCookVisibility);
  document.addEventListener("keydown", onCookKey);
  keepScreenOn();
  cook.tick = setInterval(tickCookTimers, 250);
  renderCookStep(0);
  try { el.querySelector("#cook-next").focus({ preventScroll: true }); } catch (e) { /* sin foco */ }
}

function closeCookMode() {
  if (!cook) return;
  clearInterval(cook.tick);
  if (cook.wake) cook.wake.release().catch(() => {});
  document.removeEventListener("visibilitychange", onCookVisibility);
  document.removeEventListener("keydown", onCookKey);
  const el = document.getElementById("cook");
  const opener = cook.opener;
  document.title = cook.title;
  cook = null;
  // el foco vuelve al botón que abrió el modo cocina, si sigue en pantalla
  if (opener && opener.isConnected && opener.offsetParent) {
    try { opener.focus({ preventScroll: true }); } catch (e) { /* sin foco */ }
  }
  if (!el) return;
  el.classList.remove("open");
  setTimeout(() => el.remove(), 280);
}

// ---------- Pasos ----------

/* El paso 0 es reunir los ingredientes; luego van los pasos de la receta. */
function totalCookSteps() {
  return cook.recipe.steps.length + 1;
}

function goCookStep(idx) {
  if (!cook || idx < 0 || idx >= totalCookSteps() || idx === cook.idx) return;
  const dir = idx > cook.idx ? "fwd" : "back";
  buzz(6);
  renderCookStep(idx, dir);
}

function renderCookDots() {
  const dots = document.getElementById("cook-dots");
  dots.innerHTML = Array.from({ length: totalCookSteps() }, (_, i) => {
    const t = cook.timers[i];
    const cls = [i === cook.idx ? "now" : "", i < cook.idx ? "done" : "", t && t.running ? "timing" : ""].join(" ");
    // el punto del paso actual lo anuncia el lector de pantalla («paso actual»)
    return `<button type="button" class="cook-dot ${cls}" data-step="${i}" aria-label="${i === 0 ? "Ingredientes" : `Paso ${i}`}"${i === cook.idx ? ` aria-current="step"` : ""}></button>`;
  }).join("");
  dots.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => goCookStep(Number(b.dataset.step))));
}

function renderCookStep(idx, dir = "fwd") {
  cook.idx = idx;
  const stage = document.getElementById("cook-stage");
  const total = cook.recipe.steps.length;
  let html;
  if (idx === 0) {
    html = `
      <div class="cook-kicker">Antes de empezar</div>
      <h2 class="cook-step-text small">Prepara los ingredientes</h2>
      <div class="cook-ings">
        ${cook.recipe.ingredients.map(([id, qty], i) => {
          const food = FOODS[id];
          // lo que ya marcaste sigue marcado si vuelves a este paso
          const got = cook.got.has(i);
          return `
            <label class="cook-ing${got ? " got" : ""}">
              <input type="checkbox" data-ing="${i}"${got ? " checked" : ""}>
              <span class="cook-ing-emoji" aria-hidden="true">${FOOD_EMOJI[id] || FOOD_ROLE_EMOJI[food.cat] || "•"}</span>
              <span class="cook-ing-name">${food.name}</span>
              <span class="cook-ing-qty">${formatQty(qty * cook.factor, food.unit)}</span>
            </label>`;
        }).join("")}
      </div>`;
  } else {
    const text = cook.recipe.steps[idx - 1];
    const mins = stepMinutes(text);
    html = `
      <div class="cook-kicker">Paso ${idx} de ${total}</div>
      <h2 class="cook-step-text">${text}</h2>
      ${mins ? `<div class="cook-timer" id="cook-timer" data-mins="${mins}"></div>` : ""}`;
  }
  stage.innerHTML = `<div class="cook-card cook-in-${dir}">${html}</div>`;
  stage.scrollTop = 0;
  stage.querySelectorAll(".cook-ing input").forEach((box) => {
    box.addEventListener("change", () => {
      box.closest(".cook-ing").classList.toggle("got", box.checked);
      cook.got[box.checked ? "add" : "delete"](Number(box.dataset.ing));
      buzz(6);
    });
  });
  renderCookTimer();
  renderCookDots();

  const prev = document.getElementById("cook-prev");
  const next = document.getElementById("cook-next");
  prev.disabled = idx === 0;
  next.textContent = idx === 0 ? "Empezar →" : idx === total ? "✅ ¡Listo!" : "Siguiente →";
  next.classList.toggle("done", idx === total);
}

// ---------- Temporizadores ----------

function renderCookTimer() {
  const box = document.getElementById("cook-timer");
  if (!box) return;
  const mins = Number(box.dataset.mins);
  const t = cook.timers[cook.idx];
  if (!t) {
    box.innerHTML = `<button type="button" class="cook-timer-start" id="cook-timer-start">⏱️ Iniciar ${mins} min</button>`;
    box.querySelector("#cook-timer-start").addEventListener("click", () => {
      cook.timers[cook.idx] = { total: mins * 60000, end: Date.now() + mins * 60000, running: true, left: 0, rang: false };
      buzz(10);
      track("temporizador");
      // el primer toque desbloquea el audio en iOS
      try { cookAudio = cookAudio || new (window.AudioContext || window.webkitAudioContext)(); cookAudio.resume(); } catch (e) { /* sin audio */ }
      renderCookTimer();
      renderCookDots();
    });
    return;
  }
  const R = 70, C = 2 * Math.PI * R;
  box.innerHTML = `
    <div class="cook-ring ${t.rang ? "rang" : ""}">
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r="${R}" class="cook-ring-bg"/>
        <circle cx="80" cy="80" r="${R}" class="cook-ring-fg" id="cook-ring-fg" stroke-dasharray="${C}" stroke-dashoffset="0"/>
      </svg>
      <div class="cook-clock" id="cook-clock">${t.rang ? "⏰" : formatClock(timerLeft(t))}</div>
    </div>
    <div class="cook-timer-btns">
      ${t.rang ? "" : `<button type="button" class="chip-btn" id="cook-timer-toggle">${t.running ? "⏸️ Pausar" : "▶️ Seguir"}</button>`}
      <button type="button" class="chip-btn" id="cook-timer-reset">↺ Reiniciar</button>
    </div>`;
  const toggle = box.querySelector("#cook-timer-toggle");
  if (toggle) toggle.addEventListener("click", () => {
    if (t.running) { t.left = t.end - Date.now(); t.running = false; }
    else { t.end = Date.now() + t.left; t.running = true; }
    renderCookTimer();
    renderCookDots();
  });
  box.querySelector("#cook-timer-reset").addEventListener("click", () => {
    delete cook.timers[cook.idx];
    renderCookTimer();
    renderCookDots();
  });
  updateCookRing();
}

function updateCookRing() {
  const t = cook.timers[cook.idx];
  const fg = document.getElementById("cook-ring-fg");
  const clock = document.getElementById("cook-clock");
  if (!t || !fg || !clock) return;
  const C = 2 * Math.PI * 70;
  const frac = t.rang ? 0 : 1 - timerLeft(t) / t.total;
  fg.setAttribute("stroke-dashoffset", String(-C * frac));
  const label = t.rang ? "⏰" : formatClock(timerLeft(t));
  if (clock.textContent !== label) clock.textContent = label;
}

function tickCookTimers() {
  if (!cook) return;
  for (const [i, t] of Object.entries(cook.timers)) {
    if (!t.running || t.end > Date.now()) continue;
    t.running = false;
    t.left = 0;
    t.rang = true;
    t.rangAt = Date.now();
    beep();
    if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 250]);
    showToast(`⏰ ¡Tiempo! Paso ${i} listo`);
    if (Number(i) === cook.idx) renderCookTimer();
    renderCookDots();
  }
  updateCookRing();
  updateCookTitle();
}

/* El temporizador también se ve en la pestaña del navegador, por si cambias
   de pestaña o de app mientras se cuece algo: «⏱️ 4:32 · NutriPlan». Al
   sonar pone «⏰» durante un minuto. */
function updateCookTitle() {
  const timers = Object.values(cook.timers);
  const running = timers.filter((t) => t.running);
  let title = cook.title;
  if (running.length) {
    title = `⏱️ ${formatClock(Math.min(...running.map(timerLeft)))} · ${cook.title}`;
  } else if (timers.some((t) => t.rang && Date.now() - t.rangAt < 60000)) {
    title = `⏰ ${cook.title}`;
  }
  if (document.title !== title) document.title = title;
}

// ---------- Gestos y final ----------

/* Con teclado (o un mando bluetooth): flechas para pasar de paso, Esc para salir. */
function onCookKey(e) {
  if (!cook || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target && e.target.closest && e.target.closest("input, textarea, select")) return;
  if (e.key === "ArrowRight" || e.key === "PageDown") {
    e.preventDefault();
    if (cook.idx < totalCookSteps() - 1) goCookStep(cook.idx + 1);
  } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
    e.preventDefault();
    goCookStep(cook.idx - 1);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeCookMode();
  } else if (e.key === "Tab") {
    // Tab da la vuelta dentro del modo cocina, que tapa toda la pantalla
    const box = document.getElementById("cook");
    const items = [...box.querySelectorAll("button, [tabindex]:not([tabindex='-1'])")].filter((b) => !b.disabled && b.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const inside = box.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
  }
}

function bindCookSwipe(stage) {
  let x0 = null, y0 = 0;
  stage.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goCookStep(cook.idx + (dx < 0 ? 1 : -1));
  });
}

function finishCooking() {
  const { dayIdx, slotKey } = cook;
  const isToday = dayIdx === todayPlanIndex();
  const entry = state.daily[todayIso()];
  const alreadyEaten = entry && entry.eaten && entry.eaten[slotKey];
  track("receta-cocinada");
  closeCookMode();
  closeSheet();
  if (isToday && !alreadyEaten) {
    showView("dashboard");
    setTimeout(() => {
      const btn = document.querySelector(`[data-eat="${slotKey}"]`);
      if (btn) btn.click();
    }, 350);
  } else {
    burstConfetti();
    showToast("👩‍🍳 ¡Buen provecho!");
  }
}
