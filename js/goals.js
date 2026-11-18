/* Objetivos físicos: muchos más que "perder / mantener / ganar", y un campo
   para escribir el objetivo con tus palabras.

   - Cada objetivo concreto (GOAL_TYPES) se apoya en uno de los tres objetivos
     base (profile.goal = perder | mantener | ganar), que es lo que usa el
     resto de la app (planificador, mensajes, fotos). Encima ajusta lo que
     cambia de verdad según la evidencia: déficit o superávit, proteína por
     kg, reparto de grasa y carbohidratos, ritmo de cambio de peso semanal y
     en qué fijarse al comer.
   - El texto libre se interpreta en el propio móvil, sin IA ni servidor:
     se buscan palabras y expresiones típicas de cada objetivo (las más
     largas primero, para que "sin perder músculo" no cuente como "perder"),
     se detectan cifras ("10 kilos en 2 meses") para avisar si el ritmo no
     es seguro, y se detectan señales de riesgo (dejar de comer, purgas,
     dietas de muy pocas calorías, embarazo, enfermedades) para cuidar a la
     persona. Si no se entiende, se le pide que elija entre los objetivos.
   - Respeta las protecciones de salud (safety.js): si alguien es menor, está
     embarazada, dando el pecho, tiene o ha tenido un TCA o una enfermedad
     que afecta a la dieta, ningún objetivo le pone en déficit.

   Funciona envolviendo funciones de app.js y nutrition.js, como safety.js,
   para no chocar con otros cambios. Se carga después de safety.js, así que
   sus envoltorios quedan por fuera de los de safety.js. */

const GOAL_TYPES = {
  perder_grasa: {
    base: "perder", native: true, emoji: "🔥", label: "Perder grasa", sub: "Bajar peso cuidando el músculo",
    focus: [
      "Proteína en cada comida: es lo que más sacia y protege tu músculo.",
      "Mucha verdura, fruta y legumbre: llenan con pocas calorías.",
      "Menos bebidas azucaradas y ultraprocesados.",
    ],
    focusRefs: ["leidy", "who_sugars"],
    keys: ["perder grasa", "perder peso", "bajar de peso", "bajar peso", "adelgaz", "quemar grasa", "perder kilos", "bajar kilos",
      "quitarme kilos", "quitar kilos", "barriga", "tripa", "michelin", "flotador", "sobrepeso", "obesidad", "perder", "bajar", "grasa",
      "delgad", "estar mas flaco", "estar mas flaca", "secar", "lose weight", "lose fat", "weight loss", "fat loss"],
  },
  definir: {
    base: "perder", emoji: "🎯", label: "Definir", sub: "Marcar abdominales y que se note el músculo",
    cal: { deficitPct: 0.2, deficitMax: 500 }, ppk: 2.2, fat: 0.25,
    rate: { min: -1.0, ideal: -0.5, max: -0.25 },
    phrase: "definir sin perder músculo",
    calWhy: "Es un déficit moderado, para bajar entre un 0,5 % y un 1 % de tu peso por semana: cuanto más definido estás, más fácil es perder músculo si vas más rápido.",
    calRefs: ["helms", "garthe"],
    proteinWhy: "cuanto menos grasa tienes, más proteína hace falta para conservar el músculo en déficit (los estudios en culturistas naturales recomiendan ir arriba del rango)",
    proteinRefs: ["helms", "jager"],
    focus: [
      "Proteína alta, repartida en 3-4 comidas.",
      "Carbohidratos alrededor del entreno, para seguir rindiendo.",
      "Sigue entrenando fuerza pesado: es la señal que le dice al cuerpo que conserve el músculo.",
    ],
    focusRefs: ["helms", "kerksick"],
    keys: ["definir", "definicion", "definido", "definida", "marcar abdominales", "marcar abdomen", "marcar el abdomen", "marcar", "abdominales",
      "abdomen", "abdos", "six pack", "sixpack", "tableta", "cuadritos", "rayado", "sin perder musculo", "no perder musculo",
      "mantener el musculo", "conservar el musculo", "cut", "cutting", "shred"],
  },
  recomposicion: {
    base: "perder", emoji: "🔄", label: "Tonificar", sub: "Perder grasa y ganar músculo a la vez",
    cal: { deficitPct: 0.1, deficitMax: 300 }, ppk: 2.2, fat: 0.25,
    rate: { min: -0.5, ideal: -0.25, max: 0.1 },
    phrase: "perder grasa y ganar músculo a la vez",
    calWhy: "Es un déficit pequeño a propósito: con poco déficit, mucha proteína y entrenamiento de fuerza se puede perder grasa y ganar algo de músculo al mismo tiempo, sobre todo si empiezas o vuelves a entrenar. La báscula bajará despacio: fíjate también en la cintura.",
    calRefs: ["barakat"],
    proteinWhy: "con proteína alta y entrenamiento de fuerza es cuando más se ve la recomposición",
    proteinRefs: ["barakat", "morton"],
    focus: [
      "Entrena fuerza al menos 3 días por semana: sin ese estímulo no hay recomposición.",
      "Proteína alta en cada comida.",
      "Mídete la cintura cada 2 semanas: el peso puede casi no moverse aunque cambies.",
    ],
    focusRefs: ["barakat", "morton"],
    keys: ["tonificar", "tonificad", "tonific", "recomposicion", "recomp", "en forma", "ponerme en forma", "ponerme fuerte", "fibrad",
      "perder grasa y ganar musculo", "ganar musculo y perder grasa", "bajar grasa y subir musculo", "endurecer", "reafirmar",
      "volver a entrenar", "verme mejor", "tone", "toned", "get fit"],
  },
  mantener: {
    base: "mantener", native: true, emoji: "⚖️", label: "Mantenerme", sub: "Seguir como estoy, comiendo bien",
    focus: [
      "Come variado y a horas parecidas, sin saltarte comidas.",
      "Pésate 1-2 veces por semana: los cambios pequeños se corrigen fácil.",
    ],
    focusRefs: ["who", "hall"],
    keys: ["mantener", "mantenerme", "mantenimiento", "estable", "no engordar", "no quiero engordar", "no subir de peso",
      "seguir igual", "como estoy", "mismo peso", "maintain", "maintenance"],
  },
  ganar_musculo: {
    base: "ganar", native: true, emoji: "💪", label: "Ganar músculo", sub: "Más volumen con poca grasa",
    focus: [
      "Reparte la proteína en 3-4 comidas (unos 0,4 g por kg en cada una).",
      "Carbohidratos para entrenar fuerte.",
      "Superávit pequeño: comer mucho más no da más músculo, solo más grasa.",
    ],
    focusRefs: ["schoenfeld_aragon", "slater"],
    keys: ["ganar musculo", "ganar masa", "masa muscular", "hipertrofia", "volumen", "musculo", "muscul", "crecer", "brazos", "biceps",
      "pecho", "piernas", "gluteo", "culo", "espalda", "hombros", "mas grande", "mas grandes", "sin engordar", "sin coger grasa",
      "sin ganar grasa", "bulk", "build muscle", "gain muscle", "muscle"],
  },
  subir_peso: {
    base: "ganar", emoji: "🍌", label: "Subir de peso", sub: "Me cuesta engordar",
    cal: { surplus: 500 }, ppk: 1.6, fat: 0.3,
    rate: { min: 0.25, ideal: 0.5, max: 0.75 },
    phrase: "subir de peso",
    calWhy: "Si te cuesta engordar, necesitas un superávit más claro que para ganar músculo con poca grasa: así subes unos 0,5 % de tu peso por semana. Si lo combinas con fuerza, buena parte será músculo.",
    calRefs: ["iraki", "slater"],
    proteinWhy: "con esta cantidad tienes de sobra para construir músculo; el resto de las calorías es lo que te hace subir",
    proteinRefs: ["morton", "jager"],
    focus: [
      "Alimentos densos que llenan poco: frutos secos, aceite de oliva, aguacate, plátano, avena.",
      "4-5 comidas al día, y batidos o leche: las calorías bebidas sacian menos.",
      "Entrena fuerza para que el peso que subas sea músculo.",
    ],
    focusRefs: ["iraki", "predimed"],
    keys: ["subir de peso", "subir peso", "ganar peso", "coger peso", "ganar kilos", "coger kilos", "subir kilos", "engordar",
      "me cuesta engordar", "no engordo", "muy delgad", "demasiado delgad", "flaco", "flaca", "flacucho", "esqueletic", "bajo peso",
      "infrapeso", "gain weight", "skinny", "underweight"],
  },
  fuerza: {
    base: "ganar", emoji: "🏋️", label: "Ganar fuerza", sub: "Levantar más en el gimnasio",
    cal: { surplus: 150 }, ppk: 1.8, fat: 0.25,
    rate: { min: -0.1, ideal: 0.1, max: 0.3 },
    phrase: "ganar fuerza",
    calWhy: "La fuerza depende sobre todo del entrenamiento, pero entrenar en déficit la frena. Un superávit muy pequeño te deja rendir y recuperarte sin subir de categoría de peso por sorpresa.",
    calRefs: ["acsm", "slater"],
    proteinWhy: "con esta cantidad se consigue prácticamente todo el beneficio del entrenamiento de fuerza",
    proteinRefs: ["morton", "jager"],
    focus: [
      "Carbohidratos en las horas antes de entrenar, para rendir en las series pesadas.",
      "Proteína repartida a lo largo del día.",
      "Creatina (3-5 g/día) es el suplemento con más pruebas para ganar fuerza. Es opcional.",
    ],
    focusRefs: ["kerksick", "kreider"],
    keys: ["fuerza", "mas fuerte", "powerlifting", "powerlifter", "halterofilia", "levantar mas", "levantar peso", "press banca",
      "press de banca", "sentadilla", "peso muerto", "crossfit", "calistenia", "dominadas", "marcas", "record", "strength", "stronger"],
  },
  resistencia: {
    base: "mantener", emoji: "🏃", label: "Resistencia", sub: "Correr, bici, nadar, maratón",
    cal: {}, ppk: 1.6, fat: 0.22,
    phrase: "rendir en resistencia",
    calWhy: "Para rendir en deportes de resistencia lo importante es no quedarte corto de energía: entrenar con poca gasolina empeora el rendimiento y la recuperación, y a la larga la salud (lo que se llama baja disponibilidad energética).",
    calRefs: ["acsm"],
    proteinWhy: "en resistencia también hace falta proteína para reparar el músculo después de cada sesión",
    proteinRefs: ["acsm", "jager"],
    carbsPerKg: true,
    focus: [
      "Carbohidratos según lo que entrenes: 5-7 g por kg al día con entreno moderado, 6-10 g por kg con mucho volumen.",
      "En sesiones de más de 60-90 minutos, toma 30-60 g de carbohidratos por hora (plátano, dátiles, bebida isotónica).",
      "Bebe para no perder más del 2 % de tu peso en sudor.",
    ],
    focusRefs: ["acsm", "burke"],
    keys: ["resistencia", "maraton", "media maraton", "medio maraton", "correr", "corredor", "running", "runner", "carrera", "10k", "5k",
      "21k", "42k", "trail", "ultra", "triatlon", "ironman", "ciclismo", "ciclista", "bici", "nadar", "natacion", "fondo", "aguantar mas",
      "cansarme menos", "endurance", "marathon", "run", "cycling"],
  },
  deporte: {
    base: "mantener", emoji: "⚽", label: "Rendir en mi deporte", sub: "Fútbol, pádel, competición",
    cal: {}, ppk: 1.6, fat: 0.25,
    phrase: "rendir más en tu deporte",
    calWhy: "Para rendir y recuperarte entre entrenos y partidos lo mejor es comer lo que gastas, con suficientes carbohidratos en los días de más carga.",
    calRefs: ["acsm"],
    proteinWhy: "te ayuda a recuperarte entre entrenos y partidos",
    proteinRefs: ["acsm", "jager"],
    focus: [
      "Más carbohidratos los días de partido y de entreno fuerte.",
      "Come 2-4 horas antes del partido algo fácil de digerir (pasta, arroz, poca grasa).",
      "Después, proteína y carbohidratos para recuperarte.",
    ],
    focusRefs: ["acsm", "kerksick"],
    keys: ["rendir", "rendimiento", "competir", "competicion", "partido", "temporada", "pretemporada", "futbol", "baloncesto", "basket",
      "padel", "tenis", "balonmano", "rugby", "voley", "hockey", "artes marciales", "boxeo", "judo", "mma", "deporte", "equipo",
      "jugar mejor", "performance", "sport"],
  },
  salud: {
    base: "mantener", emoji: "🥗", label: "Comer más sano", sub: "Más energía y mejor salud",
    cal: {}, ppk: 1.2, fat: 0.3,
    phrase: "comer más sano",
    calWhy: "Para comer mejor no hace falta cambiar tu peso: lo que más cuenta es la calidad de lo que comes.",
    calRefs: ["who"],
    proteinWhy: "es una cantidad cómoda para una persona activa, por encima del mínimo que fija la EFSA",
    proteinRefs: ["jager"],
    focus: [
      "5 raciones de fruta y verdura al día.",
      "Integrales y legumbres antes que harinas refinadas.",
      "Pescado 2 veces por semana y aceite de oliva como grasa principal.",
      "Azúcares añadidos por debajo del 10 % de las calorías.",
    ],
    focusRefs: ["who", "reynolds", "predimed", "who_sugars"],
    keys: ["sano", "sana", "saludable", "salud", "comer mejor", "comer bien", "alimentarme mejor", "energia", "cansad", "vitalidad",
      "colesterol", "tension", "digestion", "intestino", "cuidarme", "dulces", "azucar", "bolleria", "comida basura", "picar entre horas", "dormir mejor", "bienestar", "mediterrane", "menos procesad", "healthy",
      "health", "eat better", "energy"],
  },
  envejecer: {
    base: "mantener", emoji: "🧓", label: "Músculo con la edad", sub: "Seguir fuerte a partir de los 50",
    cal: {}, ppk: 1.2, fat: 0.3,
    phrase: "conservar músculo y fuerza con los años",
    calWhy: "Con la edad se pierde músculo poco a poco (sarcopenia). Comer lo que gastas, con algo más de proteína y entrenando fuerza, es lo que mejor lo frena.",
    calRefs: ["bauer"],
    proteinWhy: "a partir de los 65 el cuerpo aprovecha peor la proteína, y el grupo PROT-AGE recomienda 1,0-1,2 g por kg, o más si haces ejercicio",
    proteinRefs: ["bauer"],
    focus: [
      "Unos 25-30 g de proteína en cada comida principal.",
      "Fuerza 2 o más días por semana (aunque sea con bandas o tu peso).",
      "Calcio y vitamina D: lácteos, pescado azul y sol.",
    ],
    focusRefs: ["bauer", "efsa_calcium"],
    keys: ["edad", "mayor", "mayores", "jubilad", "envejecer", "envejecimiento", "sarcopenia", "huesos", "osteoporosis", "menopausia",
      "a mis anos", "tercera edad", "ageing", "aging", "older"],
  },
};

const GOAL_DEFAULT_TYPE = { perder: "perder_grasa", mantener: "mantener", ganar: "ganar_musculo" };

const GOAL_SOURCES = {
  barakat: { label: "Barakat 2020", title: "Barakat C et al. Body recomposition: can trained individuals build muscle and lose fat at the same time? Strength Cond J, 2020.", url: "https://doi.org/10.1519/SSC.0000000000000584" },
  bauer: { label: "PROT-AGE 2013", title: "Bauer J et al. Evidence-based recommendations for optimal dietary protein intake in older people: a position paper from the PROT-AGE Study Group. J Am Med Dir Assoc, 2013.", url: "https://doi.org/10.1016/j.jamda.2013.05.021" },
  burke: { label: "Burke 2011", title: "Burke LM et al. Carbohydrates for training and competition. J Sports Sci, 2011.", url: "https://doi.org/10.1080/02640414.2011.585473" },
  kreider: { label: "ISSN creatina 2017", title: "Kreider RB et al. International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine. J Int Soc Sports Nutr, 2017.", url: "https://doi.org/10.1186/s12970-017-0173-z" },
};

/* ---------- Qué objetivo tiene cada perfil ---------- */

function goalTypeId(profile) {
  if (!profile) return "mantener";
  const t = GOAL_TYPES[profile.goalType];
  if (t && (t.base === profile.goal || isCareProfile(profile))) return profile.goalType;
  return GOAL_DEFAULT_TYPE[profile.goal] || "mantener";
}

function isCareProfile(profile) {
  return typeof needsCare === "function" && needsCare(profile);
}

/* El objetivo con el que se calcula de verdad. Si alguien necesita cuidado
   (safety.js) y su objetivo pide déficit, se queda en mantenimiento. */
function effectiveGoalType(profile) {
  const id = goalTypeId(profile);
  const t = GOAL_TYPES[id];
  if (isCareProfile(profile) && t.base === "perder") return { id: "mantener", type: GOAL_TYPES.mantener, capped: id !== "mantener" && id !== "perder_grasa" ? id : null };
  return { id, type: t, capped: null };
}

/* ---------- Interpretar el objetivo escrito ---------- */

function normGoalText(s) {
  return " " + String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.,]+/g, " ").replace(/\s+/g, " ").trim() + " ";
}

let GOAL_PHRASES = null;
function goalPhrases() {
  if (GOAL_PHRASES) return GOAL_PHRASES;
  GOAL_PHRASES = [];
  for (const [id, t] of Object.entries(GOAL_TYPES)) {
    for (const k of t.keys) GOAL_PHRASES.push({ id, key: normGoalText(k).trim() });
  }
  GOAL_PHRASES.sort((a, b) => b.key.length - a.key.length);
  return GOAL_PHRASES;
}

const NUM_WORDS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, quince: 15, veinte: 20 };

function parseNum(s) {
  if (NUM_WORDS[s] !== undefined) return NUM_WORDS[s];
  return Number(String(s).replace(",", "."));
}

/* "10 kilos en 2 meses" -> { kg: 10, weeks: 8.7 } */
function parseAmountAndTime(n) {
  const out = {};
  const kg = n.match(/ (\d+(?:[.,]\d+)?|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|quince|veinte) ?(?:kg|kgs|kilo|kilos|k) /);
  if (kg) out.kg = parseNum(kg[1]);
  const time = n.match(/ (\d+(?:[.,]\d+)?|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|quince|veinte)? ?(dia|dias|semana|semanas|mes|meses|ano|anos) /);
  if (time && (time[1] || / (en|para|dentro de) (un |una )?(mes|semana|ano) /.test(n))) {
    const q = time[1] ? parseNum(time[1]) : 1;
    const unit = time[2];
    const weeks = unit.startsWith("dia") ? q / 7 : unit.startsWith("semana") ? q : unit.startsWith("mes") ? q * 4.35 : q * 52;
    if (weeks > 0) out.weeks = weeks;
  }
  const kcal = n.match(/ (\d{3,4}) ?(?:kcal|calorias|cal) /);
  if (kcal) out.kcal = Number(kcal[1]);
  const age = n.match(/ (\d{2}) ?anos /);
  if (age) out.age = Number(age[1]);
  return out;
}

const fmt1 = (x) => (Math.round(x * 10) / 10).toString().replace(".", ",");

/* Devuelve { status: "ok" | "ambiguous" | "unknown" | "care", id, alt, notes }.
   notes = [{ kind: "info" | "warn" | "care", text }] */
function interpretGoal(text, ctx = {}) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  let n = normGoalText(raw);
  const notes = [];
  const scores = {};

  // Señales de riesgo: antes que nada.
  const ed = /( dejar de comer $| dejar de comer (del todo|por completo|nada)| no comer nada| comer nada| sin comer (nada|en|durante|\d)| vomit| laxante| purga| anorexi| bulimi| atracon| ayuno de (varios|\d+) dias| odio mi cuerpo| me doy asco)/.test(n);
  const pregnant = /(embarazad|embarazo|lactancia|dar el pecho|dando el pecho|postparto|posparto)/.test(n);
  const medical = /(diabet|insulina|renal|rinon|hipertension|celiac|crohn|colitis|cancer|quimio|tiroides|cardiac|corazon)/.test(n);
  const nums = parseAmountAndTime(n);

  if (ed) {
    notes.push({ kind: "care", text: "Lo que describes puede hacer daño, y no hace falta pasar por ahí para sentirte mejor. Te dejamos un plan para comer lo que gastas, sin déficit. Si la comida o tu cuerpo te están haciendo pasarlo mal, hablarlo con tu médico o con un psicólogo ayuda mucho. Si quieres, marca la opción de trastorno de la conducta alimentaria en el primer paso y ocultaremos calorías y peso." });
    return { status: "care", id: "salud", alt: [], notes };
  }
  if (pregnant) notes.push({ kind: "care", text: "Si estás embarazada o dando el pecho, márcalo en el primer paso: tu plan no bajará de lo que gastas y te recomendaremos hablarlo con tu matrona o médico." });
  if (medical) notes.push({ kind: "care", text: "Si tienes una enfermedad que afecta a lo que comes, márcalo en el primer paso y consulta los cambios con tu médico." });
  if (nums.kcal && nums.kcal < 1200) {
    notes.push({ kind: "warn", text: `Comer ${nums.kcal} kcal al día es menos de lo que tu cuerpo gasta solo en reposo. Sin control médico no es seguro, y la app nunca te pondrá por debajo de tu metabolismo basal.` });
  }

  // Frases, de la más larga a la más corta; cada trozo de texto cuenta una vez.
  for (const { id, key } of goalPhrases()) {
    const re = new RegExp(` ${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z]*`, "g");
    const m = n.match(re);
    if (!m) continue;
    scores[id] = (scores[id] || 0) + key.length * m.length;
    n = n.replace(re, " ");
  }
  // "perder grasa" + "ganar músculo" en la misma frase = recomposición.
  if (scores.perder_grasa && scores.ganar_musculo) {
    scores.recomposicion = (scores.recomposicion || 0) + scores.perder_grasa + scores.ganar_musculo;
    delete scores.perder_grasa;
    delete scores.ganar_musculo;
  }
  // Si dice su edad (55+) o ya sabemos que tiene 60+, cuenta la edad.
  if (nums.age >= 55 || (ctx.age >= 60 && (scores.salud || scores.mantener))) scores.envejecer = (scores.envejecer || 0) + 6;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    return { status: "unknown", id: null, alt: [], notes };
  }
  const [id, top] = ranked[0];
  const alt = ranked.slice(1).filter(([, s]) => s >= top * 0.75).map(([k]) => k).slice(0, 2);
  const type = GOAL_TYPES[id];

  // Ritmo: "10 kilos en 1 mes".
  const urgent = /( rapid| cuanto antes| ya | urgente| boda| verano| operacion bikini| vacaciones| en una semana| en dos semanas)/.test(" " + normGoalText(raw) + " ");
  if (nums.kg && type.base !== "mantener") {
    const weight = ctx.weightKg || 0;
    const ideal = (type.rate || (type.base === "perder" ? { ideal: -0.5 } : { ideal: 0.25 })).ideal;
    if (weight) {
      const idealKgWeek = Math.abs(ideal / 100) * weight;
      const etaWeeks = Math.ceil(nums.kg / idealKgWeek);
      if (nums.weeks) {
        const kgWeek = nums.kg / nums.weeks;
        const pct = (kgWeek / weight) * 100;
        const limit = type.base === "perder" ? 1 : 0.5;
        if (pct > limit) {
          notes.push({
            kind: "warn",
            text: type.base === "perder"
              ? `${fmt1(nums.kg)} kg en ese tiempo serían unos ${fmt1(kgWeek)} kg por semana (${fmt1(pct)} % de tu peso). Más del 1 % semanal hace perder músculo y suele recuperarse después. Te ponemos un ritmo seguro de unos ${fmt1(idealKgWeek)} kg por semana: llegarías en unas ${etaWeeks} semanas.`
              : `Subir ${fmt1(nums.kg)} kg en ese tiempo serían ${fmt1(kgWeek)} kg por semana: a partir de un 0,5 % semanal lo que se gana es sobre todo grasa. A un ritmo de unos ${fmt1(idealKgWeek)} kg por semana tardarías unas ${etaWeeks} semanas.`,
          });
        } else {
          notes.push({ kind: "info", text: `Es un ritmo realista: unos ${fmt1(kgWeek)} kg por semana.` });
        }
      } else {
        notes.push({ kind: "info", text: `A un ritmo sano (unos ${fmt1(idealKgWeek)} kg por semana) serían unas ${etaWeeks} semanas.` });
      }
    }
  } else if (urgent && type.base === "perder") {
    notes.push({ kind: "warn", text: "Con prisa es tentador apretar mucho, pero bajar más de un 1 % de tu peso por semana hace perder músculo y casi siempre se recupera. Te ponemos el ritmo más rápido que sigue siendo seguro." });
  }

  return { status: alt.length ? "ambiguous" : "ok", id, alt, notes };
}

/* ---------- Cálculos ---------- */

function applyGoalType(profile, t, calorieAdjust) {
  const eff = effectiveGoalType(profile);
  const g = eff.type;
  if (g.native) return t;
  const care = isCareProfile(profile);
  let delta = 0;
  if (g.cal.deficitPct) delta = -Math.min(g.cal.deficitMax, t.tdee * g.cal.deficitPct);
  if (g.cal.surplus) delta = g.cal.surplus;
  if (care && delta < 0) delta = 0;
  const floor = care ? t.tdee : t.bmr * 1.05;
  let calories = delta < 0 ? Math.max(t.tdee + delta, floor) : t.tdee + delta;
  let adj = calorieAdjust || 0;
  if (care) adj = Math.max(0, adj);
  if (adj) calories = Math.max(calories + adj, floor);

  const ref = proteinReferenceWeight(profile);
  const protein = g.ppk * ref.kg;
  const fat = (calories * g.fat) / 9;
  const carbs = Math.max(calories - protein * 4 - fat * 9, 0) / 4;
  return {
    ...t,
    calories: Math.round(calories),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    proteinPerKg: g.ppk,
    fatPct: Math.round(g.fat * 100),
    calorieDelta: Math.round(calories - t.tdee),
    goalType: eff.id,
  };
}

function goalExplainParagraph(profile, targets, g) {
  const d = targets.calorieDelta;
  const adjust = targets.calorieAdjust || 0;
  const planned = d - adjust;
  let text;
  if (planned < 0) text = `Para ${g.phrase} te proponemos ${targets.calories} kcal/día, unas ${Math.abs(d)} kcal por debajo de tu gasto. ${g.calWhy}`;
  else if (planned > 0) text = `Para ${g.phrase} te proponemos ${targets.calories} kcal/día, unas ${d} kcal por encima de tu gasto. ${g.calWhy}`;
  else text = `Para ${g.phrase} te proponemos comer lo que gastas: ${targets.calories} kcal/día. ${g.calWhy}`;
  return { text, refs: g.calRefs || [] };
}

function escapeGoalText(s) {
  return String(s || "").replace(/[<>&"]/g, "");
}

/* ---------- Formulario ---------- */

function goalPickerHtml() {
  return `
    <div class="goal-picker" id="goal-picker">
      <div class="goal-type-grid" role="radiogroup" aria-label="Objetivo físico">
        ${Object.entries(GOAL_TYPES).map(([id, t]) => `
          <button type="button" class="goal-type-card" data-goal-type="${id}" role="radio" aria-checked="false">
            <span class="gt-emoji" aria-hidden="true">${t.emoji}</span>
            <span class="gt-text"><b>${t.label}</b><small>${t.sub}</small></span>
          </button>`).join("")}
      </div>
      <input type="hidden" name="goalType" id="goalType" value="">
      <label class="goal-text-label" for="goal-text">✍️ ¿Otro objetivo? Escríbelo con tus palabras (opcional)</label>
      <textarea id="goal-text" name="goalText" rows="2" maxlength="160" placeholder="Ej.: quiero correr una media maratón en primavera"></textarea>
      <div class="goal-interpret hidden" id="goal-interpret" aria-live="polite"></div>
    </div>`;
}

function goalForm() {
  return document.getElementById("onboarding-form");
}

function setGoalType(id, { fromText = false } = {}) {
  const form = goalForm();
  const t = GOAL_TYPES[id];
  if (!form || !t) return;
  form.goalType.value = id;
  form.goal.value = t.base;
  if (!fromText) {
    // Si eliges a mano, el texto pasa a ser solo una nota.
    lastInterpretedText = null;
  }
  syncGoalPicker();
  if (typeof syncChoiceCards === "function") syncChoiceCards();
  if (typeof updateWizardPreview === "function") requestAnimationFrame(updateWizardPreview);
  if (typeof updateSafetyNote === "function") requestAnimationFrame(updateSafetyNote);
}

function syncGoalPicker() {
  const form = goalForm();
  if (!form || !form.goalType) return;
  const current = form.goalType.value || GOAL_DEFAULT_TYPE[form.goal.value] || "mantener";
  document.querySelectorAll(".goal-type-card").forEach((card) => {
    const on = card.dataset.goalType === current;
    card.classList.toggle("selected", on);
    card.setAttribute("aria-checked", on);
  });
}

function interpretChoiceButtons(ids) {
  return `<div class="gi-choices">${ids.map((id) => `<button type="button" class="gi-choice" data-goal-type="${id}">${GOAL_TYPES[id].emoji} ${GOAL_TYPES[id].label}</button>`).join("")}</div>`;
}

function interpretSummary(id) {
  const g = GOAL_TYPES[id];
  if (g.native) {
    const map = {
      perder_grasa: "un déficit moderado de calorías y proteína alta",
      mantener: "comer lo que gastas, con proteína suficiente",
      ganar_musculo: "un superávit pequeño y proteína alta",
    };
    return map[id];
  }
  const cal = g.cal.deficitPct ? "un déficit " + (g.cal.deficitPct <= 0.1 ? "pequeño" : "moderado")
    : g.cal.surplus ? (g.cal.surplus >= 400 ? "un superávit claro" : "un superávit muy pequeño")
      : "comer lo que gastas";
  const carbs = g.carbsPerKg ? ", más carbohidratos" : "";
  return `${cal}${carbs} y ${String(g.ppk).replace(".", ",")} g de proteína por kg`;
}

let lastInterpretedText = null;

function renderInterpretation(result, { apply }) {
  const box = document.getElementById("goal-interpret");
  if (!box) return;
  if (!result) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  let html = "";
  if (result.status === "unknown") {
    html = `<p class="gi-head">🤔 No lo hemos entendido del todo. ¿Se parece a alguno de estos?</p>${interpretChoiceButtons(["perder_grasa", "recomposicion", "ganar_musculo", "resistencia", "salud", "mantener"])}`;
  } else {
    const g = GOAL_TYPES[result.id];
    html = `<p class="gi-head">${result.status === "care" ? "💛" : "✅"} Lo entendemos como <b>${g.emoji} ${g.label}</b>: ${interpretSummary(result.id)}.</p>`;
    if (result.status === "ambiguous") {
      html += `<p class="gi-sub">¿O te refieres a otro?</p>${interpretChoiceButtons(result.alt)}`;
    }
  }
  html += result.notes.map((nt) => `<p class="gi-note ${nt.kind}">${nt.kind === "warn" ? "⚠️ " : nt.kind === "care" ? "💛 " : "ℹ️ "}${nt.text}</p>`).join("");
  box.innerHTML = html;
  box.classList.remove("hidden");
  box.querySelectorAll(".gi-choice").forEach((btn) => btn.addEventListener("click", () => {
    setGoalType(btn.dataset.goalType, { fromText: true });
    if (typeof track === "function") track("objetivo-texto-elegido");
  }));
  if (apply && result.id) setGoalType(result.id, { fromText: true });
}

function interpretFromForm({ apply }) {
  const form = goalForm();
  const text = form.goalText.value;
  const result = interpretGoal(text, { weightKg: Number(form.weightKg.value) || 0, age: Number(form.age.value) || 0 });
  renderInterpretation(result, { apply });
  return result;
}

function injectGoalPicker() {
  const select = document.getElementById("goal");
  if (!select || document.getElementById("goal-picker")) return;
  const label = select.closest("label");
  label.classList.add("goal-label");
  label.insertAdjacentHTML("afterend", goalPickerHtml());
  const form = goalForm();
  document.querySelectorAll(".goal-type-card").forEach((card) => card.addEventListener("click", () => {
    if (typeof buzz === "function") buzz(8);
    setGoalType(card.dataset.goalType);
  }));
  let timer = null;
  form.goalText.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const text = form.goalText.value.trim();
      if (text === lastInterpretedText) return;
      lastInterpretedText = text;
      const r = interpretFromForm({ apply: true });
      if (r && typeof track === "function") track(r.status === "unknown" ? "objetivo-texto-no-entendido" : "objetivo-texto-entendido");
    }, 350);
  });
  // El peso cambia el cálculo del ritmo ("10 kilos en 2 meses").
  ["weightKg", "age"].forEach((name) => form[name] && form[name].addEventListener("change", () => {
    if (form.goalText.value.trim()) interpretFromForm({ apply: false });
  }));
  syncGoalPicker();
}

/* ---------- Enganches ---------- */

function installGoalHooks() {
  const baseRead = readProfileFromForm;
  readProfileFromForm = function (form) {
    const p = baseRead.apply(this, arguments);
    const id = form.goalType && form.goalType.value;
    p.goalType = GOAL_TYPES[id] ? id : (GOAL_DEFAULT_TYPE[p.goal] || "mantener");
    const text = form.goalText ? form.goalText.value.replace(/[<>&"]/g, "").trim().slice(0, 160) : "";
    if (text) p.goalText = text;
    return p;
  };

  const baseFill = fillFormFromProfile;
  fillFormFromProfile = function (form, profile) {
    baseFill.apply(this, arguments);
    if (!form.goalType) return;
    form.goalType.value = goalTypeId(profile);
    form.goalText.value = profile.goalText || "";
    lastInterpretedText = form.goalText.value.trim();
    syncGoalPicker();
    if (profile.goalText) interpretFromForm({ apply: false });
    else renderInterpretation(null, {});
  };

  const baseTargets = calcTargets;
  calcTargets = function (profile, calorieAdjust = 0) {
    const t = baseTargets.apply(this, arguments);
    return applyGoalType(profile, t, calorieAdjust);
  };

  const baseExplain = explainTargets;
  explainTargets = function (profile, targets) {
    const paras = baseExplain.apply(this, arguments);
    const eff = effectiveGoalType(profile);
    const g = eff.type;
    const out = [];
    for (const p of paras) {
      if (!g.native && /^Para (perder grasa|ganar músculo|mantener tu peso)/.test(p.text)) {
        out.push(goalExplainParagraph(profile, targets, g));
        continue;
      }
      if (!g.native && /^Te recomendamos \d+ g de proteína/.test(p.text)) {
        out.push({ text: `Te recomendamos ${targets.protein} g de proteína al día (${String(targets.proteinPerKg).replace(".", ",")} g por kg): ${g.proteinWhy}.`, refs: g.proteinRefs || [] });
        if (g.carbsPerKg && profile.weightKg) {
          out.push({ text: `Tus ${targets.carbs} g de carbohidratos son unos ${fmt1(targets.carbs / profile.weightKg)} g por kg. Los días de entreno largo, sube hacia 6-10 g por kg; los de descanso puedes quedarte en esto.`, refs: ["acsm", "burke"] });
        }
        continue;
      }
      out.push(p);
    }
    // Lo que la persona escribió, y en qué fijarse al comer.
    const goalIdx = out.findIndex((p) => /^Para /.test(p.text));
    const extra = [];
    if (profile.goalText) {
      extra.push({ text: `Nos dijiste: «${escapeGoalText(profile.goalText)}». Tu objetivo: ${GOAL_TYPES[goalTypeId(profile)].emoji} ${GOAL_TYPES[goalTypeId(profile)].label}.` });
    }
    if (eff.capped) {
      extra.push({ text: `Elegiste ${GOAL_TYPES[eff.capped].label.toLowerCase()}, pero por tu situación de salud tu plan es de mantenimiento, sin déficit.` });
    }
    const focus = { text: `En qué fijarte: ${g.focus.join(" ")}`, refs: g.focusRefs || [] };
    if (goalIdx >= 0) out.splice(goalIdx, 0, ...extra);
    else out.unshift(...extra);
    const protIdx = out.findIndex((p) => /^Te recomendamos \d+ g de proteína/.test(p.text));
    out.splice(protIdx >= 0 ? protIdx : out.length - 1, 0, focus);
    return out;
  };

  // Ritmo de cambio de peso propio de cada objetivo.
  const baseSuggest = suggestCalorieAdjustment;
  suggestCalorieAdjustment = function (profile, log) {
    const g = effectiveGoalType(profile).type;
    if (g.native || !g.rate) return baseSuggest.apply(this, arguments);
    const trend = weightTrend(log);
    if (!trend) return null;
    const range = g.rate;
    if (trend.pctPerWeek >= range.min && trend.pctPerWeek <= range.max) return { status: "ok", trend };
    const currentKg = log[log.length - 1].kg;
    const gap = ((range.ideal - trend.pctPerWeek) / 100) * currentKg;
    const raw = (gap * KCAL_PER_KG) / 7;
    const magnitude = Math.min(ADJUST_STEP_MAX, Math.max(ADJUST_STEP_MIN, Math.round(Math.abs(raw) / 50) * 50));
    const s = { status: raw > 0 ? "up" : "down", kcal: raw > 0 ? magnitude : -magnitude, trend };
    if (isCareProfile(profile) && s.kcal < 0) return null;
    return s;
  };

  const baseExplainAdj = explainAdjustment;
  explainAdjustment = function (profile, suggestion) {
    const g = effectiveGoalType(profile).type;
    if (g.native || !g.rate || suggestion.status === "ok") return baseExplainAdj.apply(this, arguments);
    const { trend } = suggestion;
    const rate = `${trend.kgPerWeek > 0 ? "+" : ""}${trend.kgPerWeek.toFixed(2).replace(".", ",")} kg/semana`;
    const idealKg = Math.abs((g.rate.ideal / 100) * profile.weightKg).toFixed(2).replace(".", ",");
    const dir = g.rate.ideal < 0 ? `bajar unos ${idealKg} kg/semana` : `subir unos ${idealKg} kg/semana`;
    const action = suggestion.kcal > 0 ? `subir ${suggestion.kcal}` : `bajar ${Math.abs(suggestion.kcal)}`;
    return `En los últimos ${trend.spanDays} días tu peso va a ${rate}. Para ${g.phrase} buscamos ${dir}, así que te proponemos ${action} kcal al día. Las raciones de tu plan se ajustan solas.`;
  };

  // Etiquetas del objetivo concreto en el resumen y el perfil.
  const baseDashboard = renderDashboard;
  renderDashboard = function () {
    baseDashboard.apply(this, arguments);
    const chip = document.querySelector("#dashboard-content .goal-chip");
    const g = GOAL_TYPES[goalTypeId(state.profile)];
    if (chip && g) chip.textContent = `${g.emoji} ${g.label}`;
  };

  const basePerfil = renderPerfil;
  renderPerfil = function () {
    basePerfil.apply(this, arguments);
    const h4 = document.querySelector("#perfil-content .profile-hero h4");
    const g = GOAL_TYPES[goalTypeId(state.profile)];
    if (h4 && g) h4.textContent = `${g.emoji} ${g.label}`;
  };

  // Cambiar de objetivo concreto invalida un ajuste calculado para el anterior.
  const form = goalForm();
  form.addEventListener("submit", () => {
    if (!state.profile || !form.goalType) return;
    const next = form.goalType.value || GOAL_DEFAULT_TYPE[form.goal.value];
    if (goalTypeId(state.profile) !== next) {
      state.calorieAdjust = 0;
      state.adjustDecisionAt = null;
    }
  }, true);
}

/* ---------- Estilos ---------- */

const GOALS_CSS = `
.goal-label .choice-grid { display: none; }
.goal-picker { margin-top: -4px; }
.goal-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
.goal-type-card { display: flex; align-items: center; gap: 8px; text-align: left; padding: 10px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: var(--card); color: var(--ink); font: inherit; cursor: pointer; min-width: 0; transition: transform .1s, border-color .15s; }
.goal-type-card:active { transform: scale(.97); }
.goal-type-card.selected { border-color: var(--coral); background: var(--coral-light); }
.gt-emoji { font-size: 22px; flex: none; }
.gt-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.gt-text b { font-size: 13.5px; }
.gt-text small { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.goal-text-label { display: block; margin: 14px 0 6px; font-size: 13.5px; font-weight: 600; }
#goal-text { width: 100%; box-sizing: border-box; resize: vertical; min-height: 54px; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: var(--card); color: var(--ink); font: inherit; font-size: 14px; }
#goal-text:focus { outline: none; border-color: var(--coral); }
.goal-interpret { margin-top: 8px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg); border: 1px solid var(--border); font-size: 13px; line-height: 1.45; }
.goal-interpret p { margin: 0; }
.goal-interpret p + p, .gi-choices + p { margin-top: 8px; }
.gi-sub { margin-top: 6px !important; color: var(--muted); }
.gi-choices { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.gi-choice { padding: 6px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--ink); font: inherit; font-size: 12.5px; cursor: pointer; }
.gi-note.warn { color: var(--ink); background: var(--amber-light); padding: 8px 10px; border-radius: var(--radius-sm); }
.gi-note.care { color: var(--ink); background: var(--coral-light); padding: 8px 10px; border-radius: var(--radius-sm); }
.gi-note.info { color: var(--muted); }
@media (max-width: 360px) { .goal-type-grid { grid-template-columns: 1fr; } }
`;

function injectGoalsCss() {
  const style = document.createElement("style");
  style.id = "goals-css";
  style.textContent = GOALS_CSS;
  document.head.appendChild(style);
}

/* ---------- Inglés ---------- */

const GOALS_EN = {
  "Perder grasa": "Lose fat", "Bajar peso cuidando el músculo": "Lose weight while keeping muscle",
  "Definir": "Get lean", "Marcar abdominales y que se note el músculo": "Visible abs and muscle definition",
  "Tonificar": "Tone up", "Perder grasa y ganar músculo a la vez": "Lose fat and build muscle at the same time",
  "Mantenerme": "Stay the same", "Seguir como estoy, comiendo bien": "Keep my weight, eating well",
  "Ganar músculo": "Build muscle", "Más volumen con poca grasa": "More size with little fat",
  "Subir de peso": "Gain weight", "Me cuesta engordar": "I struggle to put on weight",
  "Ganar fuerza": "Get stronger", "Levantar más en el gimnasio": "Lift more at the gym",
  "Resistencia": "Endurance", "Correr, bici, nadar, maratón": "Running, cycling, swimming, marathon",
  "Rendir en mi deporte": "Perform in my sport", "Fútbol, pádel, competición": "Football, padel, competition",
  "Comer más sano": "Eat healthier", "Más energía y mejor salud": "More energy and better health",
  "Músculo con la edad": "Muscle as I age", "Seguir fuerte a partir de los 50": "Stay strong after 50",
  "¿Otro objetivo? Escríbelo con tus palabras (opcional)": "Another goal? Write it in your own words (optional)",
  "Ej.: quiero correr una media maratón en primavera": "E.g. I want to run a half marathon in spring",
  "No lo hemos entendido del todo. ¿Se parece a alguno de estos?": "We didn't quite get that. Is it like one of these?",
  "¿O te refieres a otro?": "Or do you mean another one?",
  "Lo entendemos como": "We read it as",
};

document.addEventListener("DOMContentLoaded", () => {
  if (typeof SOURCES !== "undefined") Object.assign(SOURCES, GOAL_SOURCES);
  if (typeof I18N !== "undefined" && I18N.en) Object.assign(I18N.en.ui, GOALS_EN);
  injectGoalsCss();
  installGoalHooks();
  injectGoalPicker();
});
