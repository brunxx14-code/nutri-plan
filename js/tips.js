/* Consejo del día en el resumen: una idea corta y práctica que cambia cada
   día, para que abrir la app siempre traiga algo nuevo. */

const TIPS = [
  { emoji: "💧", text: "Bebe un vaso de agua antes de cada comida: ayuda a no pasarte con las raciones." },
  { emoji: "🥦", text: "Llena medio plato de verdura. Sacia mucho y aporta pocas calorías." },
  { emoji: "🍗", text: "Reparte la proteína en todas las comidas, no solo en la cena." },
  { emoji: "😴", text: "Dormir menos de 7 horas aumenta el hambre al día siguiente." },
  { emoji: "🛒", text: "Haz la compra con la lista y sin hambre: gastarás menos." },
  { emoji: "🍳", text: "Cocina doble en la cena y llévate la comida de mañana hecha." },
  { emoji: "🐢", text: "Come despacio: el cuerpo tarda unos 20 minutos en avisar de que está lleno." },
  { emoji: "🍎", text: "Ten fruta a la vista. Lo que ves es lo que acabas picando." },
  { emoji: "🥤", text: "Los refrescos y zumos suman calorías sin quitar el hambre. Mejor agua o infusiones." },
  { emoji: "🚶", text: "Un paseo de 10 minutos después de comer ayuda a la digestión." },
  { emoji: "🫒", text: "El aceite de oliva es sano, pero cada cucharada son unas 90 kcal. Mídelo." },
  { emoji: "🧂", text: "Usa especias y limón para dar sabor sin añadir tanta sal." },
  { emoji: "📅", text: "Un mal día no rompe nada. Lo que cuenta es lo que haces la mayoría de días." },
  { emoji: "🥚", text: "Un desayuno con proteína te mantiene saciado hasta la comida." },
  { emoji: "🍽️", text: "Usa un plato más pequeño: la misma ración parece más grande." },
  { emoji: "📱", text: "Come sin pantallas cuando puedas: notarás mejor cuándo estás lleno." },
  { emoji: "🫘", text: "Las legumbres son baratas, sacian y tienen mucha fibra. Inclúyelas 2-3 veces por semana." },
  { emoji: "🏋️", text: "Si entrenas fuerza, la proteína te ayuda a recuperar y a mantener músculo." },
  { emoji: "⚖️", text: "Pésate a la misma hora y en las mismas condiciones para comparar bien." },
  { emoji: "🧊", text: "Prepara la verdura cortada el domingo y la semana será mucho más fácil." },
];

let tipOffset = 0;

function dayOfYear(d = new Date()) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

function currentTip() {
  return TIPS[(dayOfYear() + tipOffset) % TIPS.length];
}

function tipCardHtml() {
  const tip = currentTip();
  return `
    <div class="tip-card" id="tip-card">
      <div class="tip-emoji" aria-hidden="true">${tip.emoji}</div>
      <div class="tip-body" aria-live="polite">
        <span class="tip-kicker">💡 Consejo del día</span>
        <p class="tip-text">${tip.text}</p>
      </div>
      <button type="button" class="tip-next" id="tip-next" aria-label="Otro consejo">↻</button>
    </div>`;
}

function bindTipCard(root) {
  const btn = root.querySelector("#tip-next");
  if (!btn) return;
  btn.addEventListener("click", () => {
    tipOffset++;
    buzz(6);
    track("consejo-siguiente");
    // se cambia el contenido sin rehacer la tarjeta: el foco se queda en ↻
    // y el lector de pantalla lee el consejo nuevo
    const card = document.getElementById("tip-card");
    card.classList.remove("enter");
    card.classList.add("swap");
    setTimeout(() => {
      const tip = currentTip();
      card.querySelector(".tip-emoji").textContent = tip.emoji;
      card.querySelector(".tip-text").textContent = tip.text;
      card.classList.remove("swap");
      void card.offsetWidth; // reinicia la animación de entrada
      card.classList.add("enter");
    }, prefersReducedMotion() ? 0 : 180);
  });
}
