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

function generateWeeklyPlan(profile, targetKcal) {
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

  const plan = DAYS.map(() => ({}));
  for (const slot of MEAL_SLOTS) {
    const picks = pickRotation(poolByType[slot.mealType], DAYS.length);
    DAYS.forEach((_, i) => { plan[i][slot.key] = picks[i]; });
  }

  if (profile.weeklyBudget) fitToBudget(plan, profile, poolByType, targetKcal);
  return plan;
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

function buildShoppingList(plan, targetKcal) {
  const totals = {}; // foodId -> cantidad
  for (const day of plan) {
    const factor = dayPortionFactor(day, targetKcal);
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

/* Explica, en 2 frases, por qué esta receta encaja en el plan de esta persona. */
function explainRecipe(recipe, info, profile, slotLabel) {
  const proteinKcalShare = (info.prot * 4) / info.kcal;
  const sentences = [];

  if (profile.goal === "perder") {
    sentences.push(
      proteinKcalShare > 0.25
        ? `Como tu objetivo es perder grasa, en la ${slotLabel.toLowerCase()} priorizamos platos con bastante proteína (${Math.round(info.prot)} g): ayuda a saciarte y a conservar músculo mientras comes por debajo de tu gasto.`
        : `Es una opción ligera (${Math.round(info.kcal)} kcal) que encaja con el déficit calórico que necesitas para perder grasa sin pasar hambre.`
    );
  } else if (profile.goal === "ganar") {
    sentences.push(
      `Como tu objetivo es ganar músculo, esta receta aporta ${Math.round(info.prot)} g de proteína y ${Math.round(info.carbs)} g de carbohidratos: la combinación que ayuda a recuperarte del entrenamiento y a crecer.`
    );
  } else {
    sentences.push(
      `Mantiene un buen equilibrio entre proteína (${Math.round(info.prot)} g), carbohidratos (${Math.round(info.carbs)} g) y grasas (${Math.round(info.fat)} g), acorde a tu objetivo de mantenimiento.`
    );
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
    sentences.push(`${mainIngredient.food.name} es tu ${role.label.toLowerCase()} principal aquí: ${role.why.toLowerCase()}`);
  }

  return sentences;
}

function formatQty(qty, unit) {
  if (unit === "ud") return `${Math.round(qty)} ud`;
  if (unit === "ml") return qty >= 1000 ? `${(qty / 1000).toFixed(2)} l` : `${Math.round(qty)} ml`;
  return qty >= 1000 ? `${(qty / 1000).toFixed(2)} kg` : `${Math.round(qty)} g`;
}
