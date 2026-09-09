// Diagnóstico: ¿a qué modelos tiene acceso realmente este workspace?
// Hace una llamada mínima (1 token) a cada candidato. Coste ~ 0.
//   node scripts/probar-modelos.mjs

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
if (existsSync(envPath))
  for (const l of readFileSync(envPath, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }

const BASE = process.env.ALIBABA_BASE_URL
  || "https://dashscope-us.aliyuncs.com/compatible-mode/v1";
const KEY = process.env.DASHSCOPE_API_KEY;
if (!KEY) { console.error("Falta DASHSCOPE_API_KEY en app/.env"); process.exit(1); }

const CANDIDATOS = [
  // visión
  "qwen3-vl-plus", "qwen3-vl-flash", "qwen-vl-plus", "qwen-vl-max",
  "qwen3-vl-235b-a22b-instruct", "qwen3-vl-plus-2025-09-23", "qvq-max",
  // texto (para aislar si el bloqueo es de VL o del workspace)
  "qwen-plus", "qwen-flash", "qwen-turbo", "qwen3-max", "qwen-max",
];

async function probar(model) {
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
    });
    const t = await r.text();
    if (r.ok) return { model, ok: true, nota: "200" };
    let msg = t.slice(0, 120);
    try { msg = JSON.parse(t).error?.message || msg; } catch {}
    return { model, ok: false, nota: `${r.status} ${msg}` };
  } catch (e) { return { model, ok: false, nota: String(e.message) }; }
}

console.log(`endpoint: ${BASE}\n`);
for (const m of CANDIDATOS) {
  const r = await probar(m);
  console.log(`${r.ok ? "  OK  " : " NO   "} ${r.model.padEnd(30)} ${r.ok ? "" : r.nota}`);
}
