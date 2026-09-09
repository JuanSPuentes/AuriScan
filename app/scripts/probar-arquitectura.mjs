// Mide 3 arquitecturas del pipeline sobre una imagen real, para decidir si migramos.
//   node scripts/probar-arquitectura.mjs "../oreja 1.jpeg" oreja_limpia
// Consume IA (~2-4 centavos en total). Requiere app/.env.
//
//   actual : qwen3-vl-flash (visión) -> RAG -> qwen-flash TEXTO            (el informe NO ve la foto)
//   B      : qwen3-vl-flash (visión) -> RAG -> qwen3-vl-plus CON imagen    (el informe ve la foto)
//   C      : una sola llamada qwen3-vl-plus (imagen + contexto amplio)     (sin handoff)
//   D      : qwen3-vl-flash (visión) -> RAG -> qwen3-vl-flash CON imagen   (informe ve la foto, barato)
//   E      : una sola llamada qwen3-vl-flash (imagen + contexto amplio)    (sin handoff, barato)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const l of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
process.env.RAG_MAX_NOTAS ||= "26";

const { chat, imageContent, parseJsonLoose, costo } = await import("../api/_lib/alibaba.mjs");
const { recuperar } = await import("../api/_lib/retrieve.mjs");
const { PROMPT_VISION, promptInforme } = await import("../api/_lib/prompts.mjs");
const { validar, sellar, schema } = await import("../api/_lib/validate.mjs");
const { construirDocumentoHTML } = await import("../src/report.mjs");

const SCHEMA_TEXT = JSON.stringify(schema, null, 2);
const imgPath = process.argv[2] || join(root, "..", "oreja 1.jpeg");
const modo = process.argv[3] || "oreja_limpia";
if (!existsSync(imgPath)) { console.error("no existe:", imgPath); process.exit(1); }
const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extname(imgPath).toLowerCase()] || "image/jpeg";
const dataUrl = `data:${mime};base64,${readFileSync(imgPath).toString("base64")}`;

const TODAS_ZONAS = ["helix","helix-superior","helix-cola","helix-interno","antihelix","antihelix-cuerpo",
  "antihelix-cola","raiz-superior","raiz-inferior","fosa-triangular","fosa-escafoidea","concha-superior",
  "concha-inferior","cresta-concha","pared-concha","trago","antitrago","cisura-intertragica","subtrago","lobulo"];

const cont = (s) => [imageContent(dataUrl), { type: "text", text: s }];
const filas = [];
const parseSeguro = (t) => { try { return parseJsonLoose(t); } catch (e) { return { __error: e.message }; } };

function medir(nombre, { ms, usd, informe }) {
  if (informe?.__error) {
    filas.push({ arq: nombre, s: (ms / 1000).toFixed(1), usd: usd.toFixed(4), valida: "JSON roto", puntos: 0, signos: 0, descChars: 0, err: informe.__error.slice(0, 80) });
    return;
  }
  const r = validar(informe);
  const p = informe?.evaluacion_protocolo?.puntos?.length ?? 0;
  const sig = informe?.observacion_visual?.signos?.length ?? 0;
  const desc = informe?.observacion_visual?.caracteristicas_generales?.descripcion?.length ?? 0;
  filas.push({ arq: nombre, s: (ms / 1000).toFixed(1), usd: usd.toFixed(4), valida: r.ok ? "sí" : "NO", puntos: p, signos: sig, descChars: desc, err: r.ok ? "" : r.errors.slice(0, 2).join("; ") });
  try {
    sellar(informe, { modo, modelo: nombre, oreja: null });
    writeFileSync(join(root, "scripts", `arq-${nombre}.html`), construirDocumentoHTML(informe));
    writeFileSync(join(root, "scripts", `arq-${nombre}.json`), JSON.stringify(informe, null, 2));
  } catch (e) { console.log(`  (no se pudo renderizar ${nombre}: ${e.message})`); }
}

// ---------- ACTUAL + B comparten el paso de visión ----------
console.log("paso visión (qwen3-vl-flash)…");
const v = await chat({ model: "qwen3-vl-flash", json: true, temperature: 0.1, maxTokens: 1600,
  messages: [{ role: "system", content: PROMPT_VISION }, { role: "user", content: cont("Describe esta oreja.") }] });
const obs = parseJsonLoose(v.text);
const visionMs = v.ms, visionUsd = costo("qwen3-vl-flash", v.usage)?.usd ?? 0;
const rag = recuperar({ zonas: obs.zonas_con_signo, signos: (obs.signos || []).map((s) => s.signo), puntos_visibles: [] });
console.log(`  ${visionMs} ms · $${visionUsd} · RAG ${rag.notasUsadas.length} notas / ~${rag.tokensEst} tok`);

const sysInf = promptInforme({ modo, schemaText: SCHEMA_TEXT });
const userInf = `MODO: ${modo}\n\nOBSERVACIONES DEL PASO DE VISIÓN:\n${JSON.stringify(obs, null, 2)}\n\nCONTEXTO DE REFERENCIA:\n${rag.context}`;

// ---------- ACTUAL ----------
console.log("informe ACTUAL (qwen-flash, texto)…");
const a = await chat({ model: "qwen-flash", json: true, temperature: 0.2, maxTokens: 3000,
  messages: [{ role: "system", content: sysInf }, { role: "user", content: userInf }] });
medir("actual", { ms: visionMs + a.ms, usd: visionUsd + (costo("qwen-flash", a.usage)?.usd ?? 0), informe: parseSeguro(a.text) });

// ---------- B ---------- (SKIP_LENTOS=1 para saltar B y C, ya medidos ~70-76s)
if (process.env.SKIP_LENTOS !== "1") {
  console.log("informe B (qwen3-vl-plus, CON imagen)…");
  const b = await chat({ model: "qwen3-vl-plus", json: true, temperature: 0.2, maxTokens: 3500,
    messages: [{ role: "system", content: sysInf }, { role: "user", content: cont(userInf) }] });
  medir("B", { ms: visionMs + b.ms, usd: visionUsd + (costo("qwen3-vl-plus", b.usage)?.usd ?? 0), informe: parseSeguro(b.text) });
}

// ---------- C: una sola llamada (prompt unificado, un solo esquema de salida) ----------
const ragC = recuperar({ zonas: TODAS_ZONAS, signos: [], puntos_visibles: [] });
const sysC = `${promptInforme({ modo, schemaText: SCHEMA_TEXT })}

OBSERVAS LA FOTO DIRECTAMENTE (no hay un paso previo). Antes de redactar, recorre TODA la oreja:
- Para CADA zona con algo llamativo, anota en "observacion_visual.signos": el signo, el color exacto
  (rojo brillante / rojo oscuro / púrpura / blanco / pálido / gris-marrón / normal), la(s) zona(s), la
  localización con altura, y si es focal o difuso.
- Marca explícitamente venas/telangiectasias, descamación y relieve (prominencia/depresión).
- "caracteristicas_generales.descripcion": 2-4 frases sobre color y DÓNDE, textura, venas, descamación, agujas.
- Un rubor leve y homogéneo en toda la oreja puede ser normal: va en "color_general", no como signo focal.
La salida es ÚNICAMENTE el JSON del informe (el esquema de arriba). No devuelvas el objeto de observación por separado.`;
if (process.env.SKIP_LENTOS !== "1") {
  console.log("informe C (qwen3-vl-plus, una llamada)…");
  const c = await chat({ model: "qwen3-vl-plus", json: true, temperature: 0.2, maxTokens: 3800,
    messages: [{ role: "system", content: sysC }, { role: "user", content: cont(`MODO: ${modo}\n\nCONTEXTO DE REFERENCIA:\n${ragC.context}`) }] });
  medir("C", { ms: c.ms, usd: costo("qwen3-vl-plus", c.usage)?.usd ?? 0, informe: parseSeguro(c.text) });
}

// ---------- D: 2 pasos, informe = qwen3-vl-flash CON imagen ----------
console.log("informe D (qwen3-vl-flash, CON imagen)…");
const dd = await chat({ model: "qwen3-vl-flash", json: true, temperature: 0.2, maxTokens: 3500,
  messages: [{ role: "system", content: sysInf }, { role: "user", content: cont(userInf) }] });
medir("D", { ms: visionMs + dd.ms, usd: visionUsd + (costo("qwen3-vl-flash", dd.usage)?.usd ?? 0), informe: parseSeguro(dd.text) });

// ---------- E: una sola llamada qwen3-vl-flash ----------
console.log("informe E (qwen3-vl-flash, una llamada)…");
const ee = await chat({ model: "qwen3-vl-flash", json: true, temperature: 0.2, maxTokens: 3800,
  messages: [{ role: "system", content: sysC }, { role: "user", content: cont(`MODO: ${modo}\n\nCONTEXTO DE REFERENCIA:\n${ragC.context}`) }] });
medir("E", { ms: ee.ms, usd: costo("qwen3-vl-flash", ee.usage)?.usd ?? 0, informe: parseSeguro(ee.text) });

// ---------- resultado ----------
console.log("\n=================  RESULTADO  =================");
console.table(filas);
console.log("\nHTML/JSON por arquitectura -> scripts/arq-*.html · scripts/arq-*.json");
console.log("Descripción de la visión (paso flash):", JSON.stringify(obs.descripcion || "").slice(0, 400));
