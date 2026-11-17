/* Resumen de la semana para compartir e invitar a amigos: la forma más
   directa de que la app llegue a nuevos clientes. */

const APP_URL = `${location.origin}${location.pathname}`;
const DAY_INITIALS_ES = ["L", "M", "X", "J", "V", "S", "D"];

function dayInitial(i) {
  return currentLang === "es" ? DAY_INITIALS_ES[i] : tr(DAYS[i]).charAt(0);
}

function weekRecap() {
  const dates = weekDates();
  const today = todayPlanIndex();
  const days = dates.map((iso, i) => {
    const entry = state.daily[iso];
    const done = mealsDone(entry);
    return { i, done, onPlan: done >= MEALS_FOR_STREAK, future: i > today };
  });
  const past = days.filter((d) => !d.future);
  const log = state.weightLog;
  return {
    days,
    daysOnPlan: past.filter((d) => d.onPlan).length,
    daysSoFar: past.length,
    meals: past.reduce((n, d) => n + d.done, 0),
    water: dates.slice(0, today + 1).reduce((n, iso) => n + ((state.daily[iso] && state.daily[iso].water) || 0), 0),
    streak: currentStreak(),
    weightChange: log.length > 1 ? log[log.length - 1].kg - log[0].kg : null,
    level: levelFor(state.xp),
  };
}

function recapCardHtml() {
  const r = weekRecap();
  return `
    <div class="recap-card" id="recap-card">
      <div class="recap-head">
        <span class="recap-kicker">📊 Tu semana</span>
        <span class="recap-score"><b>${r.daysOnPlan}</b>/${r.daysSoFar} días cumplidos</span>
      </div>
      <div class="recap-days">
        ${r.days.map((d) => `
          <div class="recap-day ${d.onPlan ? "on" : ""} ${d.future ? "future" : ""}" style="animation-delay:${d.i * 0.05}s">
            <span class="recap-dot">${d.onPlan ? "✓" : d.future ? "" : d.done || ""}</span>
            <span class="recap-letter">${dayInitial(d.i)}</span>
          </div>`).join("")}
      </div>
      <div class="recap-stats">
        <div><b>${r.meals}</b><span>🍽️ comidas</span></div>
        <div><b>${r.water}</b><span>💧 vasos</span></div>
        <div><b>${r.streak}</b><span>🔥 racha</span></div>
        <div><b>${r.level.level.emoji} ${r.level.idx + 1}</b><span>⭐ nivel</span></div>
      </div>
      <div class="recap-actions">
        <button type="button" class="btn block" id="share-recap">📤 Compartir mi semana</button>
        <button type="button" class="btn ghost block" id="invite-friend">🎁 Invitar a un amigo</button>
      </div>
    </div>`;
}

function bindRecapCard(root) {
  const share = root.querySelector("#share-recap");
  if (share) share.addEventListener("click", () => shareRecap(share));
  const invite = root.querySelector("#invite-friend");
  if (invite) invite.addEventListener("click", inviteFriend);
}

// ---------- Imagen para compartir ----------

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Dibuja la tarjeta de la semana en formato historia (1080×1350). */
function drawRecapImage() {
  const r = weekRecap();
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const font = (weight, size) => `${weight} ${size}px "Plus Jakarta Sans", system-ui, sans-serif`;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#c2452a");
  bg.addColorStop(0.6, "#d9583a");
  bg.addColorStop(1, "#e8975a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.beginPath(); ctx.arc(W - 80, 140, 260, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(60, H - 120, 220, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.font = font(800, 44);
  ctx.fillText("🥗 NutriPlan", 80, 130);
  ctx.font = font(800, 92);
  ctx.fillText(tr("Mi semana"), 80, 270);
  ctx.font = font(600, 44);
  ctx.globalAlpha = 0.9;
  ctx.fillText(tr(`${r.daysOnPlan} de ${r.daysSoFar} días cumpliendo mi plan`), 80, 345);
  ctx.globalAlpha = 1;

  // los 7 días
  const size = 112, gap = (W - 160 - size * 7) / 6;
  r.days.forEach((d, i) => {
    const x = 80 + i * (size + gap);
    const y = 420;
    ctx.fillStyle = d.onPlan ? "#ffffff" : "rgba(255,255,255,.22)";
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = d.onPlan ? "#c2452a" : "#fff";
    ctx.font = font(800, 48);
    ctx.fillText(d.onPlan ? "✓" : "", x + size / 2, y + size / 2 + 17);
    ctx.fillStyle = "#fff";
    ctx.font = font(700, 34);
    ctx.fillText(dayInitial(i), x + size / 2, y + size + 52);
  });

  // estadísticas
  const stats = [
    ["🍽️", r.meals, tr("comidas")],
    ["💧", r.water, tr("vasos de agua")],
    ["🔥", r.streak, tr("días de racha")],
    [r.level.level.emoji, tr(`Nivel ${r.level.idx + 1}`), tr(r.level.level.name)],
  ];
  stats.forEach(([emoji, value, label], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 80 + col * 470, y = 690 + row * 250, w = 440, h = 220;
    ctx.fillStyle = "rgba(255,255,255,.16)";
    roundRect(ctx, x, y, w, h, 40);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = font(400, 60);
    ctx.fillText(emoji, x + 36, y + 90);
    ctx.font = font(800, 64);
    ctx.fillText(String(value), x + 130, y + 95);
    ctx.font = font(600, 34);
    ctx.globalAlpha = 0.9;
    ctx.fillText(label, x + 36, y + 170);
    ctx.globalAlpha = 1;
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = font(700, 36);
  ctx.fillText(tr("Crea tu plan gratis en"), W / 2, H - 110);
  ctx.font = font(800, 38);
  ctx.fillText(APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, ""), W / 2, H - 60);
  return canvas;
}

/* Comparte una imagen dibujada en un canvas; si el móvil no deja compartir
   archivos, la descarga para que la suban ellos. */
async function shareCanvas(btn, draw, filename, text) {
  if (btn) btn.disabled = true;
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = draw();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: `${text} ${inviteUrl()}` });
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      showToast("🖼️ Imagen guardada, ¡compártela!");
    }
  } catch (e) {
    if (!e || e.name !== "AbortError") showToast("No se pudo compartir ahora");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function shareRecap(btn) {
  track("compartir-semana");
  await shareCanvas(btn, drawRecapImage, "mi-semana-nutriplan.png", tr("Mi semana con NutriPlan 💪 Crea tu plan gratis:"));
}

// ---------- Logro para compartir ----------

function drawBadgeImage(badge) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const font = (weight, size) => `${weight} ${size}px "Plus Jakarta Sans", system-ui, sans-serif`;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#93690f");
  bg.addColorStop(0.55, "#c08a28");
  bg.addColorStop(1, "#e0b45c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,.1)";
  ctx.beginPath(); ctx.arc(W / 2, 600, 330, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.font = font(800, 44);
  ctx.fillText("🥗 NutriPlan", 80, 130);
  ctx.textAlign = "center";
  ctx.font = font(700, 48);
  ctx.globalAlpha = 0.9;
  ctx.fillText(tr("¡Logro desbloqueado!"), W / 2, 260);
  ctx.globalAlpha = 1;
  ctx.font = font(400, 260);
  ctx.fillText(badge.emoji, W / 2, 690);
  ctx.font = font(800, 92);
  ctx.fillText(tr(badge.name), W / 2, 900);
  ctx.font = font(600, 44);
  ctx.globalAlpha = 0.9;
  ctx.fillText(tr(badge.desc), W / 2, 975);
  ctx.globalAlpha = 1;
  ctx.font = font(700, 36);
  ctx.fillText(tr("Crea tu plan gratis en"), W / 2, H - 110);
  ctx.font = font(800, 38);
  ctx.fillText(APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, ""), W / 2, H - 60);
  return canvas;
}

async function shareBadge(badge, btn) {
  track("compartir-logro");
  await shareCanvas(btn, () => drawBadgeImage(badge), `logro-${badge.id}-nutriplan.png`, tr(`He conseguido el logro «${badge.name}» en NutriPlan 🏅 Crea tu plan gratis:`));
}

// ---------- Invitar a amigos ----------

/* El enlace de invitación lleva tu nombre (si lo has puesto) para que tu
   amigo vea quién le invita al abrirlo: ?de=Ana */
const INVITE_PARAM = "de";
const INVITE_NAME_MAX = 24;

function cleanInviteName(name) {
  return String(name || "").replace(/[<>"'&]/g, "").replace(/\s+/g, " ").trim().slice(0, INVITE_NAME_MAX);
}

function inviteUrl() {
  const name = cleanInviteName(state.inviteName);
  return name ? `${APP_URL}?${INVITE_PARAM}=${encodeURIComponent(name)}` : APP_URL;
}

function invitesSent() {
  return (state.counters && state.counters.invites) || 0;
}

async function sendInvite() {
  track("invitar-amigo");
  const text = tr("Estoy usando NutriPlan: te hace un plan de comidas a tu medida y la lista de la compra con precios. Pruébala gratis:");
  const url = inviteUrl();
  let sent = false;
  try {
    if (navigator.share) {
      await navigator.share({ title: "NutriPlan", text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      showToast("🔗 Enlace copiado, ¡pégalo donde quieras!");
    }
    sent = true;
  } catch (e) {
    if (!e || e.name !== "AbortError") showToast(`🔗 ${url}`);
  }
  if (sent) {
    state.counters.invites = invitesSent() + 1;
    saveState();
    if (typeof unlockBadge === "function") unlockBadge("embajador");
  }
}

/* Hoja para invitar: tu nombre (opcional) y el enlace, por WhatsApp o donde quieras. */
function inviteFriend() {
  track("invitar-abierto");
  const body = document.getElementById("sheet-body");
  const n = invitesSent();
  body.innerHTML = `
    <span class="tag">🎁 Invitar</span>
    <h3>Cuídate con alguien</h3>
    <p class="hint">Con un amigo es más fácil cumplir. NutriPlan es gratis para los dos y no hace falta registrarse.</p>
    <label class="invite-name">
      <span>Tu nombre (opcional), para que sepa que eres tú</span>
      <input type="text" id="invite-name" maxlength="${INVITE_NAME_MAX}" autocomplete="given-name" placeholder="Ej.: Ana" value="${cleanInviteName(state.inviteName)}">
    </label>
    <div class="invite-actions">
      <a class="btn block whatsapp-btn" id="invite-whatsapp" target="_blank" rel="noopener">💬 Invitar por WhatsApp</a>
      <button type="button" class="btn ghost block" id="invite-other">📤 Otras apps o copiar enlace</button>
    </div>
    ${n ? `<p class="hint center">🙌 Has invitado ${n} ${n === 1 ? "vez" : "veces"}. ¡Gracias por correr la voz!</p>` : ""}
  `;
  const input = body.querySelector("#invite-name");
  const wa = body.querySelector("#invite-whatsapp");
  const text = () => `${tr("Estoy usando NutriPlan: te hace un plan de comidas a tu medida y la lista de la compra con precios. Pruébala gratis:")} ${inviteUrl()}`;
  const sync = () => {
    state.inviteName = cleanInviteName(input.value);
    saveState();
    wa.href = `https://wa.me/?text=${encodeURIComponent(text())}`;
  };
  input.addEventListener("input", sync);
  sync();
  wa.addEventListener("click", () => {
    track("invitar-whatsapp");
    state.counters.invites = invitesSent() + 1;
    saveState();
    if (typeof unlockBadge === "function") unlockBadge("embajador");
  });
  body.querySelector("#invite-other").addEventListener("click", sendInvite);
  openSheet();
}

/* Quien llega por una invitación ve quién le invita en la bienvenida. */
function inviterFromUrl() {
  try {
    return cleanInviteName(new URLSearchParams(location.search).get(INVITE_PARAM));
  } catch (e) {
    return "";
  }
}

function showInviteWelcome() {
  const name = inviterFromUrl();
  if (!name || (state.profile && state.plan)) return;
  if (!state.invitedBy) {
    state.invitedBy = name;
    saveState();
    track("llegada-invitacion");
  }
  const view = document.getElementById("wizard-intro") || document.getElementById("view-onboarding");
  if (!view || document.getElementById("invite-welcome")) return;
  const banner = document.createElement("div");
  banner.id = "invite-welcome";
  banner.className = "invite-welcome";
  banner.textContent = tr(`👋 ${name} te ha invitado a NutriPlan. Crea tu plan gratis en 1 minuto.`);
  view.prepend(banner);
}

document.addEventListener("DOMContentLoaded", showInviteWelcome);

// ---------- Compartir una receta ----------

/* Texto de la receta con tu ración, listo para mandarlo por WhatsApp. */
function recipeShareText(recipeId, factor = 1) {
  const info = getRecipeInfo(recipeId);
  const r = info.recipe;
  const lines = [
    `🥗 ${r.name}`,
    `${Math.round(info.kcal * factor)} kcal · ${Math.round(info.prot * factor)} g ${tr("proteína")}`,
    "",
    `🛒 ${tr("Ingredientes")}:`,
    ...r.ingredients.map(([id, qty]) => `• ${FOODS[id].name}: ${formatQty(qty * factor, FOODS[id].unit)}`),
    "",
    `👩‍🍳 ${tr("Preparación")}:`,
    ...r.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    `${tr("Receta de NutriPlan. Crea tu plan de comidas gratis:")} ${inviteUrl()}`,
  ];
  return lines.join("\n");
}

function shareButtonHtml(recipeId) {
  return `<button type="button" class="share-recipe-btn" data-share-recipe="${recipeId}" aria-label="Compartir receta">📤</button>`;
}

function bindShareRecipe(root, factor) {
  root.querySelectorAll("[data-share-recipe]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      track("receta-compartida");
      buzz(8);
      const text = recipeShareText(btn.dataset.shareRecipe, factor);
      try {
        if (navigator.share) {
          await navigator.share({ text });
          return;
        }
        await navigator.clipboard.writeText(text);
        showToast("📋 Receta copiada, ¡pégala donde quieras!");
      } catch (err) {
        if (!err || err.name !== "AbortError") showToast("No se pudo compartir ahora");
      }
    });
  });
}
