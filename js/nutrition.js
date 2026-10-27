/* Cálculo de necesidades calóricas y de macronutrientes. */

/* Estos niveles ya NO incluyen el deporte estructurado (eso se calcula aparte,
   a partir de lo que el usuario indique en "¿Qué deporte practicas?"). Solo
   reflejan tu movimiento normal del día a día (NEAT). */
const ACTIVITY_FACTORS = {
  sedentario: 1.2,
  moderado: 1.35,
  activo: 1.5,
};

const ACTIVITY_LABELS = {
  sedentario: "Sedentario (trabajo de oficina, te mueves poco)",
  moderado: "Normal (caminas bastante, trabajo de pie)",
  activo: "Trabajo físico exigente",
};

const GOAL_LABELS = {
  perder: "Perder grasa",
  mantener: "Mantener mi peso",
  ganar: "Ganar músculo",
};

function calcBMR({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "mujer" ? base - 161 : base + 5;
}

function calcTDEE(bmr, activityLevel) {
  return bmr * (ACTIVITY_FACTORS[activityLevel] || 1.2);
}

/* Media de kcal/día que quemas haciendo deporte, a partir de los MET de cada
   actividad (fórmula estándar: kcal/min = MET × 3.5 × peso(kg) / 200),
   repartida entre los 7 días de la semana para dar una media diaria. */
function calcExerciseCaloriesPerDay(sports, weightKg) {
  if (!sports || !sports.length) return 0;
  let weeklyKcal = 0;
  for (const s of sports) {
    const met = (SPORTS[s.type] && SPORTS[s.type].met) || 5;
    const kcalPerSession = ((met * 3.5 * weightKg) / 200) * s.mins;
    weeklyKcal += kcalPerSession * s.freq;
  }
  return weeklyKcal / 7;
}

function calcTargets(profile, calorieAdjust = 0) {
  const bmr = calcBMR(profile);
  const baseTdee = calcTDEE(bmr, profile.activityLevel);
  const exerciseKcal = calcExerciseCaloriesPerDay(profile.sports, profile.weightKg);
  const tdee = baseTdee + exerciseKcal;
  const w = profile.weightKg;

  let calories, proteinPerKg, fatRatio;
  if (profile.goal === "perder") {
    calories = Math.max(tdee - 500, bmr * 1.05);
    proteinPerKg = 2.2;
    fatRatio = 0.25;
  } else if (profile.goal === "ganar") {
    calories = tdee + 350;
    proteinPerKg = 2.0;
    fatRatio = 0.25;
  } else {
    calories = tdee;
    proteinPerKg = 1.8;
    fatRatio = 0.28;
  }
  // Ajuste manual aceptado por el usuario tras ver su evolución de peso.
  if (calorieAdjust) calories = Math.max(calories + calorieAdjust, bmr * 1.05);

  const protein = proteinPerKg * w;
  const fat = (calories * fatRatio) / 9;
  const carbsCalories = calories - protein * 4 - fat * 9;
  const carbs = Math.max(carbsCalories, 0) / 4;

  return {
    bmr: Math.round(bmr),
    baseTdee: Math.round(baseTdee),
    exerciseKcal: Math.round(exerciseKcal),
    tdee: Math.round(tdee),
    calories: Math.round(calories),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    proteinPerKg,
    calorieDelta: Math.round(calories - tdee),
    calorieAdjust: Math.round(calorieAdjust || 0),
  };
}

/* Texto explicativo de por qué el usuario tiene estos objetivos concretos. */
function explainTargets(profile, targets) {
  const sexLabel = profile.sex === "mujer" ? "mujer" : "hombre";
  const paragraphs = [];

  paragraphs.push(
    `Tu metabolismo basal (BMR) es de ${targets.bmr} kcal: es lo que tu cuerpo quema en reposo solo por mantenerte con vida, calculado con tu peso, altura, edad y sexo (${profile.weightKg} kg, ${profile.heightCm} cm, ${profile.age} años, ${sexLabel}).`
  );
  paragraphs.push(
    `Multiplicando por tu nivel de actividad diaria (${ACTIVITY_LABELS[profile.activityLevel] || "tu actividad diaria"}) obtenemos ${targets.baseTdee} kcal/día: lo que quemas en un día normal sin contar el deporte.`
  );

  if (profile.sports && profile.sports.length) {
    const sportsList = profile.sports
      .map((s) => `${(SPORTS[s.type] && SPORTS[s.type].label) || "deporte"} (${s.freq}×/semana, ${s.mins} min)`)
      .join(", ");
    paragraphs.push(
      `Además nos has dicho que practicas ${sportsList}. Calculamos las calorías que quema cada sesión según su intensidad y las repartimos entre los 7 días: una media de ${targets.exerciseKcal} kcal/día extra, que sumamos a tu gasto para ser más precisos (tu gasto total pasa a ser ${targets.tdee} kcal/día).`
    );
  }

  if (profile.goal === "perder") {
    paragraphs.push(
      `Para perder grasa de forma sostenible te proponemos ${targets.calories} kcal/día, unas ${Math.abs(targets.calorieDelta)} kcal por debajo de tu gasto: un déficit moderado que reduce peso sin pasar hambre extrema ni perder demasiado músculo.`
    );
  } else if (profile.goal === "ganar") {
    paragraphs.push(
      `Para ganar músculo te proponemos ${targets.calories} kcal/día, unas ${targets.calorieDelta} kcal por encima de tu gasto: un superávit moderado para minimizar la grasa que se gana junto al músculo.`
    );
  } else {
    paragraphs.push(
      `Para mantener tu peso actual, el objetivo es comer aproximadamente lo mismo que gastas: ${targets.calories} kcal/día.`
    );
  }

  if (targets.calorieAdjust) {
    paragraphs.push(
      `Incluye un ajuste de ${targets.calorieAdjust > 0 ? "+" : ""}${targets.calorieAdjust} kcal que aceptaste al ver cómo evoluciona tu peso: las fórmulas son una estimación, y tu báscula nos dice cuánto gastas de verdad.`
    );
  }

  paragraphs.push(
    `Te recomendamos ${targets.protein} g de proteína al día (~${targets.proteinPerKg} g por kg de peso corporal), la cantidad que se asocia con preservar o ganar masa muscular en tu situación.`
  );
  paragraphs.push(
    `El resto de la energía se reparte entre grasas (${targets.fat} g, necesarias para las hormonas) y carbohidratos (${targets.carbs} g, tu principal fuente de energía para entrenar y rendir en el día a día).`
  );

  return paragraphs;
}

/* ---------- Evolución del peso y ajuste automático ---------- */

/* Ritmo de cambio de peso razonable para cada objetivo, en % del peso
   corporal por semana. Fuera de este rango proponemos ajustar calorías. */
const GOAL_WEEKLY_RATE = {
  perder: { min: -1.0, ideal: -0.5, max: -0.25 },
  mantener: { min: -0.25, ideal: 0, max: 0.25 },
  ganar: { min: 0.1, ideal: 0.25, max: 0.5 },
};

const KCAL_PER_KG = 7700;
const MIN_TREND_DAYS = 10;
const ADJUST_STEP_MIN = 100;
const ADJUST_STEP_MAX = 250;

function daysBetween(isoA, isoB) {
  return Math.round((new Date(isoB) - new Date(isoA)) / 86400000);
}

/* Tendencia de peso (recta de regresión) con los registros de las últimas
   4 semanas. Usar la tendencia y no el último dato evita que un día de
   retención de líquidos dispare un ajuste. */
function weightTrend(log) {
  if (!log || log.length < 2) return null;
  const last = log[log.length - 1].date;
  const recent = log.filter((e) => daysBetween(e.date, last) <= 28);
  const span = daysBetween(recent[0].date, last);
  if (recent.length < 2 || span < MIN_TREND_DAYS) return null;

  const xs = recent.map((e) => daysBetween(recent[0].date, e.date));
  const ys = recent.map((e) => e.kg);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const kgPerDay = den ? num / den : 0;
  const kgPerWeek = kgPerDay * 7;
  return { kgPerWeek, pctPerWeek: (kgPerWeek / my) * 100, spanDays: span, entries: n };
}

/* Devuelve una propuesta de ajuste (o null si vas bien o aún faltan datos). */
function suggestCalorieAdjustment(profile, log) {
  const trend = weightTrend(log);
  if (!trend) return null;
  const range = GOAL_WEEKLY_RATE[profile.goal] || GOAL_WEEKLY_RATE.mantener;
  if (trend.pctPerWeek >= range.min && trend.pctPerWeek <= range.max) {
    return { status: "ok", trend };
  }
  const currentKg = log[log.length - 1].kg;
  const gapKgPerWeek = ((range.ideal - trend.pctPerWeek) / 100) * currentKg;
  const raw = (gapKgPerWeek * KCAL_PER_KG) / 7;
  const magnitude = Math.min(ADJUST_STEP_MAX, Math.max(ADJUST_STEP_MIN, Math.round(Math.abs(raw) / 50) * 50));
  return { status: raw > 0 ? "up" : "down", kcal: raw > 0 ? magnitude : -magnitude, trend };
}

function explainAdjustment(profile, suggestion) {
  const { trend } = suggestion;
  const rate = `${trend.kgPerWeek > 0 ? "+" : ""}${trend.kgPerWeek.toFixed(2).replace(".", ",")} kg/semana`;
  const range = GOAL_WEEKLY_RATE[profile.goal] || GOAL_WEEKLY_RATE.mantener;
  const idealKg = Math.abs((range.ideal / 100) * profile.weightKg).toFixed(2).replace(".", ",");
  if (suggestion.status === "ok") {
    return `Tu peso va a ${rate}, dentro del ritmo que buscamos para tu objetivo. No hace falta tocar nada.`;
  }
  const goalText = profile.goal === "perder"
    ? `Para perder grasa sin perder músculo buscamos bajar unos ${idealKg} kg/semana`
    : profile.goal === "ganar"
      ? `Para ganar músculo con poca grasa buscamos subir unos ${idealKg} kg/semana`
      : "Para mantener buscamos que tu peso se quede estable";
  const action = suggestion.kcal > 0 ? `subir ${suggestion.kcal}` : `bajar ${Math.abs(suggestion.kcal)}`;
  return `En los últimos ${trend.spanDays} días tu peso va a ${rate}. ${goalText}, así que te proponemos ${action} kcal al día. Las raciones de tu plan se ajustan solas.`;
}
