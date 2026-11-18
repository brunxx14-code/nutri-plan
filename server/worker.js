/* Reconoce la comida de una foto y devuelve ingredientes con cantidades y
   macros aproximados. La app (js/foodphoto.js) le envía la foto ya reducida
   a ~1000 px y muestra el resultado para que la persona lo revise.

   Respuesta: { dish, emoji, confidence: "alta"|"media"|"baja", note,
                items: [{ name, grams, kcal, prot, carbs, fat }] } */

import Anthropic from "@anthropic-ai/sdk";

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024; // la app manda ~150-300 KB
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["dish", "emoji", "confidence", "note", "items"],
  properties: {
    dish: { type: "string", description: "Nombre corto del plato" },
    emoji: { type: "string", description: "Un emoji que represente el plato" },
    confidence: { type: "string", enum: ["alta", "media", "baja"] },
    note: { type: "string", description: "Una frase breve si algo no se ve claro (salsas, aceite, tamaño); vacía si no" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "grams", "kcal", "prot", "carbs", "fat"],
        properties: {
          name: { type: "string" },
          grams: { type: "number" },
          kcal: { type: "number" },
          prot: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
        },
      },
    },
  },
};

const SYSTEM = `Eres el asistente de nutrición de una app de planes de comida.
Te llega la foto de algo que la persona ha comido. Identifica el plato y sus
ingredientes visibles o muy probables (incluye el aceite o las salsas si es
razonable), estima los gramos de cada uno por el tamaño del plato, cubiertos y
envases, y calcula kcal, proteína, hidratos y grasas de CADA ingrediente para
esos gramos (no por 100 g). Usa nombres sencillos en el idioma indicado.
Si la foto no muestra comida, devuelve items vacío, confidence "baja" y una
nota amable. No juzgues lo que ha comido ni des consejos de dieta.`;

const hits = new Map(); // límite aproximado por IP (por instancia del Worker)

function rateLimited(ip, maxPerHour) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (list.length >= maxPerHour) return true;
  list.push(now);
  hits.set(ip, list);
  return false;
}

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return new Response("Origen no permitido", { status: 403 });
    const headers = cors(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return json({ error: "Solo POST" }, 405, headers);

    const ip = request.headers.get("CF-Connecting-IP") || "?";
    if (rateLimited(ip, Number(env.MAX_PHOTOS_PER_HOUR) || 20)) return json({ error: "Demasiadas fotos, prueba en un rato" }, 429, headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: "JSON no válido" }, 400, headers); }
    const { image, mediaType = "image/jpeg", meal = "", lang = "es" } = body || {};
    if (typeof image !== "string" || !image || image.length * 0.75 > MAX_IMAGE_BYTES) return json({ error: "Foto no válida o demasiado grande" }, 400, headers);
    if (!MEDIA_TYPES.includes(mediaType)) return json({ error: "Formato no admitido" }, 400, headers);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const model = env.MODEL || "claude-opus-5-5";
    // Haiku no admite el reintento automático con otro modelo si rechaza la foto.
    const fallback = model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
    try {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        ...fallback,
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: `Comida del día: ${String(meal).slice(0, 20) || "sin indicar"}. Idioma: ${lang === "en" ? "inglés" : "español"}.` },
          ],
        }],
      });
      if (response.stop_reason === "refusal") return json({ error: "No se ha podido analizar esta foto" }, 422, headers);
      const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const data = JSON.parse(text);
      return json(data, 200, headers);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return json({ error: "Servicio ocupado, prueba en un momento" }, 503, headers);
      if (err instanceof Anthropic.APIError) return json({ error: "Error del servicio de IA" }, 502, headers);
      return json({ error: "No se ha podido leer la respuesta" }, 502, headers);
    }
  },
};
