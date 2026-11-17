/* Mi progreso: peso y cintura en el tiempo, con gráfico y una tarjeta para
   compartir. La cintura sirve para algo que la báscula no ve: si pierdes grasa
   y ganas músculo a la vez, el peso se queda quieto pero la cintura baja.
   Se carga después de app.js y share.js y usa su estado y sus utilidades. */

if (!Array.isArray(state.bodyLog)) state.bodyLog = [];

/* Cintura/altura: la guía NICE (2022) recomienda que la cintura mida menos
   de la mitad de tu altura; a partir de 0,6 el riesgo cardiometabólico es alto. */
const WHTR_LEVELS = [
  { max: 0.5, label: "Saludable", tone: "ok" },
  { max: 0.6, label: "Riesgo aumentado", tone: "warn" },
  { max: Infinity, label: "Riesgo alto", tone: "high" },
];

/* Cambio de cintura que tomamos como real y no como error al medir (~1 cm),
   en al menos 2 semanas. */
const WAIST_MIN_CHANGE_CM = 1;
const WAIST_MIN_SPAN_DAYS = 14;

function fmt1(n) {
  return (Math.round(n * 10) / 10).toString().replace(".", ",");
}

function signed(n) {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt1(Math.abs(n))}`;
}

function logWaist(cm) {
  const log = state.bodyLog;
  const last = log[log.length - 1];
  const today = todayIso();
  if (last && last.date === today) last.waist = cm;
  else log.push({ date: today, waist: cm });
}

function lastWaist() {
  const log = state.bodyLog;
  return log.length ? log[log.length - 1].waist : null;
}

function whtrInfo(waist, heightCm) {
  if (!waist || !heightCm) return null;
  const ratio = waist / heightCm;
  const level = WHTR_LEVELS.find((l) => ratio < l.max);
  return { ratio, ...level };
}

/* Cambio de cintura en las últimas semanas (como mucho 6), o null si aún no
   hay dos medidas separadas al menos 2 semanas. */
function waistTrend(log = state.bodyLog) {
  if (log.length < 2) return null;
  const last = log[log.length - 1];
  const recent = log.filter((e) => daysBetween(e.date, last.date) <= 42);
  const first = recent[0];
  const span = daysBetween(first.date, last.date);
  if (span < WAIST_MIN_SPAN_DAYS) return null;
  return { cm: last.waist - first.waist, spanDays: span };
}

/* Recomposición: quieres perder grasa, la báscula dice que vas lento, pero tu
   cintura baja. Bajar más las calorías ahí sería un error: estás perdiendo
   grasa y ganando (o manteniendo) músculo. */
function recompositionInsight(profile, suggestion) {
  if (!suggestion || suggestion.status !== "down" || profile.goal === "ganar") return null;
  const t = waistTrend();
  if (!t || t.cm > -WAIST_MIN_CHANGE_CM) return null;
  return `Tu cintura ha bajado ${fmt1(Math.abs(t.cm))} cm en ${t.spanDays} días aunque la báscula se mueva poco: estás perdiendo grasa y ganando músculo. No hace falta bajar calorías.`;
}

function daysOnPlanTotal() {
  return Object.values(state.daily).filter((e) => mealsDone(e) >= MEALS_FOR_STREAK).length;
}

function progressSummary() {
  const log = state.weightLog;
  const first = log[0];
  const last = log[log.length - 1];
  const waist = state.bodyLog;
  return {
    kgChange: first && last && first !== last ? last.kg - first.kg : null,
    waistChange: waist.length > 1 ? waist[waist.length - 1].waist - waist[0].waist : null,
    weeks: first ? Math.max(1, Math.round(daysBetween(first.date, todayIso()) / 7)) : 0,
    daysOnPlan: daysOnPlanTotal(),
    streak: currentStreak(),
  };
}

/* Gráfico de línea con la primera y la última medida marcadas. */
function lineChartSvg(points, unit) {
  if (points.length < 2) return `<p class="hint">Con dos medidas verás aquí tu evolución.</p>`;
  const w = 320, h = 120, padX = 10, padY = 18;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const xy = points.map((p, i) => [
    padX + (i / (points.length - 1)) * (w - padX * 2),
    padY + (1 - (p.v - min) / span) * (h - padY * 2),
  ]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${padX},${h} ${line} ${w - padX},${h}`;
  const shortDate = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
  const [fx, fy] = xy[0];
  const [lx, ly] = xy[xy.length - 1];
  return `
    <div class="pchart">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <polygon class="pchart-area" points="${area}" />
        <polyline class="pchart-line" points="${line}" />
        <circle class="pchart-dot" cx="${fx}" cy="${fy}" r="3.5" />
        <circle class="pchart-dot last" cx="${lx}" cy="${ly}" r="5" />
      </svg>
      <div class="pchart-axis">
        <span>${shortDate(points[0].date)} · ${fmt1(points[0].v)} ${unit}</span>
        <span>${shortDate(points[points.length - 1].date)} · <b>${fmt1(points[points.length - 1].v)} ${unit}</b></span>
      </div>
    </div>`;
}

function progressEntryButtonHtml() {
  return `<button type="button" class="btn ghost block small progress-open-btn" id="progress-open-btn">📈 Ver mi progreso y medidas</button>`;
}

function bindProgressEntryButton(root = document) {
  const btn = root.querySelector("#progress-open-btn");
  if (btn) btn.addEventListener("click", openProgressSheet);
}

function openProgressSheet() {
  track("progreso-visto");
  const p = state.profile;
  const s = progressSummary();
  const waist = lastWaist();
  const whtr = whtrInfo(waist, p.heightCm);
  const wt = waistTrend();
  const body = document.getElementById("sheet-body");
  body.innerHTML = `
    <span class="tag">📈 Mi progreso</span>
    <h3><span>${s.kgChange !== null ? `${signed(s.kgChange)} kg` : "Tu punto de partida"}</span>${s.waistChange !== null ? ` · <span>${signed(s.waistChange)} cm de cintura</span>` : ""}</h3>
    <p class="hint">${s.weeks ? `<span>En ${s.weeks} ${s.weeks === 1 ? "semana" : "semanas"}</span> · ` : ""}<span>${s.daysOnPlan} ${s.daysOnPlan === 1 ? "día" : "días"} cumpliendo tu plan</span></p>

    <div class="sheet-section">
      <div class="section-kicker">⚖️ Peso</div>
      ${lineChartSvg(state.weightLog.slice(-20).map((e) => ({ date: e.date, v: e.kg })), "kg")}
    </div>

    <div class="sheet-section">
      <div class="section-kicker">📏 Cintura</div>
      ${lineChartSvg(state.bodyLog.slice(-20).map((e) => ({ date: e.date, v: e.waist })), "cm")}
      <form class="weigh-form" id="waist-form">
        <input type="number" inputmode="decimal" step="0.5" min="40" max="200" name="cm" placeholder="Cintura de hoy (cm)" required>
        <button type="submit" class="btn small">Guardar</button>
      </form>
      <p class="hint">📐 Mídela a la altura del ombligo, de pie, sin apretar y tras soltar el aire. Una vez cada 1 o 2 semanas basta.</p>
      ${whtr ? `
        <div class="whtr whtr-${whtr.tone}">
          <b>Cintura/altura: ${whtr.ratio.toFixed(2).replace(".", ",")} · ${whtr.label}</b>
          <span>Lo recomendable es que tu cintura mida menos de la mitad de tu altura (menos de ${Math.round(p.heightCm / 2)} cm). Es mejor señal de grasa abdominal que el IMC.</span>
        </div>` : ""}
      ${wt && Math.abs(wt.cm) >= WAIST_MIN_CHANGE_CM ? `<p class="hint">${wt.cm < 0 ? "🎉" : "👀"} ${signed(wt.cm)} cm de cintura en ${wt.spanDays} días.</p>` : ""}
    </div>

    <button type="button" class="btn block" id="share-progress">📤 Compartir mi progreso</button>
    <p class="hint center">La imagen muestra cuánto has cambiado, no tu peso.</p>
  `;
  body.querySelector("#waist-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = e.target.cm;
    const cm = Math.round(Number(String(input.value).replace(",", ".")) * 2) / 2;
    if (!(cm >= 40 && cm <= 200)) {
      input.reportValidity();
      return;
    }
    logWaist(cm);
    saveState();
    track("cintura-registrada");
    if (typeof unlockBadge === "function") unlockBadge("cinta_metrica");
    showToast("📏 Medida guardada");
    renderDashboard();
    openProgressSheet();
  });
  const share = body.querySelector("#share-progress");
  share.addEventListener("click", () => shareProgress(share));
  openSheet();
}

// ---------- Imagen para compartir ----------

function drawProgressImage() {
  const s = progressSummary();
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const font = (weight, size) => `${weight} ${size}px "Plus Jakarta Sans", system-ui, sans-serif`;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#186b40");
  bg.addColorStop(0.6, "#27915a");
  bg.addColorStop(1, "#4fb27f");
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
  ctx.fillText(tr("Mi progreso"), 80, 270);
  ctx.font = font(600, 44);
  ctx.globalAlpha = 0.9;
  ctx.fillText(tr(`En ${s.weeks} ${s.weeks === 1 ? "semana" : "semanas"} con mi plan`), 80, 345);
  ctx.globalAlpha = 1;

  // las dos cifras grandes
  const big = [];
  if (s.kgChange !== null) big.push([`${signed(s.kgChange)} kg`, tr("de peso")]);
  if (s.waistChange !== null) big.push([`${signed(s.waistChange)} cm`, tr("de cintura")]);
  if (!big.length) big.push(["💪", tr("Empezando")]);
  big.forEach(([value, label], i) => {
    const w = big.length === 1 ? 920 : 445;
    const x = 80 + i * (w + 30), y = 420, h = 300;
    ctx.fillStyle = "rgba(255,255,255,.16)";
    roundRect(ctx, x, y, w, h, 44);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = font(800, 104);
    ctx.fillText(value, x + w / 2, y + 165);
    ctx.font = font(600, 40);
    ctx.globalAlpha = 0.9;
    ctx.fillText(label, x + w / 2, y + 240);
    ctx.globalAlpha = 1;
  });

  // línea de peso, sin escala: se ve la tendencia, no los kilos
  const pts = state.weightLog.slice(-20).map((e) => e.kg);
  if (pts.length > 1) {
    const x0 = 80, y0 = 780, cw = 920, ch = 200;
    const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    pts.forEach((v, i) => {
      const x = x0 + (i / (pts.length - 1)) * cw;
      const y = y0 + (1 - (v - min) / span) * ch;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.font = font(700, 44);
  ctx.fillStyle = "#fff";
  ctx.fillText(`✅ ${tr(`${s.daysOnPlan} días cumpliendo`)}   🔥 ${tr(`${s.streak} de racha`)}`, W / 2, 1110);

  ctx.font = font(700, 36);
  ctx.fillText(tr("Crea tu plan gratis en"), W / 2, H - 110);
  ctx.font = font(800, 38);
  ctx.fillText(APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, ""), W / 2, H - 60);
  return canvas;
}

async function shareProgress(btn) {
  track("compartir-progreso");
  await shareCanvas(btn, drawProgressImage, "mi-progreso-nutriplan.png", tr("Mi progreso con NutriPlan 💪 Crea tu plan gratis:"));
}
