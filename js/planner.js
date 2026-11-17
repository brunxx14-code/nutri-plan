/* Generación del plan semanal, lista de la compra y ajuste a presupuesto. */

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MEAL_SLOTS = [
  { key: "desayuno", label: "Desayuno", mealType: "desayuno" },
  { key: "comida", label: "Comida", mealType: "principal" },
  { key: "cena", label: "Cena", mealType: "principal" },
  { key: "merienda", label: "Merienda", mealType: "merienda" },
];

function recipeMacros(recipe) {
  let kcal = 0, prot = 0, carbs = 0, fat = 0, cost = 0;
  for (const [foodId, qty] of recipe.ingredients) {
    const food = FOODS[foodId];
    const factor = food.unit === "ud" ? qty : qty / 100;
    kcal += food.kcal * factor;
    prot += food.prot * factor;
    carbs += food.carbs * factor;
    fat += food.fat * factor;
    cost += food.price * factor;
  }
  return { kcal, prot, carbs, fat, cost };
}

// Caché de macros/coste por receta (no cambian en la sesión)
const RECIPE_CACHE = {};
function getRecipeInfo(recipeId) {
  if (!RECIPE_CACHE[recipeId]) {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    RECIPE_CACHE[recipeId] = { recipe, ...recipeMacros(recipe) };
  }
  return RECIPE_CACHE[recipeId];
}

function matchesProfile(recipe, profile) {
  const { dietType, dislikes } = profile;
  if (dietType === "vegetariano" && !recipe.tags.includes("vegetariano")) return false;
  if (dietType === "vegano" && !recipe.tags.includes("vegano")) return false;
  if (dislikes && dislikes.length) {
    const ingredientIds = recipe.ingredients.map(([id]) => id);
    if (ingredientIds.some((id) => dislikes.includes(id))) return false;
  }
  return true;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRotation(pool, count) {
  // Devuelve `count` elementos recorriendo el pool barajado, evitando repetir
  // el mismo plato en posiciones consecutivas cuando hay más de una opción.
  if (pool.length === 0) return [];
  let shuffled = shuffle(pool);
  const result = [];
  let idx = 0;
  for (let i = 0; i < count; i++) {
    if (idx >= shuffled.length) {
      shuffled = shuffle(pool);
      idx = 0;
    }
    let candidate = shuffled[idx];
    if (result.length && candidate === result[result.length - 1] && pool.length > 1) {
      idx++;
      if (idx >= shuffled.length) {
        shuffled = shuffle(pool);
        idx = 0;
      }
      candidate = shuffled[idx];
    }
    result.push(candidate);
    idx++;
  }
  return result;
}

/* Las recetas vienen con una ración estándar. Para que el plan cuadre con las
   calorías de cada persona escalamos todas las raciones de un día por el mismo
   factor, acotado para que las cantidades sigan siendo realistas. */
const PORTION_MIN = 0.6;
const PORTION_MAX = 1.8;

function dayPortionFactor(day, targetKcal) {
  const kcal = MEAL_SLOTS.reduce((sum, slot) => sum + getRecipeInfo(day[slot.key]).kcal, 0);
  if (!targetKcal || !kcal) return 1;
  return Math.min(PORTION_MAX, Math.max(PORTION_MIN, targetKcal / kcal));
}

function recipePool(profile, mealType) {
  return RECIPES.filter((r) => r.mealType === mealType && matchesProfile(r, profile)).map((r) => r.id);
}

function generateWeeklyPlan(profile, targetKcal, favorites = []) {
  const poolByType = { desayuno: [], principal: [], merienda: [] };
  for (const recipe of RECIPES) {
    if (matchesProfile(recipe, profile)) poolByType[recipe.mealType].push(recipe.id);
  }
  // Si las restricciones dejan algún hueco vacío, relajamos los "dislikes" para no bloquear la app.
  for (const type of Object.keys(poolByType)) {
    if (poolByType[type].length === 0) {
      poolByType[type] = RECIPES.filter((r) => r.mealType === type &&
        (profile.dietType === "omnivoro" || r.tags.includes(profile.dietType))).map((r) => r.id);
    }
    if (poolByType[type].length === 0) {
      poolByType[type] = RECIPES.filter((r) => r.mealType === type).map((r) => r.id);
    }
  }

  // las favoritas cuentan doble: salen más a menudo sin repetir el plan entero
  for (const type of Object.keys(poolByType)) {
    const favs = poolByType[type].filter((id) => favorites.includes(id));
    if (favs.length < poolByType[type].length) poolByType[type] = [...poolByType[type], ...favs];
  }

  const plan = DAYS.map(() => ({}));
  for (const slot of MEAL_SLOTS) {
    const picks = pickRotation(poolByType[slot.mealType], DAYS.length);
    DAYS.forEach((_, i) => { plan[i][slot.key] = picks[i]; });
  }

  avoidSameLunchAndDinner(plan);

  if (profile.weeklyBudget) fitToBudget(plan, profile, poolByType, targetKcal);
  balanceProtein(plan, profile, poolByType, targetKcal);
  return plan;
}

function proteinShare(recipeId) {
  const info = getRecipeInfo(recipeId);
  return (info.prot * 4) / info.kcal;
}

function dayProtein(day, targetKcal) {
  const factor = dayPortionFactor(day, targetKcal);
  return MEAL_SLOTS.reduce((sum, slot) => sum + getRecipeInfo(day[slot.key]).prot * factor, 0);
}

/* Las raciones se ajustan a las calorías, pero eso no garantiza llegar a la
   proteína que necesita cada objetivo (ISSN 2017). Si un día se queda corto,
   cambiamos el plato con menos proteína por otro del mismo tipo que tenga
   más, sin salirnos del presupuesto y sin repetir siempre el mismo. */
const PROTEIN_MIN_SHARE_GAIN = 0.04;

function balanceProtein(plan, profile, poolByType, targetKcal) {
  const targetProtein = calcTargets(profile).protein;
  if (!targetProtein) return;
  const uses = {};
  for (const day of plan) for (const slot of MEAL_SLOTS) uses[day[slot.key]] = (uses[day[slot.key]] || 0) + 1;

  for (const day of plan) {
    for (let guard = 0; guard < MEAL_SLOTS.length; guard++) {
      if (dayProtein(day, targetKcal) >= targetProtein * 0.95) break;
      const costBefore = profile.weeklyBudget ? planWeeklyCost(plan, targetKcal) : 0;
      let best = null;
      for (const slot of MEAL_SLOTS) {
        const current = day[slot.key];
        const partner = slot.key === "comida" ? day.cena : slot.key === "cena" ? day.comida : null;
        for (const id of new Set(poolByType[slot.mealType])) {
          if (id === current || id === partner) continue;
          const gain = proteinShare(id) - proteinShare(current);
          if (gain < PROTEIN_MIN_SHARE_GAIN) continue;
          if (profile.weeklyBudget) {
            day[slot.key] = id;
            const costAfter = planWeeklyCost(plan, targetKcal);
            day[slot.key] = current;
            if (costAfter > profile.weeklyBudget && costAfter > costBefore) continue;
          }
          const score = gain - (uses[id] || 0) * 0.03; // variedad: penaliza lo ya repetido
          if (!best || score > best.score) best = { slotKey: slot.key, id, score };
        }
      }
      if (!best) break;
      uses[day[best.slotKey]]--;
      day[best.slotKey] = best.id;
      uses[best.id] = (uses[best.id] || 0) + 1;
    }
  }
}

/* Comida y cena salen del mismo grupo de recetas: si un día coinciden,
   intercambiamos esa cena con la de otro día donde no choque. */
function avoidSameLunchAndDinner(plan) {
  for (let i = 0; i < plan.length; i++) {
    if (plan[i].comida !== plan[i].cena) continue;
    const j = plan.findIndex((day, k) => k !== i && day.cena !== plan[i].comida && plan[i].cena !== day.comida);
    if (j !== -1) [plan[i].cena, plan[j].cena] = [plan[j].cena, plan[i].cena];
  }
}

function planWeeklyCost(plan, targetKcal) {
  let total = 0;
  for (const day of plan) {
    const factor = dayPortionFactor(day, targetKcal);
    for (const slot of MEAL_SLOTS) {
      total += getRecipeInfo(day[slot.key]).cost * factor;
    }
  }
  return total;
}

function fitToBudget(plan, profile, poolByType, targetKcal) {
  const budget = profile.weeklyBudget;
  let guard = 0;
  while (planWeeklyCost(plan, targetKcal) > budget && guard < 60) {
    guard++;
    // Busca la receta más cara actualmente usada en el plan.
    let worst = null;
    for (const day of plan) {
      const factor = dayPortionFactor(day, targetKcal);
      for (const slot of MEAL_SLOTS) {
        const info = getRecipeInfo(day[slot.key]);
        const cost = info.cost * factor;
        if (!worst || cost > worst.scaledCost) worst = { ...info, scaledCost: cost, slotKey: slot.key, mealType: slot.mealType, day };
      }
    }
    if (!worst) break;
    // Busca la alternativa más barata del mismo tipo de comida.
    const alternatives = poolByType[worst.mealType]
      .map((id) => getRecipeInfo(id))
      .sort((a, b) => a.cost - b.cost);
    const cheapest = alternatives[0];
    if (!cheapest || cheapest.cost >= worst.cost) break; // no hay forma de abaratar más
    worst.day[worst.slotKey] = cheapest.recipe.id;
  }
}

/* targetKcal puede ser un número (igual todos los días) o una lista con el
   objetivo de cada día, cuando la semana se ha reajustado. */
function buildShoppingList(plan, targetKcal) {
  const totals = {}; // foodId -> cantidad
  for (const [i, day] of plan.entries()) {
    const factor = dayPortionFactor(day, Array.isArray(targetKcal) ? targetKcal[i] : targetKcal);
    for (const slot of MEAL_SLOTS) {
      const recipe = getRecipeInfo(day[slot.key]).recipe;
      for (const [foodId, qty] of recipe.ingredients) {
        totals[foodId] = (totals[foodId] || 0) + qty * factor;
      }
    }
  }
  const bySection = {};
  let grandTotal = 0;
  for (const [foodId, qty] of Object.entries(totals)) {
    const food = FOODS[foodId];
    const factor = food.unit === "ud" ? qty : qty / 100;
    const cost = food.price * factor;
    grandTotal += cost;
    if (!bySection[food.section]) bySection[food.section] = [];
    bySection[food.section].push({ foodId, name: food.name, qty, unit: food.unit, cost });
  }
  for (const section of Object.keys(bySection)) {
    bySection[section].sort((a, b) => a.name.localeCompare(b.name));
  }
  return { bySection, grandTotal };
}

/* Platos que pueden sustituir a uno del plan: mismo momento del día, que
   encajen con la dieta del usuario, ordenados por parecido en el reparto de
   macros (la cantidad la ajustan las raciones, así que importa la proporción). */
function swapAlternatives(recipeId, profile, limit = 5) {
  const current = getRecipeInfo(recipeId);
  const share = (info) => ({
    prot: (info.prot * 4) / info.kcal,
    carbs: (info.carbs * 4) / info.kcal,
    fat: (info.fat * 9) / info.kcal,
  });
  const target = share(current);
  return recipePool(profile, current.recipe.mealType)
    .filter((id) => id !== recipeId)
    .map((id) => {
      const info = getRecipeInfo(id);
      const s = share(info);
      const distance = Math.abs(s.prot - target.prot) * 2 + Math.abs(s.carbs - target.carbs) + Math.abs(s.fat - target.fat);
      return { info, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((a) => a.info);
}

/* Explica por qué esta receta encaja en el plan de esta persona, con las
   fuentes que lo respaldan. Devuelve una lista de { text, refs }.
   factor = cuánto se ha escalado la ración para ese día. */
function explainRecipe(recipe, info, profile, slotLabel, factor = 1) {
  const prot = Math.round(info.prot * factor);
  const carbs = Math.round(info.carbs * factor);
  const fat = Math.round(info.fat * factor);
  const proteinKcalShare = (info.prot * 4) / info.kcal;
  const items = [];
  const add = (text, refs = []) => items.push({ text, refs });

  if (profile.goal === "perder") {
    if (proteinKcalShare >= 0.25) {
      add(`Para perder grasa, este plato te da ${prot} g de proteína con pocas calorías: en déficit, la proteína ayuda a no perder músculo y es lo que más sacia.`, ["leidy", "helms"]);
    } else {
      add(`Este plato tiene menos proteína (${prot} g), así que el resto de comidas de tu día la compensan. Su ración está ajustada para que el día cuadre con tu déficit.`);
    }
  } else if (profile.goal === "ganar") {
    add(`Para ganar músculo, este plato te da ${prot} g de proteína y ${carbs} g de carbohidratos: la proteína es la materia prima del músculo y los carbohidratos te dan energía para entrenar fuerte.`, ["jager", "acsm"]);
  } else {
    add(`Mantiene un buen equilibrio entre proteína (${prot} g), carbohidratos (${carbs} g) y grasas (${fat} g), acorde a tu objetivo de mantenimiento.`, ["who"]);
  }

  // Dosis de proteína por comida: ~0,4 g/kg en las comidas principales.
  if (recipe.mealType !== "merienda" && profile.weightKg) {
    const ref = proteinReferenceWeight(profile).kg;
    const dose = Math.round(Math.max(20, ref * 0.4) / 5) * 5;
    if (prot >= dose * 0.8) {
      add(`Con ${prot} g llegas a la cantidad de proteína por comida (unos ${dose} g para ti) que mejor aprovecha el músculo.`, ["schoenfeld_aragon"]);
    } else if (profile.goal !== "mantener") {
      add(`Para aprovechar mejor la proteína conviene llegar a unos ${dose} g por comida; si te apetece, acompáñalo de un yogur o un vaso de leche.`, ["schoenfeld_aragon"]);
    }
  }

  const mainIngredient = [...recipe.ingredients]
    .map(([id, qty]) => ({ id, qty, food: FOODS[id] }))
    .filter((it) => ["proteina_magra", "proteina_grasa", "legumbre"].includes(it.food.cat))
    .sort((a, b) => {
      const factorA = a.food.unit === "ud" ? a.qty : a.qty / 100;
      const factorB = b.food.unit === "ud" ? b.qty : b.qty / 100;
      return b.food.prot * factorB - a.food.prot * factorA;
    })[0];

  if (mainIngredient) {
    const role = FOOD_ROLES[mainIngredient.food.cat];
    add(`${mainIngredient.food.name} es tu ${role.label.toLowerCase()} principal aquí: ${role.why.toLowerCase()}`, role.refs);
  }

  const hasVeg = recipe.ingredients.some(([id]) => ["verdura", "legumbre", "fruta"].includes(FOODS[id].cat));
  if (hasVeg) {
    add("Lleva verdura, fruta o legumbre: la OMS recomienda al menos 400 g al día de frutas y verduras, y la fibra que aportan se asocia con menos riesgo cardiovascular y de diabetes.", ["who", "reynolds"]);
  }

  return items;
}

function formatQty(qty, unit) {
  if (unit === "ud") return `${Math.round(qty)} ud`;
  if (unit === "ml") return qty >= 1000 ? `${(qty / 1000).toFixed(2)} l` : `${Math.round(qty)} ml`;
  return qty >= 1000 ? `${(qty / 1000).toFixed(2)} kg` : `${Math.round(qty)} g`;
}
