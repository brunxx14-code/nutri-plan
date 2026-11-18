# Reconocer la comida de una foto

Este pequeño servidor recibe la foto de un plato desde la app y devuelve qué
lleva, con gramos, calorías y macros aproximados. Hace falta porque la app es
una web estática (GitHub Pages) y la clave de la IA no puede ir dentro de la
web: cualquiera podría copiarla.

Mientras no esté activado, la app funciona igual: la foto se guarda y los
ingredientes se añaden a mano con el buscador.

## Cuánto cuesta

- **Cloudflare Workers**: gratis hasta 100.000 peticiones al día.
- **Anthropic (la IA)**: se paga por uso. Con la foto reducida a ~1000 px:
  - `claude-opus-5-5` (más preciso): unos **2 céntimos por foto**.
  - `claude-haiku-5-5` (más barato, algo menos fino): bastante menos de 1 céntimo.

  Ejemplo: 3 fotos al día durante un mes ≈ 1,80 € por persona con Opus.

Pon un **límite de gasto mensual** en la consola de Anthropic
(Settings → Limits) para que nunca te llegue una sorpresa.

## Cómo activarlo (unos 15 minutos)

1. Crea una cuenta en <https://console.anthropic.com>, añade saldo y crea una
   clave de API (empieza por `sk-ant-`). No la compartas con nadie.
2. Crea una cuenta gratis en <https://dash.cloudflare.com>.
3. En tu ordenador, dentro de esta carpeta `server/`:

   ```bash
   npm install
   npx wrangler login                        # abre el navegador para entrar en Cloudflare
   npx wrangler secret put ANTHROPIC_API_KEY # pega aquí la clave de Anthropic
   npx wrangler deploy
   ```

   Al terminar te da una dirección tipo
   `https://nutriplan-food-photo.TU-USUARIO.workers.dev`.
4. Pon esa dirección en `js/foodphoto.js`:

   ```js
   const FOOD_AI_URL = "https://nutriplan-food-photo.TU-USUARIO.workers.dev";
   ```

5. Publica la app. A partir de ahí, la foto se analiza sola y la persona solo
   revisa y corrige.

## Ajustes (`wrangler.toml`)

- `ALLOWED_ORIGINS`: desde qué web se aceptan fotos (la de GitHub Pages).
- `MODEL`: `claude-opus-5-5` o `claude-haiku-5-5`.
- `MAX_PHOTOS_PER_HOUR`: fotos por persona y hora, para frenar abusos.

Si Claude rechaza analizar una foto por sus filtros de seguridad, el servidor
reintenta automáticamente con otro modelo (opción `fallbacks: "default"`, solo
con Opus; con Haiku la app pasa a añadir los ingredientes a mano).

## Privacidad

La foto se envía reducida y este servidor no la guarda; Anthropic la procesa
según su política de datos de la API (por defecto no la usa para entrenar). En el
móvil solo se guarda una miniatura pequeña durante 14 días.
