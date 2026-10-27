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

function calcTargets(profile) {
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

  paragraphs.push(
    `Te recomendamos ${targets.protein} g de proteína al día (~${targets.proteinPerKg} g por kg de peso corporal), la cantidad que se asocia con preservar o ganar masa muscular en tu situación.`
  );
  paragraphs.push(
    `El resto de la energía se reparte entre grasas (${targets.fat} g, necesarias para las hormonas) y carbohidratos (${targets.carbs} g, tu principal fuente de energía para entrenar y rendir en el día a día).`
  );

  return paragraphs;
}
