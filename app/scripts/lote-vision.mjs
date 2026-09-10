// Corre SOLO el paso de visión sobre varias imágenes y resume qué signos detecta.
//   node scripts/lote-vision.mjs [carpeta] [n]
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const l of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { chat, imageContent, parseJsonLoose, costo } = await import("../api/_lib/alibaba.mjs");
const { PROMPT_VISION } = await import("../api/_lib/prompts.mjs");

const carpeta = process.argv[2] || join(root, "..", "images");
const n = Number(process.argv[3] || 8);
const todas = readdirSync(carpeta).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const paso = Math.max(1, Math.floor(todas.length / n));
const muestra = todas.filter((_, i) => i % paso === 0).slice(0, n);

const mime = (f) => ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extname(f).toLowerCase()] || "image/jpeg");
const filas = [];
for (const f of muestra) {
  const url = `data:${mime(f)};base64,${readFileSync(join(carpeta, f)).toString("base64")}`;
  try {
    const r = await chat({ model: "qwen3-vl-flash", json: true, temperature: 0.1, maxTokens: 2000,
      messages: [{ role: "system", content: PROMPT_VISION }, { role: "user", content: [imageContent(url), { type: "text", text: "Describe esta oreja." }] }] });
    const o = parseJsonLoose(r.text);
    filas.push({
      img: f, s: (r.ms / 1000).toFixed(1), oreja: o.es_oreja, calidad: o.calidad,
      color: o.color_general, signos: (o.signos || []).length,
      zonas_signo: (o.zonas_con_signo || []).length, normales: (o.hallazgos_normales || []).length,
      sig1: (o.signos || [])[0] ? `${o.signos[0].signo}/${o.signos[0].color}@${(o.signos[0].zonas || []).join(",")}` : "—",
    });
  } catch (e) { filas.push({ img: f, s: "-", error: e.message.slice(0, 60) }); }
}
console.table(filas);
