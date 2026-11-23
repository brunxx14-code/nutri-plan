/* Protector de racha 🧊: si un día no cumples el plan, se gasta uno solo y la
   racha sigue viva. Empiezas con uno y ganas otro cada vez que subes de nivel
   (como mucho puedes guardar dos). */

const MAX_FREEZES = 2;

function streakFreezes() {
  if (typeof state.streakFreezes !== "number") state.streakFreezes = 1;
  return state.streakFreezes;
}

function grantStreakFreeze() {
  if (streakFreezes() >= MAX_FREEZES) return false;
  state.streakFreezes += 1;
  saveState();
  return true;
}

function dayKept(iso) {
  const entry = state.daily[iso];
  return mealsDone(entry) >= MEALS_FOR_STREAK || !!(entry && entry.frozen);
}

/* Al abrir la app: si ayer (o anteayer) se rompió una racha y quedan
   protectores, se usan para cubrir esos días, del más antiguo al más reciente. */
function useStreakFreezes() {
  if (!state.profile) return;
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDate(d); };
  let used = 0;
  for (let n = 2; n >= 1; n--) {
    const iso = daysAgo(n);
    if (dayKept(iso) || !dayKept(daysAgo(n + 1)) || streakFreezes() < 1) continue;
    state.daily[iso] = state.daily[iso] || { eaten: {}, water: 0 };
    state.daily[iso].frozen = true;
    state.streakFreezes -= 1;
    used++;
  }
  if (!used) return;
  saveState();
  track("protector-usado");
  // «tu racha de 1 día», no «de 1 días»
  const n = currentStreak();
  setTimeout(() => showToast(`🧊 Protector usado: tu racha de ${n === 1 ? "1 día" : `${n} días`} sigue viva`), 900);
}

function freezeChipHtml() {
  const n = streakFreezes();
  return n ? `<span class="freeze-count" aria-hidden="true">🧊${n > 1 ? `×${n}` : ""}</span>` : "";
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#streak-chip")) return;
  const n = streakFreezes();
  buzz(6);
  showToast(n
    // con uno solo, «te salva la racha», no «salvan tu racha»
    ? (n === 1 ? "🧊 Tienes 1 protector de racha: si un día fallas, te salva la racha" : `🧊 Tienes ${n} protectores de racha: si un día fallas, salvan tu racha`)
    : "🧊 Sube de nivel para ganar un protector de racha");
});
