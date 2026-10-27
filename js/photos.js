/* Fotos de Unsplash (licencia libre de Unsplash: uso gratuito, sin
   atribución obligatoria). Se cargan directamente desde su CDN. Si una
   foto no carga, se muestra el fondo de color con el emoji del plato. */

const RECIPE_PHOTOS = {
  avena_platano: "1550461716-dbf266b2a8a7",
  tortilla_claras: "1677844592730-ce9c936d8f1a",
  yogur_manzana: "1603199477811-71c45c02f10d",
  tostada_aguacate: "1525351484163-7529414344d8",
  batido_avena: "1505252585461-04db1eb84625",
  pollo_arroz_brocoli: "1587995631109-2a8588e991da",
  salmon_boniato: "1519708227418-c8fd9a32b7a2",
  pasta_atun: "1603661688298-870c8958ebf8",
  lentejas_estofadas: "1648455320791-a667c8aab7e4",
  garbanzos_espinacas: "1654199903998-e49181b41a95",
  ternera_calabacin: "1546069901-55d1670321aa",
  merluza_patata: "1676300185165-3f543c1fcb72",
  tofu_quinoa: "1546069901-d5bfd2cbfb1f",
  gambas_ajillo: "1579783411296-c908953b2dcd",
  pavo_boniato: "1606728035253-49e8a23146de",
  ensalada_garbanzos: "1688807450144-9d10de5eb913",
  yogur_miel_almendras: "1633893215265-4763142f9b57",
  manzana_cacahuete: "1564988208558-9270de7c5848",
  queso_almendras: "1633179963862-72c64dc6d30d",
  batido_platano: "1685967836529-b0e8d6938227",
};

const ARTICLE_CATEGORY_PHOTOS = {
  "Nutrición básica": "1512621776951-a57141f2eefd",
  "Digestión": "1498837167922-ddd27525d352",
  "Rendimiento": "1571019613454-1cb2f99b2d8b",
  "Mentalidad": "1518611012118-696072aa579a",
  "Hábitos": "1546069901-ba9599a7e63c",
};

const GOAL_PHOTOS = {
  perder: "1571019613454-1cb2f99b2d8b",
  mantener: "1518611012118-696072aa579a",
  ganar: "1517836357463-d25dfeac3438",
};

function unsplashUrl(id, width) {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=70`;
}

/* <img> con carga diferida y aparición suave. `fallback` es el emoji que se
   ve sobre el fondo de color mientras carga o si la foto falla. */
function photoHtml(id, { width = 400, alt = "", className = "", fallback = "🍽️" } = {}) {
  const img = id
    ? `<img src="${unsplashUrl(id, width)}" srcset="${unsplashUrl(id, width * 2)} 2x" alt="${alt}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.remove()">`
    : "";
  return `<div class="photo ${className}"><span class="photo-fallback" aria-hidden="true">${fallback}</span>${img}</div>`;
}

function recipePhoto(recipeId, opts) {
  return photoHtml(RECIPE_PHOTOS[recipeId], opts);
}
