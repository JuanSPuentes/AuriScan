// Cliente mínimo del endpoint OpenAI-compatible de Alibaba Model Studio (workspace de Singapur).
// La API key va SOLO en variables de entorno del servidor.

const BASE = process.env.ALIBABA_BASE_URL
  || "https://dashscope-us.aliyuncs.com/compatible-mode/v1";
const KEY = process.env.DASHSCOPE_API_KEY;

/**
 * Llama a /chat/completions y devuelve { text, usage }.
 * @param {object} o
 * @param {string} o.model
 * @param {Array} o.messages  mensajes estilo OpenAI (content puede llevar image_url)
 * @param {boolean} [o.json]  forzar respuesta JSON
 * @param {number} [o.temperature]
 * @param {number} [o.maxTokens]
 */
export async function chat({ model, messages, json = false, temperature = 0.2, maxTokens = 4000 }) {
  if (!KEY) throw new Error("Falta DASHSCOPE_API_KEY en el entorno.");
  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };
  const t0 = Date.now();
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  if (!r.ok) {
    let detalle = raw.slice(0, 400);
    try { detalle = JSON.parse(raw).error?.message || detalle; } catch {}
    if (/access.?denied/i.test(raw)) {
      throw new Error(
        `Alibaba ${r.status}: el modelo "${model}" no está habilitado en tu cuenta de Model Studio. ` +
        `Actívalo en la consola (Model Studio → activar el servicio y los modelos, verificar facturación). ` +
        `Diagnóstico: node scripts/probar-modelos.mjs`);
    }
    throw new Error(`Alibaba ${r.status}: ${detalle}`);
  }
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`Respuesta no-JSON de Alibaba: ${raw.slice(0, 300)}`); }
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    usage: data.usage ?? null,
    ms: Date.now() - t0,
  };
}

// data URL a partir de un buffer/base64 + mimetype
export function imageContent(dataUrl) {
  return { type: "image_url", image_url: { url: dataUrl } };
}

// Extrae el primer objeto JSON de un texto (por si el modelo envuelve en ```).
export function parseJsonLoose(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No se encontró JSON en la respuesta.");
  return JSON.parse(candidate.slice(start, end + 1));
}

// Precios USD / 1M tokens (Singapur, tramo 0-32K) para estimar el coste de cada llamada.
const PRECIOS = {
  "qwen3-vl-flash": { in: 0.05, out: 0.4 },
  "qwen3-vl-plus": { in: 0.2, out: 1.6 },
  "qwen-flash": { in: 0.05, out: 0.4 },
  "qwen-plus": { in: 0.4, out: 1.2 },
  "qwen3-max": { in: 1.2, out: 6 },
};
export function costo(model, usage) {
  const p = PRECIOS[model];
  if (!p || !usage) return null;
  const i = (usage.prompt_tokens || 0) * p.in / 1e6;
  const o = (usage.completion_tokens || 0) * p.out / 1e6;
  return { usd: +(i + o).toFixed(5), in: usage.prompt_tokens, out: usage.completion_tokens };
}
