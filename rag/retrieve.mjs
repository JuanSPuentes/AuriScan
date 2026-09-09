// Prototipo del RAG v1 — recuperación por metadatos + grafo (sin embeddings, sin BD).
//
// Simula lo que haría /api/analizar entre el PASO 1 (visión describe la foto)
// y el PASO 3 (generación del informe): a partir de {zonas, signos, puntos_visibles}
// selecciona notas del cerebro y arma el bloque de contexto para el modelo.
//
// Uso:   node retrieve.mjs [caso]
//   caso = ansiedad (por defecto) | cefalea | limpia
// Salida: tabla de notas + estimación de tokens + rag/context-sample.md

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const index = JSON.parse(readFileSync(join(__dirname, "vault-index.json"), "utf8"));
const { notes, aliasMap } = index;
const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
const resolve = (name) => aliasMap[String(name).toLowerCase().trim()] || null;

// --- núcleo fijo (va en TODA consulta) ----------------------------------
const CORE = [
  "Puntos maestros auriculares",
  "Eje neuro-psicologico",
  "Eje neuroendocrino",
  "Eje sensorial",
  "Eje de homeostasis general",
  "Lineamientos para el diagnostico auricular",
  "Criterios de seleccion de puntos",
  "Lineamientos generales del tratamiento",
  "Observacion visual de la piel auricular",
  "Vistas y orientacion de la auricula",
];

// --- casos de prueba (simulan la salida del PASO 1 de visión) -----------
const CASES = {
  ansiedad: {
    titulo: "Caso ansiedad/estrés — foto con agujas puestas (equivale a reporte.md)",
    oreja: "izquierda",
    modo: "con agujas",
    zonas: ["helix", "antihelix", "lobulo", "concha-inferior", "trago", "cisura-intertragica", "fosa-triangular"],
    signos: ["eritema", "enrojecimiento", "lobulo congestivo", "hiperemia", "descamacion"],
    puntos_visibles: ["Shen Men", "Punto Tranquilizador", "Punto Autonomo Simpatico", "Punto Talamo", "Punto Cero"],
  },
  cefalea: {
    titulo: "Caso cefalea tensional + cervicalgia — oreja con agujas",
    oreja: "derecha",
    modo: "con agujas",
    zonas: ["antitrago", "antihelix-cola", "lobulo", "concha-inferior"],
    signos: ["eritema", "prominencia", "mancha roja"],
    puntos_visibles: ["Occipucio", "Shen Men", "Punto Cero", "Punto Talamo", "Relajación Muscular"],
  },
  limpia: {
    titulo: "Caso oreja limpia — la IA propone puntos desde los signos",
    oreja: "izquierda",
    modo: "oreja limpia",
    zonas: ["lobulo", "concha-inferior", "helix", "antihelix"],
    signos: ["descamacion", "rojo oscuro", "piel blanca", "pliegue diagonal"],
    puntos_visibles: [],
  },
};

const caseKey = process.argv[2] || "ansiedad";
const obs = CASES[caseKey];
if (!obs) {
  console.error(`caso desconocido: ${caseKey}. Opciones: ${Object.keys(CASES).join(", ")}`);
  process.exit(1);
}

// --- recuperación v1 ---------------------------------------------------
const selected = new Map(); // id -> [motivos]
const add = (id, motivo) => {
  if (!id || !byId[id]) return;
  if (!selected.has(id)) selected.set(id, []);
  if (!selected.get(id).includes(motivo)) selected.get(id).push(motivo);
};

// 1) núcleo fijo + un salto por sus enlaces (trae los puntos maestros que
//    citan las notas de eje y el índice de puntos maestros)
for (const id of CORE) add(id, "núcleo");
for (const id of CORE) {
  const n = byId[id];
  if (!n) continue;
  for (const l of n.links) {
    const t = resolve(l);
    if (t && byId[t] && ["punto", "criterio"].includes(byId[t].tipo)) add(t, `enlace desde núcleo (${id})`);
  }
}

// 2) por signos visuales (coincidencia laxa por subcadena en ambos sentidos)
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
for (const n of notes) {
  for (const sv of n.senales_visuales) {
    for (const sig of obs.signos) {
      const a = norm(sv), b = norm(sig);
      if (a && b && (a.includes(b) || b.includes(a))) add(n.id, `signo: ${sig}`);
    }
  }
}

// 3) por zonas anatómicas — restringido para no arrastrar medio vault:
//    solo notas de contexto (anatomía de región, semiología, protocolo, criterio,
//    diagnóstico) y las notas-resumen de somatotopía. Los puntos concretos entran
//    por (4), no por zona.
const RESUMEN_SOMATOTOPIA = new Set([
  "Sistema musculoesqueletico auricular", "Cabeza cara y cuello auriculares",
  "Organos internos auriculares", "Glandulas endocrinas auriculares",
  "Sistema nervioso auricular", "Puntos funcionales auriculares", "Puntos de los organos Yin",
]);
const zonasObs = new Set(obs.zonas.map(norm));
for (const n of notes) {
  const admite =
    ["anatomia", "semiologia", "protocolo", "criterio", "diagnostico", "eje"].includes(n.tipo) ||
    RESUMEN_SOMATOTOPIA.has(n.id);
  if (!admite) continue;
  const solapa = n.zona_auricular.filter((z) => zonasObs.has(norm(z))).length;
  if (solapa) add(n.id, `zona ×${solapa}`);
}

// 4) por puntos visibles + notas enlazadas (1 salto por el grafo)
for (const p of obs.puntos_visibles) {
  const id = resolve(p);
  if (!id) {
    add("__NORESUELVE__", p); // marca puntos no resueltos
    continue;
  }
  add(id, `punto visible: ${p}`);
  for (const l of byId[id].links) add(resolve(l), `enlace desde ${id}`);
}
const noResueltos = selected.get("__NORESUELVE__") || [];
selected.delete("__NORESUELVE__");

// --- ensamblado del contexto ----------------------------------------
const orden = { núcleo: 0, "signo:": 1, "zona": 2, "punto visible:": 3, "enlace": 4 };
const rank = (motivos) => Math.min(...motivos.map((m) => {
  const k = Object.keys(orden).find((p) => m.startsWith(p));
  return k ? orden[k] : 9;
}));

const picked = [...selected.entries()]
  .map(([id, motivos]) => ({ n: byId[id], motivos, r: rank(motivos) }))
  .sort((a, b) => a.r - b.r || a.n.id.localeCompare(b.n.id));

let ctx = `# Contexto de auriculoterapia para el análisis de la imagen\n\n`;
ctx += `> Fuente: cerebro (destilado de Oleson, *Auriculoterapia* 3.ª ed.). Material de apoyo; el informe debe ser corroborado por un profesional experto.\n\n`;
ctx += `## Observaciones de la imagen (paso de visión)\n`;
ctx += `- Oreja: ${obs.oreja} · Modo: ${obs.modo}\n`;
ctx += `- Zonas con signos: ${obs.zonas.join(", ")}\n`;
ctx += `- Signos visuales: ${obs.signos.join(", ")}\n`;
ctx += `- Puntos visibles: ${obs.puntos_visibles.join(", ") || "—"}\n\n---\n\n`;
for (const { n } of picked) {
  ctx += `## ${n.id}\n`;
  if (n.fuente) ctx += `*${n.fuente}*\n\n`;
  ctx += n.body + "\n\n---\n\n";
}
const outFile = `context-${caseKey}.md`;
writeFileSync(join(__dirname, outFile), ctx, "utf8");

// --- reporte por consola ------------------------------------------
const chars = ctx.length;
const lo = Math.round(chars / 4), hi = Math.round(chars / 3.3);
const nucleoChars = picked.filter((p) => p.r === 0).reduce((s, p) => s + p.n.chars, 0);
const recupChars = chars - nucleoChars;

console.log(`\n=== ${obs.titulo} ===\n`);
console.log(`${picked.length} notas seleccionadas de ${notes.length}\n`);
const pad = (s, w) => String(s).padEnd(w).slice(0, w);
console.log(pad("nota", 42), pad("tipo", 12), "motivo principal");
console.log("-".repeat(90));
for (const { n, motivos } of picked) {
  console.log(pad(n.id, 42), pad(n.tipo, 12), motivos[0] + (motivos.length > 1 ? ` (+${motivos.length - 1})` : ""));
}
console.log("-".repeat(90));
if (noResueltos.length) console.log(`\n⚠ puntos visibles NO resueltos en el cerebro: ${noResueltos.join(", ")}`);
console.log(`\ncontexto ensamblado: ${chars.toLocaleString()} caracteres`);
console.log(`  ≈ ${lo.toLocaleString()}–${hi.toLocaleString()} tokens de entrada`);
console.log(`  núcleo fijo ≈ ${Math.round(nucleoChars / 4).toLocaleString()} tok · recuperado ≈ ${Math.round(recupChars / 4).toLocaleString()} tok`);
console.log(`\n-> rag/${outFile}`);
