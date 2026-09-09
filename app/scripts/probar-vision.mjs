// Compara el paso de VISIÓN con flash vs plus (latencia barata, es donde más rinde subir de modelo).
//   node scripts/probar-vision.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const l of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { chat, imageContent, parseJsonLoose, costo } = await import("../api/_lib/alibaba.mjs");
const { PROMPT_VISION } = await import("../api/_lib/prompts.mjs");

const chatRetry = async (opts) => {
  for (let i = 1; ; i++) {
    try { return await chat(opts); }
    catch (e) { if (i >= 3) throw e; console.log(`  (reintento ${i}: ${e.message})`); await new Promise((s) => setTimeout(s, 2000)); }
  }
};

for (const img of ["../oreja 1.jpeg", "../oreja 2.jpeg"]) {
  const url = "data:image/jpeg;base64," + readFileSync(join(root, img)).toString("base64");
  for (const model of ["qwen3-vl-flash", "qwen3-vl-plus"]) {
    const r = await chatRetry({ model, json: true, temperature: 0.1, maxTokens: 1800,
      messages: [{ role: "system", content: PROMPT_VISION }, { role: "user", content: [imageContent(url), { type: "text", text: "Describe esta oreja." }] }] });
    const o = parseJsonLoose(r.text);
    console.log(`\n[${img}  ${model}]  ${(r.ms / 1000).toFixed(1)}s  $${costo(model, r.usage)?.usd}  es_oreja=${o.es_oreja} calidad=${o.calidad}  signos=${(o.signos || []).length} zonas=${(o.zonas_con_signo || []).length}`);
    console.log("  desc:", o.descripcion);
    console.log("  signos:", JSON.stringify(o.signos));
  }
}
