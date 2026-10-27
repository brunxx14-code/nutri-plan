/* Deportes con su equivalente metabólico (MET), usado para calcular una media
   de calorías quemadas: kcal/min = MET × 3.5 × peso(kg) / 200. */
const SPORTS = {
  running:   { label: "Correr / running", met: 9.8 },
  caminar:   { label: "Caminar a paso ligero", met: 3.8 },
  ciclismo:  { label: "Ciclismo", met: 7.5 },
  natacion:  { label: "Natación", met: 8.0 },
  pesas:     { label: "Musculación / pesas", met: 6.0 },
  futbol:    { label: "Fútbol", met: 7.0 },
  baloncesto:{ label: "Baloncesto", met: 6.5 },
  tenis:     { label: "Tenis / pádel", met: 7.0 },
  yoga:      { label: "Yoga / pilates", met: 3.0 },
  hiit:      { label: "Crossfit / HIIT", met: 8.0 },
  spinning:  { label: "Spinning / ciclo indoor", met: 8.5 },
  boxeo:     { label: "Boxeo", met: 9.0 },
  senderismo:{ label: "Senderismo", met: 6.0 },
  otro:      { label: "Otro deporte", met: 5.0 },
};

/* Informes breves sobre nutrición. Un subconjunto rota cada semana (ver
   getWeeklyArticles en app.js) para que siempre haya contenido nuevo. */
const ARTICLES = [
  {
    id: "proteina_clave", category: "Nutrición básica", readMins: 3,
    title: "Por qué la proteína importa en cada comida",
    teaser: "No es solo cosa de culturistas: repartirla a lo largo del día mejora la saciedad y protege tu masa muscular.",
    body: [
      "La proteína cumple un papel distinto al de los carbohidratos o las grasas: aporta los aminoácidos que el cuerpo usa para reparar tejido, producir enzimas y mantener el músculo. Cuando se come poca, especialmente en déficit calórico, el organismo tiende a usar también tejido muscular como fuente de energía.",
      "Repartirla en varias comidas, en lugar de concentrarla toda en la cena, ayuda a que cada ración sea más saciante y facilita que el cuerpo la aproveche mejor a lo largo del día.",
      "No hace falta obsesionarse con el gramaje exacto en cada plato: basta con que la mayoría de tus comidas principales incluyan una fuente clara de proteína — carne, pescado, huevo, lácteos o legumbres.",
    ],
  },
  {
    id: "fibra_olvidada", category: "Digestión", readMins: 3,
    title: "Fibra: la gran olvidada de la dieta",
    teaser: "La mayoría de las dietas occidentales se quedan por debajo de la fibra recomendada, y eso tiene consecuencias más allá del tránsito intestinal.",
    body: [
      "La fibra no se digiere como tal, pero alimenta a las bacterias intestinales, regula el tránsito y ralentiza la absorción de azúcar en sangre, lo que ayuda a mantener la energía más estable durante el día.",
      "Las verduras, legumbres, fruta entera y cereales integrales son las principales fuentes. Sustituir el arroz blanco por integral, o añadir una ración extra de verdura en la comida principal, ya marca una diferencia notable a lo largo de la semana.",
      "Una señal práctica: si tu plato tiene color y textura variada, y no solo una masa uniforme de carbohidrato refinado, es muy probable que también tenga buena cantidad de fibra.",
    ],
  },
  {
    id: "hidratacion", category: "Rendimiento", readMins: 2,
    title: "Hidratación y rendimiento, dentro y fuera del gimnasio",
    teaser: "Perder solo un 2% de tu peso corporal en agua ya puede notarse en tu energía y tu concentración.",
    body: [
      "El agua interviene en casi todos los procesos metabólicos: transporta nutrientes, regula la temperatura corporal y lubrica las articulaciones durante el ejercicio. Una deshidratación leve ya se asocia con más fatiga percibida y peor rendimiento físico y mental.",
      "No existe una cifra válida para todo el mundo (depende del peso, el clima y cuánto entrenas), pero una guía simple es beber de forma regular durante el día y no esperar a tener sed, que ya es una señal tardía.",
      "Si entrenas con intensidad, presta atención especial los días de más calor o sudoración: ahí es donde más fácil es acumular un déficit de líquidos sin notarlo.",
    ],
  },
  {
    id: "no_alimentos_prohibidos", category: "Mentalidad", readMins: 3,
    title: "El mito de los alimentos \"prohibidos\"",
    teaser: "Etiquetar comidas como buenas o malas suele generar más ansiedad con la comida, no menos.",
    body: [
      "Ningún alimento aislado determina si tu dieta es saludable o no: lo que importa es el patrón general a lo largo de semanas y meses. Comer un dulce un día no arruina un objetivo, igual que una ensalada tampoco lo garantiza por sí sola.",
      "Prohibirte alimentos por completo suele generar el efecto contrario al deseado: más deseo por ellos y, a menudo, un atracón posterior cuando la fuerza de voluntad se agota.",
      "Un enfoque más sostenible es pensar en proporciones: que la mayoría de tus comidas se construyan alrededor de proteína, verdura y carbohidratos de calidad, dejando espacio flexible para el resto sin cargo de conciencia.",
    ],
  },
  {
    id: "meal_prep", category: "Hábitos", readMins: 2,
    title: "Por qué planificar tus comidas reduce el estrés",
    teaser: "La mayoría de las decisiones de comida poco saludables ocurren cuando no hay un plan y el hambre ya apremia.",
    body: [
      "Cuando llegas con hambre real y sin nada decidido, el cerebro prioriza la opción más rápida y calórica disponible: es una respuesta biológica, no una falta de voluntad.",
      "Tener la compra hecha y una idea clara de qué vas a comer cada día elimina ese punto de fricción: ya no decides con hambre, decides con calma, normalmente unos días antes.",
      "No hace falta cocinar los siete días de golpe: con tener claro el plan y los ingredientes a mano, la ejecución del día a día se vuelve mucho más simple.",
    ],
  },
  {
    id: "azucares_añadidos", category: "Nutrición básica", readMins: 3,
    title: "Azúcares añadidos: cómo detectarlos",
    teaser: "No siempre está en la lista como \"azúcar\": a menudo se esconde bajo otros nombres en la etiqueta.",
    body: [
      "El azúcar añadido aparece en el etiquetado bajo muchos nombres (jarabe de glucosa, dextrosa, concentrado de zumo, maltodextrina...) que no siempre son fáciles de reconocer a simple vista.",
      "Una forma práctica de detectarlo es mirar la lista de ingredientes, no solo la tabla nutricional: si varios de los primeros ingredientes son formas de azúcar, por mucho que el producto se anuncie como saludable, el contenido real dice otra cosa.",
      "La fruta entera no entra en esta categoría: el azúcar que contiene va acompañado de fibra y agua, lo que cambia cómo se absorbe en comparación con un azúcar añadido aislado.",
    ],
  },
  {
    id: "grasas_saludables", category: "Nutrición básica", readMins: 2,
    title: "El papel de las grasas saludables",
    teaser: "Durante años se demonizó a las grasas en bloque, pero no todas cumplen la misma función.",
    body: [
      "Las grasas son esenciales para producir hormonas, absorber vitaminas liposolubles (A, D, E, K) y mantener la saciedad entre comidas. Eliminarlas por completo de la dieta suele ser contraproducente.",
      "La clave está en el tipo: el aceite de oliva, el aguacate, los frutos secos y el pescado azul aportan grasas insaturadas asociadas a mejor salud cardiovascular, mientras que los ultraprocesados suelen concentrar grasas de peor calidad.",
      "No se trata de contar gramos de grasa de forma obsesiva, sino de priorizar estas fuentes frente a los fritos y procesados cuando puedas elegir.",
    ],
  },
  {
    id: "comer_despacio", category: "Hábitos", readMins: 2,
    title: "Comer despacio y la sensación de saciedad",
    teaser: "El cerebro tarda varios minutos en recibir la señal de que ya has comido suficiente.",
    body: [
      "La saciedad no es inmediata: el cuerpo necesita entre 15 y 20 minutos para procesar las señales hormonales que indican que ya has comido suficiente. Comer muy rápido suele traducirse en comer más de lo que realmente necesitas.",
      "Masticar más despacio, dejar los cubiertos entre bocado y bocado, o comer sin pantallas de por medio, son formas sencillas de darle tiempo a esa señal para llegar.",
      "Es un ajuste pequeño, pero con el tiempo puede marcar una diferencia real en cuánta cantidad necesitas para sentirte satisfecho.",
    ],
  },
  {
    id: "sueño_apetito", category: "Rendimiento", readMins: 3,
    title: "Sueño, cortisol y apetito",
    teaser: "Dormir mal no solo te cansa: también altera las hormonas que regulan el hambre.",
    body: [
      "La falta de sueño reduce los niveles de leptina (la hormona que indica saciedad) y aumenta la grelina (la que estimula el apetito). El resultado práctico: más hambre, especialmente por alimentos densos en calorías.",
      "También eleva el cortisol, lo que puede favorecer la retención de grasa abdominal y dificultar la recuperación muscular tras el entrenamiento.",
      "Cuidar la alimentación sin cuidar el sueño es remar a medias: dormir de forma consistente es, en la práctica, parte de la estrategia nutricional, no un tema aparte.",
    ],
  },
  {
    id: "micronutrientes", category: "Nutrición básica", readMins: 3,
    title: "No solo de macros vive el cuerpo",
    teaser: "Puedes cumplir tus macros a la perfección y aun así tener carencias de vitaminas y minerales.",
    body: [
      "Las calorías y los macronutrientes determinan tu energía y composición corporal, pero el cuerpo también necesita decenas de vitaminas y minerales en cantidades mucho menores: hierro, calcio, magnesio, vitamina D, entre otros.",
      "Una dieta basada en pocos alimentos repetidos, aunque cumpla las calorías objetivo, tiende a dejar huecos en micronutrientes concretos.",
      "La forma más simple de cubrirlos sin complicarte es variar las fuentes: distintos tipos de verdura, de proteína y de fruta a lo largo de la semana, en lugar de repetir siempre el mismo plato.",
    ],
  },
  {
    id: "timing_entrenamiento", category: "Rendimiento", readMins: 3,
    title: "¿Importa cuándo comes respecto al entrenamiento?",
    teaser: "El timing ayuda a rendir mejor en el momento, pero pesa menos que el total del día.",
    body: [
      "Comer carbohidratos y algo de proteína en las horas previas al entrenamiento ayuda a tener energía disponible y a rendir mejor en la sesión, sobre todo si es larga o intensa.",
      "Después de entrenar, una comida con proteína en las horas siguientes favorece la recuperación muscular, aunque la llamada \"ventana anabólica\" es más amplia de lo que se pensaba hace años: no hace falta comer en los primeros 30 minutos exactos.",
      "Lo que de verdad determina tus resultados a medio plazo es el total de kcal y proteína del día completo; el timing es una optimización fina, no la base de la estrategia.",
    ],
  },
  {
    id: "consistencia", category: "Mentalidad", readMins: 2,
    title: "La consistencia pesa más que la perfección",
    teaser: "Un plan que cumples el 80% de las semanas gana casi siempre a uno perfecto que abandonas al mes.",
    body: [
      "Los resultados nutricionales se acumulan en semanas y meses, no en comidas sueltas. Una comida fuera de plan tiene un impacto mínimo; lo que de verdad cambia las cosas es lo que haces de forma repetida.",
      "Buscar la perfección total suele ser frágil: basta un imprevisto para sentir que \"se ha roto todo\" y abandonar. Un plan flexible, que admite desviaciones puntuales sin descarrilar, se sostiene mucho más tiempo.",
      "La pregunta útil no es \"¿lo hice perfecto hoy?\" sino \"¿puedo mantener esto la mayoría de las semanas?\". Esa es la diferencia entre una dieta que dura una semana y un hábito que dura años.",
    ],
  },
];

/* Roles nutricionales: explican en una frase por qué un alimento está en el plan. */
const FOOD_ROLES = {
  proteina_magra:  { label: "Proteína magra",      why: "Mucha proteína con poca grasa: ayuda a saciarte y a mantener el músculo." },
  proteina_grasa:  { label: "Proteína + grasa",    why: "Proteína de calidad junto con grasas que aportan energía y sabor." },
  carbohidrato:    { label: "Carbohidrato complejo", why: "Energía de liberación lenta para rendir durante el día o al entrenar." },
  legumbre:        { label: "Legumbre",            why: "Proteína vegetal, fibra e hidratos de carbono, todo en uno." },
  verdura:         { label: "Verdura",             why: "Vitaminas, minerales y fibra con muy pocas calorías." },
  fruta:           { label: "Fruta",               why: "Vitaminas y azúcares naturales que dan energía rápida." },
  grasa_saludable: { label: "Grasa saludable",     why: "Grasas insaturadas necesarias para las hormonas y la saciedad." },
  lacteo:          { label: "Lácteo",              why: "Calcio y proteína de buena calidad." },
  condimento:      { label: "Condimento",          why: "Aporta sabor con un impacto calórico casi nulo." },
};

/* Catálogo de alimentos con precios de referencia estilo Mercadona.
   unit: 'g' | 'ml' | 'ud'. price = precio por 100g / 100ml / 1 unidad.
   Macros (kcal/prot/carbs/fat) referidas a la misma cantidad de referencia.
   cat = clave de FOOD_ROLES, usada para explicar el alimento en la app. */
const FOODS = {
  // Carnicería
  pollo_pechuga:   { name: "Pechuga de pollo",        section: "Carnicería", unit: "g",  price: 0.60, kcal: 165, prot: 31,  carbs: 0,    fat: 3.6, cat: "proteina_magra" },
  pollo_muslo:     { name: "Contramuslo de pollo",     section: "Carnicería", unit: "g",  price: 0.45, kcal: 179, prot: 19,  carbs: 0,    fat: 11,  cat: "proteina_grasa" },
  pavo_filete:     { name: "Filete de pavo",           section: "Carnicería", unit: "g",  price: 0.72, kcal: 104, prot: 24,  carbs: 0,    fat: 1,   cat: "proteina_magra" },
  ternera_picada:  { name: "Carne picada de ternera",  section: "Carnicería", unit: "g",  price: 0.85, kcal: 198, prot: 18,  carbs: 0,    fat: 14,  cat: "proteina_grasa" },
  lomo_cerdo:      { name: "Lomo de cerdo",            section: "Carnicería", unit: "g",  price: 0.65, kcal: 143, prot: 21,  carbs: 0,    fat: 6,   cat: "proteina_magra" },

  // Pescadería
  salmon:          { name: "Salmón fresco",            section: "Pescadería", unit: "g",  price: 1.40, kcal: 208, prot: 20,  carbs: 0,    fat: 13,  cat: "proteina_grasa" },
  merluza:         { name: "Merluza",                  section: "Pescadería", unit: "g",  price: 1.10, kcal: 86,  prot: 17,  carbs: 0,    fat: 1.3, cat: "proteina_magra" },
  gambas:          { name: "Gambas peladas",           section: "Pescadería", unit: "g",  price: 1.60, kcal: 85,  prot: 18,  carbs: 0.5,  fat: 1,   cat: "proteina_magra" },
  atun_lata:       { name: "Atún en conserva (lata)",  section: "Pescadería", unit: "ud", price: 1.00, kcal: 110, prot: 24,  carbs: 0,    fat: 1,   cat: "proteina_magra" },

  // Lácteos y huevos
  huevos:          { name: "Huevo",                    section: "Lácteos y huevos", unit: "ud", price: 0.23, kcal: 70,  prot: 6,   carbs: 0.6,  fat: 5,   cat: "proteina_grasa" },
  leche_semi:      { name: "Leche semidesnatada",       section: "Lácteos y huevos", unit: "ml", price: 0.09, kcal: 46,  prot: 3.2, carbs: 4.7,  fat: 1.6, cat: "lacteo" },
  yogur_griego:    { name: "Yogur griego natural",      section: "Lácteos y huevos", unit: "ud", price: 0.62, kcal: 121, prot: 8,   carbs: 5,    fat: 8,   cat: "lacteo" },
  yogur_natural:   { name: "Yogur natural",             section: "Lácteos y huevos", unit: "ud", price: 0.30, kcal: 61,  prot: 4,   carbs: 6,    fat: 2.5, cat: "lacteo" },
  queso_fresco:    { name: "Queso fresco batido 0%",    section: "Lácteos y huevos", unit: "g",  price: 0.35, kcal: 45,  prot: 8,   carbs: 4,    fat: 0,   cat: "lacteo" },
  queso_curado:    { name: "Queso curado",              section: "Lácteos y huevos", unit: "g",  price: 1.60, kcal: 400, prot: 25,  carbs: 0,    fat: 33,  cat: "lacteo" },

  // Despensa
  arroz:           { name: "Arroz blanco",              section: "Despensa", unit: "g", price: 0.18, kcal: 349, prot: 7,  carbs: 77, fat: 0.6, cat: "carbohidrato" },
  pasta:           { name: "Pasta (macarrones)",        section: "Despensa", unit: "g", price: 0.17, kcal: 350, prot: 12, carbs: 71, fat: 1.5, cat: "carbohidrato" },
  avena:           { name: "Copos de avena",            section: "Despensa", unit: "g", price: 0.22, kcal: 372, prot: 13, carbs: 61, fat: 7,   cat: "carbohidrato" },
  quinoa:          { name: "Quinoa",                    section: "Despensa", unit: "g", price: 0.60, kcal: 368, prot: 14, carbs: 64, fat: 6,   cat: "carbohidrato" },
  lentejas:        { name: "Lentejas secas",            section: "Despensa", unit: "g", price: 0.20, kcal: 353, prot: 24, carbs: 60, fat: 1,   cat: "legumbre" },
  garbanzos:       { name: "Garbanzos cocidos (bote)",  section: "Despensa", unit: "g", price: 0.25, kcal: 121, prot: 7,  carbs: 18, fat: 2,   cat: "legumbre" },
  pan_integral:    { name: "Pan integral",              section: "Despensa", unit: "g", price: 0.30, kcal: 250, prot: 9,  carbs: 45, fat: 3.5, cat: "carbohidrato" },
  aceite_oliva:    { name: "Aceite de oliva virgen extra", section: "Despensa", unit: "ml", price: 0.90, kcal: 884, prot: 0, carbs: 0, fat: 100, cat: "grasa_saludable" },
  almendras:       { name: "Almendras crudas",          section: "Despensa", unit: "g", price: 1.20, kcal: 579, prot: 21, carbs: 22, fat: 50,  cat: "grasa_saludable" },
  crema_cacahuete: { name: "Crema de cacahuete",        section: "Despensa", unit: "g", price: 0.90, kcal: 588, prot: 25, carbs: 20, fat: 50,  cat: "grasa_saludable" },
  tofu:            { name: "Tofu firme",                section: "Despensa", unit: "g", price: 0.45, kcal: 76,  prot: 8,  carbs: 1.9, fat: 4.8, cat: "proteina_magra" },
  miel:            { name: "Miel",                      section: "Despensa", unit: "g", price: 0.80, kcal: 304, prot: 0.3, carbs: 82, fat: 0,   cat: "condimento" },

  // Frutería
  platano:         { name: "Plátano",                   section: "Frutería", unit: "g",  price: 0.20, kcal: 89,  prot: 1.1, carbs: 23,  fat: 0.3, cat: "fruta" },
  manzana:         { name: "Manzana",                   section: "Frutería", unit: "g",  price: 0.22, kcal: 52,  prot: 0.3, carbs: 14,  fat: 0.2, cat: "fruta" },
  aguacate:        { name: "Aguacate",                  section: "Frutería", unit: "ud", price: 1.10, kcal: 240, prot: 3,   carbs: 12,  fat: 22,  cat: "grasa_saludable" },
  tomate:          { name: "Tomate",                    section: "Frutería", unit: "g",  price: 0.19, kcal: 18,  prot: 0.9, carbs: 3.9, fat: 0.2, cat: "verdura" },
  brocoli:         { name: "Brócoli",                   section: "Frutería", unit: "g",  price: 0.25, kcal: 34,  prot: 2.8, carbs: 7,   fat: 0.4, cat: "verdura" },
  espinacas:       { name: "Espinacas frescas",         section: "Frutería", unit: "g",  price: 0.35, kcal: 23,  prot: 2.9, carbs: 3.6, fat: 0.4, cat: "verdura" },
  pimiento:        { name: "Pimiento rojo",             section: "Frutería", unit: "g",  price: 0.30, kcal: 31,  prot: 1,   carbs: 6,   fat: 0.3, cat: "verdura" },
  cebolla:         { name: "Cebolla",                   section: "Frutería", unit: "g",  price: 0.12, kcal: 40,  prot: 1.1, carbs: 9.3, fat: 0.1, cat: "verdura" },
  calabacin:       { name: "Calabacín",                 section: "Frutería", unit: "g",  price: 0.18, kcal: 17,  prot: 1.2, carbs: 3.1, fat: 0.3, cat: "verdura" },
  zanahoria:       { name: "Zanahoria",                 section: "Frutería", unit: "g",  price: 0.13, kcal: 41,  prot: 0.9, carbs: 10,  fat: 0.2, cat: "verdura" },
  patata:          { name: "Patata",                    section: "Frutería", unit: "g",  price: 0.11, kcal: 77,  prot: 2,   carbs: 17,  fat: 0.1, cat: "carbohidrato" },
  boniato:         { name: "Boniato",                   section: "Frutería", unit: "g",  price: 0.25, kcal: 86,  prot: 1.6, carbs: 20,  fat: 0.1, cat: "carbohidrato" },
  limon:           { name: "Limón",                     section: "Frutería", unit: "ud", price: 0.25, kcal: 17,  prot: 0.3, carbs: 5.4, fat: 0.2, cat: "fruta" },
  ajo:             { name: "Ajo",                       section: "Frutería", unit: "ud", price: 0.20, kcal: 4,   prot: 0.2, carbs: 1,   fat: 0,   cat: "condimento" },
  lechuga:         { name: "Lechuga",                   section: "Frutería", unit: "ud", price: 0.90, kcal: 15,  prot: 1.4, carbs: 2.9, fat: 0.2, cat: "verdura" },
};

/* Recetas. Cantidades = 1 ración. ingredients: [foodId, cantidad en la unidad del alimento].
   mealType: 'desayuno' | 'principal' (comida/cena) | 'merienda'.
   tags: vegetariano, vegano, sin_gluten, alto_proteina, economico */
const RECIPES = [
  {
    id: "avena_platano", name: "Avena con plátano y almendras", mealType: "desayuno",
    tags: ["vegetariano"],
    ingredients: [["avena", 50], ["leche_semi", 200], ["platano", 100], ["almendras", 15], ["miel", 10]],
    steps: [
      "Calienta la leche en un cazo o microondas sin que llegue a hervir.",
      "Añade los copos de avena y cocina 3-4 minutos removiendo hasta que espese.",
      "Sirve en un bol y corona con el plátano en rodajas, las almendras y la miel."
    ]
  },
  {
    id: "tortilla_claras", name: "Tortilla de huevo con espinacas y pan integral", mealType: "desayuno",
    tags: ["vegetariano", "alto_proteina"],
    ingredients: [["huevos", 3], ["espinacas", 80], ["pan_integral", 60], ["aceite_oliva", 5]],
    steps: [
      "Saltea las espinacas en una sartén con el aceite de oliva hasta que reduzcan.",
      "Bate los huevos y vuelca sobre las espinacas; cuaja a fuego medio por ambos lados.",
      "Sirve junto con el pan integral tostado."
    ]
  },
  {
    id: "yogur_manzana", name: "Yogur griego con manzana y almendras", mealType: "desayuno",
    tags: ["vegetariano"],
    ingredients: [["yogur_griego", 2], ["manzana", 150], ["almendras", 20]],
    steps: [
      "Corta la manzana en dados pequeños.",
      "Mezcla el yogur griego con la manzana y corona con las almendras."
    ]
  },
  {
    id: "tostada_aguacate", name: "Tostada de aguacate y huevo", mealType: "desayuno",
    tags: ["vegetariano"],
    ingredients: [["pan_integral", 60], ["aguacate", 1], ["huevos", 2], ["limon", 1]],
    steps: [
      "Tuesta el pan integral.",
      "Machaca el aguacate con unas gotas de limón y extiéndelo sobre el pan.",
      "Cocina los huevos a la plancha o escalfados y colócalos encima."
    ]
  },
  {
    id: "batido_avena", name: "Batido de avena y crema de cacahuete", mealType: "desayuno",
    tags: ["vegetariano"],
    ingredients: [["avena", 40], ["leche_semi", 250], ["crema_cacahuete", 15], ["platano", 100]],
    steps: [
      "Pon todos los ingredientes en una batidora.",
      "Bate hasta conseguir una textura cremosa y sirve frío."
    ]
  },

  {
    id: "pollo_arroz_brocoli", name: "Pechuga de pollo con arroz y brócoli", mealType: "principal",
    tags: ["alto_proteina", "sin_gluten"],
    ingredients: [["pollo_pechuga", 150], ["arroz", 70], ["brocoli", 150], ["aceite_oliva", 10]],
    steps: [
      "Cuece el arroz según el tiempo indicado en el envase.",
      "Cocina la pechuga de pollo a la plancha con una pizca de sal.",
      "Cuece o saltea el brócoli al vapor 5-6 minutos.",
      "Emplata todo junto y riega con el aceite de oliva."
    ]
  },
  {
    id: "salmon_boniato", name: "Salmón al horno con boniato y espinacas", mealType: "principal",
    tags: ["alto_proteina", "sin_gluten"],
    ingredients: [["salmon", 150], ["boniato", 200], ["espinacas", 100], ["aceite_oliva", 10]],
    steps: [
      "Corta el boniato en rodajas, riega con aceite y hornea a 200°C durante 25 minutos.",
      "Añade el salmón a la bandeja los últimos 12-15 minutos de horno.",
      "Saltea las espinacas 2-3 minutos y sirve todo junto."
    ]
  },
  {
    id: "pasta_atun", name: "Pasta con atún y tomate", mealType: "principal",
    tags: ["economico"],
    ingredients: [["pasta", 80], ["atun_lata", 1], ["tomate", 150], ["cebolla", 50], ["aceite_oliva", 10]],
    steps: [
      "Cuece la pasta según el envase.",
      "Sofríe la cebolla picada con el aceite, añade el tomate troceado y cocina 8-10 minutos.",
      "Incorpora el atún escurrido y la pasta cocida, mezcla bien y sirve."
    ]
  },
  {
    id: "lentejas_estofadas", name: "Lentejas estofadas con verduras", mealType: "principal",
    tags: ["vegano", "vegetariano", "economico", "sin_gluten"],
    ingredients: [["lentejas", 80], ["zanahoria", 80], ["cebolla", 60], ["pimiento", 60], ["patata", 100], ["aceite_oliva", 10]],
    steps: [
      "Sofríe la cebolla y el pimiento troceados con el aceite.",
      "Añade la zanahoria, la patata y las lentejas junto con agua que las cubra.",
      "Cocina a fuego medio 30-35 minutos hasta que las lentejas estén tiernas."
    ]
  },
  {
    id: "garbanzos_espinacas", name: "Garbanzos salteados con espinacas", mealType: "principal",
    tags: ["vegano", "vegetariano", "economico", "sin_gluten"],
    ingredients: [["garbanzos", 200], ["espinacas", 100], ["cebolla", 50], ["ajo", 1], ["aceite_oliva", 10]],
    steps: [
      "Sofríe el ajo y la cebolla picados con el aceite de oliva.",
      "Añade los garbanzos escurridos y saltea 5 minutos.",
      "Incorpora las espinacas y cocina hasta que reduzcan."
    ]
  },
  {
    id: "ternera_calabacin", name: "Ternera picada con calabacín y arroz", mealType: "principal",
    tags: ["alto_proteina", "sin_gluten"],
    ingredients: [["ternera_picada", 130], ["calabacin", 150], ["arroz", 70], ["cebolla", 50], ["aceite_oliva", 5]],
    steps: [
      "Cuece el arroz según el envase.",
      "Sofríe la cebolla, añade la carne picada y cocina hasta que se dore.",
      "Incorpora el calabacín en dados y saltea 8-10 minutos. Sirve con el arroz."
    ]
  },
  {
    id: "merluza_patata", name: "Merluza con patata cocida y ensalada", mealType: "principal",
    tags: ["alto_proteina", "sin_gluten"],
    ingredients: [["merluza", 180], ["patata", 200], ["lechuga", 1], ["tomate", 80], ["aceite_oliva", 10]],
    steps: [
      "Cuece la patata en agua con sal 20-25 minutos.",
      "Cocina la merluza a la plancha o al vapor.",
      "Prepara una ensalada con la lechuga y el tomate, aliña con aceite y sirve todo junto."
    ]
  },
  {
    id: "tofu_quinoa", name: "Tofu salteado con quinoa y verduras", mealType: "principal",
    tags: ["vegano", "vegetariano", "sin_gluten"],
    ingredients: [["tofu", 150], ["quinoa", 70], ["pimiento", 80], ["calabacin", 80], ["zanahoria", 50], ["aceite_oliva", 10]],
    steps: [
      "Cuece la quinoa según el envase (normalmente 12-15 minutos).",
      "Corta el tofu en dados y dóralo en una sartén con un poco de aceite.",
      "Añade las verduras troceadas y saltea 8-10 minutos. Mezcla con la quinoa."
    ]
  },
  {
    id: "gambas_ajillo", name: "Gambas al ajillo con arroz", mealType: "principal",
    tags: ["alto_proteina", "sin_gluten"],
    ingredients: [["gambas", 150], ["ajo", 2], ["arroz", 70], ["aceite_oliva", 10], ["limon", 1]],
    steps: [
      "Cuece el arroz según el envase.",
      "Calienta el aceite con el ajo laminado y saltea las gambas 2-3 minutos.",
      "Sirve las gambas sobre el arroz con un chorrito de limón."
    ]
  },
  {
    id: "pavo_boniato", name: "Pavo a la plancha con boniato y brócoli", mealType: "principal",
    tags: ["alto_proteina", "sin_gluten", "economico"],
    ingredients: [["pavo_filete", 150], ["boniato", 180], ["brocoli", 120], ["aceite_oliva", 10]],
    steps: [
      "Hornea o cuece el boniato en rodajas hasta que esté tierno (20-25 minutos).",
      "Cocina el filete de pavo a la plancha.",
      "Cuece el brócoli al vapor y sirve todo junto con un chorrito de aceite."
    ]
  },
  {
    id: "ensalada_garbanzos", name: "Ensalada de garbanzos, aguacate y queso fresco", mealType: "principal",
    tags: ["vegetariano"],
    ingredients: [["garbanzos", 150], ["aguacate", 1], ["queso_fresco", 100], ["tomate", 100], ["lechuga", 1]],
    steps: [
      "Mezcla los garbanzos escurridos con la lechuga y el tomate troceados.",
      "Añade el aguacate en dados y el queso fresco.",
      "Aliña al gusto con aceite, sal y limón."
    ]
  },

  {
    id: "yogur_miel_almendras", name: "Yogur natural con miel y almendras", mealType: "merienda",
    tags: ["vegetariano"],
    ingredients: [["yogur_natural", 1], ["miel", 10], ["almendras", 10]],
    steps: ["Mezcla el yogur con la miel y corona con las almendras."]
  },
  {
    id: "manzana_cacahuete", name: "Manzana con crema de cacahuete", mealType: "merienda",
    tags: ["vegano", "vegetariano", "economico"],
    ingredients: [["manzana", 150], ["crema_cacahuete", 20]],
    steps: ["Corta la manzana en gajos y acompaña con la crema de cacahuete para untar."]
  },
  {
    id: "queso_almendras", name: "Queso curado con almendras", mealType: "merienda",
    tags: ["vegetariano"],
    ingredients: [["queso_curado", 40], ["almendras", 15]],
    steps: ["Sirve el queso en dados junto con las almendras."]
  },
  {
    id: "batido_platano", name: "Batido de plátano y leche", mealType: "merienda",
    tags: ["vegetariano"],
    ingredients: [["platano", 120], ["leche_semi", 200], ["miel", 10]],
    steps: ["Bate el plátano con la leche y la miel hasta que quede cremoso."]
  }
];
