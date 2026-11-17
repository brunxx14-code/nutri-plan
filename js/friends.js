/* Retos de 30 días con amigos.

   Eliges un hábito (nunca un peso: los retos de kilos empujan a hacer
   locuras), invitas a tus amigos con un enlace y cada uno marca sus días.
   Para ver cómo van los demás, cada uno envía su progreso con otro enlace.

   No hay cuentas ni servidor: el reto viaja dentro del enlace y el progreso
   de tus amigos se guarda en tu móvil cuando abres el suyo. Así no sale
   ningún dato de salud del dispositivo, solo el nombre que elijas y cuántos
   días llevas.

   Por qué 30 días y en grupo: repetir un hábito a diario lo vuelve más
   automático con las semanas (Lally et al., 2010), y hacerlo con apoyo
   social mejora la adherencia en programas de alimentación y actividad
   (Wing y Jeffery, 1999). No hace falta una racha perfecta: cuentan los días
   cumplidos, no los seguidos. */

const CHALLENGE_DAYS = 30;
const CHALLENGE_PARAM = "reto";
const FRIEND_CHALLENGES = {
  plan:   { emoji: "🍽️", name: "3 comidas del plan al día", auto: true, how: "Se marca solo cuando haces 3 comidas del plan." },
  agua:   { emoji: "💧", name: "Llega a tu agua cada día", auto: true, how: "Se marca solo cuando llegas a tus vasos de agua." },
  casa:   { emoji: "🏠", name: "Cocina en casa", auto: true, how: "Se marca solo los días que no apuntas comidas fuera del plan y haces al menos una del plan." },
  verdura:{ emoji: "🥦", name: "Verdura en comida y cena", auto: false, how: "Márcalo tú cada día que lo cumplas." },
  fruta:  { emoji: "🍎", name: "2 piezas de fruta al día", auto: false, how: "Márcalo tú cada día que lo cumplas." },
  paseo:  { emoji: "🚶", name: "Paseo de 20 minutos", auto: false, how: "Márcalo tú cada día que lo cumplas." },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function encodePayload(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePayload(str) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/")))));
  } catch (e) {
    return null;
  }
}

function cleanName(s) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, 20);
}

function activeChallenge() {
  return state.friendChallenge || null;
}

function challengeDates(ch) {
  const start = new Date(`${ch.start}T12:00:00`);
  return Array.from({ length: CHALLENGE_DAYS }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return isoDate(d);
  });
}

function challengeDayDone(ch, iso) {
  const type = FRIEND_CHALLENGES[ch.type];
  if (!type.auto) return !!(ch.done && ch.done[iso]);
  const entry = state.daily[iso];
  if (!entry) return false;
  if (ch.type === "plan") return mealsDone(entry) >= 3;
  if (ch.type === "agua") return (entry.water || 0) >= waterGoalGlasses();
  if (ch.type === "casa") return mealsDone(entry) >= 1 && !(entry.offPlan && Object.keys(entry.offPlan).length);
  return false;
}

function challengeProgress(ch) {
  const today = todayIso();
  const dates = challengeDates(ch);
  const done = dates.filter((iso) => iso <= today && challengeDayDone(ch, iso)).length;
  const dayNumber = Math.min(CHALLENGE_DAYS, dates.filter((iso) => iso <= today).length);
  return { dates, done, dayNumber, finished: today > dates[dates.length - 1], todayDone: challengeDayDone(ch, today) };
}

function challengeLink(ch, withProgress) {
  const payload = { i: ch.id, t: ch.type, s: ch.start, n: ch.name };
  if (withProgress) {
    const prog = challengeProgress(ch);
    payload.p = { n: ch.name, d: prog.done, at: todayIso() };
  }
  return `${location.origin}${location.pathname}?${CHALLENGE_PARAM}=${encodePayload(payload)}`;
}

async function shareChallenge(text, url) {
  try {
    if (navigator.share) {
      await navigator.share({ title: "NutriPlan", text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast("🔗 Enlace copiado: pégalo en tu grupo");
  } catch (e) { /* el usuario canceló */ }
}

/* ---------- Tarjeta del resumen ---------- */

function friendChallengeCardHtml() {
  const ch = activeChallenge();
  if (!ch) {
    return `
      <button type="button" class="fc-card empty" id="fc-card">
        <span class="fc-emoji" aria-hidden="true">🤝</span>
        <span class="fc-body"><b>Reto de 30 días con amigos</b><small>Elige un hábito, invita a tu gente y a ver quién aguanta</small></span>
        <span class="chevron-right" aria-hidden="true">›</span>
      </button>`;
  }
  const type = FRIEND_CHALLENGES[ch.type];
  const prog = challengeProgress(ch);
  const friends = Object.entries(ch.friends || {});
  return `
    <button type="button" class="fc-card" id="fc-card">
      <span class="fc-emoji" aria-hidden="true">${type.emoji}</span>
      <span class="fc-body">
        <b>${type.name}</b>
        <small>${prog.finished ? `Reto terminado: ${prog.done} de ${CHALLENGE_DAYS} días` : `Día ${prog.dayNumber} de ${CHALLENGE_DAYS} · ${prog.done} cumplidos · hoy ${prog.todayDone ? "✅" : "pendiente"}`}${friends.length ? ` · ${friends.length} ${friends.length === 1 ? "amigo" : "amigos"}` : ""}</small>
        <span class="fc-bar"><i style="width:${(prog.done / CHALLENGE_DAYS) * 100}%"></i></span>
      </span>
      <span class="chevron-right" aria-hidden="true">›</span>
    </button>`;
}

/* ---------- Hojas ---------- */

function openFriendChallengeSheet() {
  const ch = activeChallenge();
  if (!ch) return openNewChallengeSheet();
  track("reto-amigos-visto");
  const type = FRIEND_CHALLENGES[ch.type];
  const prog = challengeProgress(ch);
  const today = todayIso();
  const board = [
    { name: `${ch.name} (tú)`, d: prog.done, me: true },
    ...Object.entries(ch.friends || {}).map(([name, f]) => ({ name, d: f.d, at: f.at })),
  ].sort((a, b) => b.d - a.d);
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <span class="tag">🤝 Reto de 30 días</span>
    <h3>${type.emoji} ${type.name}</h3>
    <p class="hint">${type.how} Cuentan los días cumplidos, no hace falta que sean seguidos.</p>
    <div class="fc-grid">
      ${prog.dates.map((iso, i) => {
        const done = challengeDayDone(ch, iso);
        return `<span class="fc-day ${done ? "done" : ""} ${iso === today ? "today" : ""} ${iso > today ? "future" : ""}">${i + 1}</span>`;
      }).join("")}
    </div>
    ${!type.auto && !prog.finished ? `
      <button type="button" class="btn block ${prog.todayDone ? "secondary" : ""}" id="fc-today">${prog.todayDone ? "✅ Hoy cumplido (toca para desmarcar)" : "✔️ Hoy lo he cumplido"}</button>` : ""}
    <div class="sheet-section">
      <h4>🏆 Clasificación</h4>
      ${board.map((r, i) => `
        <div class="fc-row ${r.me ? "me" : ""}">
          <span class="fc-pos">${["🥇", "🥈", "🥉"][i] || i + 1}</span>
          <span class="fc-name">${escapeHtml(r.name)}${r.at ? `<small>actualizado el ${new Date(`${r.at}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</small>` : ""}</span>
          <b>${r.d}/${CHALLENGE_DAYS}</b>
        </div>`).join("")}
      ${board.length === 1 ? `<p class="hint">Aún no has recibido el progreso de nadie. Invita a tus amigos y pídeles que te manden el suyo.</p>` : ""}
    </div>
    <div class="fc-actions">
      <button type="button" class="btn secondary" id="fc-invite">📨 Invitar</button>
      <button type="button" class="btn" id="fc-progress">📣 Enviar mi progreso</button>
    </div>
    <p class="hint">🔒 Sin cuentas: solo se comparte tu nombre y cuántos días llevas. Tus amigos ven tu progreso cuando les mandas tu enlace.</p>
    <button type="button" class="btn ghost small block" id="fc-leave">${prog.finished ? "Empezar otro reto" : "Dejar el reto"}</button>
  `;
  const todayBtn = body.querySelector("#fc-today");
  if (todayBtn) todayBtn.addEventListener("click", () => {
    ch.done = ch.done || {};
    ch.done[today] = !ch.done[today];
    saveState();
    buzz(10);
    if (ch.done[today]) {
      track("reto-amigos-dia");
      showToast(`${type.emoji} ¡Un día más! Llevas ${challengeProgress(ch).done}`);
      if (challengeProgress(ch).done === CHALLENGE_DAYS) burstConfetti();
    }
    refreshFriendChallengeCard();
    openFriendChallengeSheet();
  });
  body.querySelector("#fc-invite").addEventListener("click", () => {
    track("reto-amigos-invitar");
    shareChallenge(`${ch.name} te reta a 30 días de "${type.name}" en NutriPlan. ¿Te apuntas?`, challengeLink(ch, true));
  });
  body.querySelector("#fc-progress").addEventListener("click", () => {
    track("reto-amigos-progreso");
    shareChallenge(`${type.emoji} Llevo ${prog.done} de ${CHALLENGE_DAYS} días en "${type.name}". Toca para verlo en tu NutriPlan:`, challengeLink(ch, true));
  });
  const leave = body.querySelector("#fc-leave");
  leave.addEventListener("click", () => {
    if (!prog.finished && !leave.classList.contains("armed")) {
      leave.classList.add("armed");
      leave.textContent = "Toca otra vez para dejarlo";
      return;
    }
    state.friendChallengesPast = [...(state.friendChallengesPast || []), { ...ch, result: prog.done }].slice(-10);
    state.friendChallenge = null;
    saveState();
    refreshFriendChallengeCard();
    openNewChallengeSheet();
  });
  if (document.getElementById("recipe-sheet").classList.contains("hidden")) openSheet();
}

function openNewChallengeSheet(selected) {
  track("reto-amigos-nuevo");
  const body = document.getElementById("sheet-body");
  const lastName = (state.friendChallengesPast || []).map((c) => c.name).pop() || state.challengeName || "";
  body.innerHTML = `
    <h3>🤝 Reto de 30 días con amigos</h3>
    <p class="hint">Elige un hábito, invita a quien quieras y comparad cómo vais. Son hábitos, nunca kilos.</p>
    <div class="fc-types">
      ${Object.entries(FRIEND_CHALLENGES).map(([key, t]) => `
        <button type="button" class="fc-type ${key === selected ? "on" : ""}" data-type="${key}">
          <span aria-hidden="true">${t.emoji}</span><b>${t.name}</b><small>${t.auto ? "Se marca solo" : "Lo marcas tú"}</small>
        </button>`).join("")}
    </div>
    <label class="fc-name-field">Tu nombre en el reto
      <input type="text" id="fc-name" maxlength="20" placeholder="p. ej. Alex" value="${escapeHtml(lastName)}" autocomplete="nickname">
    </label>
    <button type="button" class="btn block" id="fc-start" ${selected ? "" : "disabled"}>Empezar hoy</button>
  `;
  body.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => {
    const name = body.querySelector("#fc-name").value;
    openNewChallengeSheet(b.dataset.type);
    body.querySelector("#fc-name").value = name;
  }));
  body.querySelector("#fc-start").addEventListener("click", () => {
    const name = cleanName(body.querySelector("#fc-name").value);
    if (!name) { body.querySelector("#fc-name").focus(); showToast("Pon un nombre para que tus amigos te reconozcan"); return; }
    state.challengeName = name;
    state.friendChallenge = { id: Math.random().toString(36).slice(2, 10), type: selected, start: todayIso(), name, done: {}, friends: {} };
    saveState();
    track(`reto-amigos-empieza-${selected}`);
    refreshFriendChallengeCard();
    openFriendChallengeSheet();
  });
  if (document.getElementById("recipe-sheet").classList.contains("hidden")) openSheet();
}

/* Al abrir un enlace de reto: unirse o actualizar el progreso de un amigo. */
function openInviteSheet(payload) {
  const type = FRIEND_CHALLENGES[payload.t];
  const ch = activeChallenge();
  const body = document.getElementById("sheet-body");
  const from = escapeHtml(cleanName(payload.n));
  const already = ch && ch.id === payload.i;
  if (already) {
    if (payload.p && cleanName(payload.p.n) !== ch.name) {
      ch.friends = ch.friends || {};
      ch.friends[cleanName(payload.p.n)] = { d: Math.max(0, Math.min(CHALLENGE_DAYS, Number(payload.p.d) || 0)), at: String(payload.p.at || todayIso()).slice(0, 10) };
      saveState();
      track("reto-amigos-progreso-recibido");
      const d = ch.friends[cleanName(payload.p.n)].d;
      showToast(`📣 ${cleanName(payload.p.n)} lleva ${d} ${d === 1 ? "día" : "días"}`);
    }
    refreshFriendChallengeCard();
    openFriendChallengeSheet();
    return;
  }
  body.innerHTML = `
    <span class="tag">🤝 Te han retado</span>
    <h3>${type.emoji} ${type.name}</h3>
    <p><b>${from}</b> te reta a 30 días de este hábito. ${type.how}</p>
    ${ch ? `<p class="hint">⚠️ Ya estás en otro reto. Si te unes a este, el actual se guarda como terminado.</p>` : ""}
    <label class="fc-name-field">Tu nombre en el reto
      <input type="text" id="fc-name" maxlength="20" placeholder="p. ej. Alex" value="${escapeHtml(state.challengeName || "")}" autocomplete="nickname">
    </label>
    <button type="button" class="btn block" id="fc-join">🤝 Me apunto</button>
    <button type="button" class="btn ghost block" id="fc-no">Ahora no</button>
  `;
  body.querySelector("#fc-join").addEventListener("click", () => {
    const name = cleanName(body.querySelector("#fc-name").value);
    if (!name) { body.querySelector("#fc-name").focus(); showToast("Pon un nombre para que te reconozcan"); return; }
    if (ch) state.friendChallengesPast = [...(state.friendChallengesPast || []), { ...ch, result: challengeProgress(ch).done }].slice(-10);
    state.challengeName = name;
    const friends = {};
    if (payload.p && cleanName(payload.p.n) !== name) friends[cleanName(payload.p.n)] = { d: Math.max(0, Math.min(CHALLENGE_DAYS, Number(payload.p.d) || 0)), at: String(payload.p.at || todayIso()).slice(0, 10) };
    state.friendChallenge = { id: String(payload.i).slice(0, 12), type: payload.t, start: String(payload.s).slice(0, 10), name, done: {}, friends };
    saveState();
    track("reto-amigos-unido");
    refreshFriendChallengeCard();
    openFriendChallengeSheet();
    showToast(`🤝 ¡Dentro! Cuéntaselo a ${cleanName(payload.n)} con "Enviar mi progreso"`);
  });
  body.querySelector("#fc-no").addEventListener("click", closeSheet);
  openSheet();
}

function readChallengeFromUrl() {
  const params = new URLSearchParams(location.search);
  const raw = params.get(CHALLENGE_PARAM);
  if (!raw) return null;
  params.delete(CHALLENGE_PARAM);
  const rest = params.toString();
  history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
  const p = decodePayload(raw);
  if (!p || !FRIEND_CHALLENGES[p.t] || !/^\d{4}-\d{2}-\d{2}$/.test(p.s) || !p.i) return null;
  return p;
}

function refreshFriendChallengeCard() {
  const card = document.getElementById("fc-card");
  if (!card) return;
  card.outerHTML = friendChallengeCardHtml();
  document.getElementById("fc-card").addEventListener("click", openFriendChallengeSheet);
}

const FRIENDS_CSS = `
.fc-card { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 14px; margin: 0 0 14px; border: 0; border-radius: var(--radius-lg); background: var(--card); box-shadow: var(--shadow-card); color: var(--ink); font: inherit; cursor: pointer; }
.fc-card:active { transform: scale(.985); }
.fc-emoji { font-size: 26px; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; background: var(--green-light); flex: none; }
.fc-body { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.fc-body b { font-size: 15px; }
.fc-body small { color: var(--muted); font-size: 12.5px; line-height: 1.35; }
.fc-bar { display: block; height: 6px; border-radius: 999px; background: var(--border); overflow: hidden; margin-top: 2px; }
.fc-bar i { display: block; height: 100%; background: var(--green); border-radius: inherit; transition: width .4s; }
.fc-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; margin: 14px 0; }
.fc-day { aspect-ratio: 1; display: grid; place-items: center; border-radius: 8px; background: var(--bg); color: var(--muted); font-size: 11.5px; font-weight: 700; }
.fc-day.done { background: var(--green); color: #fff; }
.fc-day.today { outline: 2px solid var(--coral); outline-offset: 1px; }
.fc-day.future { opacity: .45; }
.fc-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
.fc-row.me { font-weight: 700; }
.fc-pos { width: 26px; text-align: center; }
.fc-name { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
.fc-name small { color: var(--muted); font-size: 11.5px; font-weight: 500; }
.fc-actions { display: flex; gap: 8px; margin-top: 16px; }
.fc-actions .btn { flex: 1; }
#fc-leave { margin-top: 10px; width: 100%; }
#fc-leave.armed { color: var(--red); border-color: var(--red); }
.fc-types { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
.fc-type { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--card); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.fc-type span { font-size: 22px; }
.fc-type b { font-size: 13.5px; line-height: 1.3; }
.fc-type small { color: var(--muted); font-size: 11.5px; }
.fc-type.on { border-color: var(--coral); background: var(--coral-light); }
.fc-name-field { margin: 6px 0 14px; }
#fc-start[disabled] { opacity: .5; }
#fc-no { margin-top: 8px; }
`;

(function installFriendChallenges() {
  const style = document.createElement("style");
  style.textContent = FRIENDS_CSS;
  document.head.appendChild(style);

  // Este archivo se carga después de app.js: se engancha al momento.
  const baseDashboard = renderDashboard;
  renderDashboard = function () {
    baseDashboard.apply(this, arguments);
    const el = document.getElementById("dashboard-content");
    const anchor = el.querySelector("#challenge-card") || el.querySelector("#today-card");
    if (anchor) anchor.insertAdjacentHTML("afterend", friendChallengeCardHtml());
    else el.insertAdjacentHTML("beforeend", friendChallengeCardHtml());
    document.getElementById("fc-card").addEventListener("click", openFriendChallengeSheet);
    if (state.pendingChallenge && state.profile) {
      const p = state.pendingChallenge;
      state.pendingChallenge = null;
      saveState();
      setTimeout(() => openInviteSheet(p), 1200);
    }
  };

  // Este listener va después del de app.js: el perfil ya está cargado.
  document.addEventListener("DOMContentLoaded", () => {
    const payload = readChallengeFromUrl();
    if (!payload) return;
    track("reto-amigos-enlace");
    if (state.profile && state.plan) setTimeout(() => openInviteSheet(payload), 900);
    else { state.pendingChallenge = payload; saveState(); } // se abre al terminar el formulario
  });
})();
