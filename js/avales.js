/* Avales de nutricionistas reales. La sección no se muestra mientras la
   lista esté vacía: aparece sola en el perfil y en la bienvenida en cuanto se
   añade el primero.

   Para añadir uno, copia este ejemplo dentro de ENDORSEMENTS (solo con el
   permiso por escrito de la persona y con su número de colegiado real):

   {
     name: "Nombre Apellido",
     title: "Dietista-nutricionista",
     license: "Col. AND-00123",        // número de colegiado, se muestra tal cual
     quote: "Lo que opina de la app, en una o dos frases.",
     photo: "icons/avales/nombre.jpg",  // opcional
     url: "https://su-web.com",         // opcional
   },
*/
const ENDORSEMENTS = [];

function escapeEndorsement(text) {
  return String(text || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function endorsementsHtml(compact = false) {
  if (!ENDORSEMENTS.length) return "";
  const list = compact ? ENDORSEMENTS.slice(0, 1) : ENDORSEMENTS;
  return `
    <div class="pcard endorsements${compact ? " compact" : ""}">
      <div class="section-kicker">🩺 Lo avalan nutricionistas</div>
      ${list.map((e) => `
        <figure class="endorsement">
          <blockquote>“${escapeEndorsement(e.quote)}”</blockquote>
          <figcaption>
            ${e.photo ? `<img src="${escapeEndorsement(e.photo)}" alt="" loading="lazy">` : `<span class="endorsement-avatar">🩺</span>`}
            <span>
              <b>${e.url ? `<a href="${escapeEndorsement(e.url)}" target="_blank" rel="noopener">${escapeEndorsement(e.name)}</a>` : escapeEndorsement(e.name)}</b>
              <small>${escapeEndorsement(e.title)}${e.license ? ` · ${escapeEndorsement(e.license)}` : ""}</small>
            </span>
          </figcaption>
        </figure>`).join("")}
    </div>`;
}

/* En la bienvenida, el primer aval da confianza antes de empezar. */
document.addEventListener("DOMContentLoaded", () => {
  const intro = document.getElementById("wizard-intro");
  if (intro && ENDORSEMENTS.length) intro.insertAdjacentHTML("beforeend", endorsementsHtml(true));
});
