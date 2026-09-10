// RAG v1 — recuperación por metadatos + grafo sobre el cerebro compilado.
// Entrada: la observación del paso de visión.  Salida: bloque de contexto (string) + notas usadas.

import index from "./vault-index.json" with { type: "json" };

const { notes, aliasMap } = index;
const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// índice de alias sin acentos y sin puntuación de separación
const aliasNorm = {};
for (const [k, v] of Object.entries(aliasMap)) {
  aliasNorm[norm(k)] = v;
  aliasNorm[norm(k).replace(/\s*\/\s*/g, "/")] = v;   // "hi4 / ah7" -> "hi4/ah7"
}
const resolve = (name) => {
  const n = norm(name);
  return aliasMap[String(name || "").toLowerCase().trim()]
    || aliasNorm[n]
    || aliasNorm[n.replace(/\s*\/\s*/g, "/")]
    || aliasNorm[n.split("/")[0].trim()]        // "tranquilizador/relajación" -> "tranquilizador"
    || null;
};

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
const RESUMEN_SOMATOTOPIA = new Set([
  "Sistema musculoesqueletico auricular", "Cabeza cara y cuello auriculares",
  "Organos internos auriculares", "Glandulas endocrinas auriculares",
  "Sistema nervioso auricular", "Puntos funcionales auriculares", "Puntos de los organos Yin",
]);
const ADMITE_ZONA = new Set(["anatomia", "semiologia", "protocolo", "criterio", "diagnostico", "eje"]);

// color_general -> notas del cerebro que interpretan ese patrón difuso
const COLOR_A_NOTAS = {
  rojo_difuso: ["Manchas de coloracion oscura", "Eje de homeostasis general"],
  rojo_focal: ["Manchas de coloracion oscura"],
  palido: ["Piel blanca y descamacion", "Eje de homeostasis general"],
  mixto: ["Manchas de coloracion oscura", "Piel blanca y descamacion"],
};

/**
 * @param {{zonas?:string[], signos?:({signo:string}|string)[], colorGeneral?:string, puntos_visibles?:string[]}} obs
 * @returns {{context:string, notasUsadas:string[], noResueltos:string[], tokensEst:number}}
 */
export function recuperar(obs = {}) {
  const zonas = (obs.zonas || []).map(norm);
  const signos = (obs.signos || []).map((s) => norm(typeof s === "string" ? s : s.signo));
  const puntos = obs.puntos_visibles || [];

  const sel = new Map(); // id -> [motivos]
  const add = (id, motivo) => {
    if (!id || !byId[id]) return;
    if (!sel.has(id)) sel.set(id, []);
    if (!sel.get(id).includes(motivo)) sel.get(id).push(motivo);
  };

  for (const id of CORE) add(id, "nucleo");
  for (const id of CORE) {
    for (const l of byId[id]?.links || []) {
      const t = resolve(l);
      if (t && ["punto", "criterio"].includes(byId[t].tipo)) add(t, "enlace-nucleo");
    }
  }
  for (const n of notes) {
    for (const sv of n.senales_visuales || []) {
      for (const sig of signos) {
        const a = norm(sv);
        if (a && sig && (a.includes(sig) || sig.includes(a))) add(n.id, `signo:${sig}`);
      }
    }
  }
  const zset = new Set(zonas);
  for (const n of notes) {
    if (!(ADMITE_ZONA.has(n.tipo) || RESUMEN_SOMATOTOPIA.has(n.id))) continue;
    if ((n.zona_auricular || []).some((z) => zset.has(norm(z))))
      add(n.id, n.tipo === "protocolo" ? "protocolo-zona" : "zona");
  }
  for (const id of COLOR_A_NOTAS[obs.colorGeneral] || []) add(id, "color-general");
  const noResueltos = [];
  for (const p of puntos) {
    const id = resolve(p);
    if (!id) { noResueltos.push(p); continue; }
    add(id, `punto:${p}`);
    for (const l of byId[id].links) add(resolve(l), `enlace:${id}`);
  }

  const prio = (motivos) => Math.min(...motivos.map((m) =>
    m === "nucleo" ? 0 : m.startsWith("enlace-nucleo") ? 1 : m.startsWith("punto") ? 2
      : m.startsWith("signo") ? 3 : m === "protocolo-zona" ? 3 : m === "color-general" ? 3
      : m.startsWith("enlace") ? 5 : 6)); // zona genérica = lo último
  const MAX_NOTAS = Number(process.env.RAG_MAX_NOTAS || 26);
  const picked = [...sel.entries()]
    .map(([id, motivos]) => ({ n: byId[id], r: prio(motivos) }))
    .sort((a, b) => a.r - b.r || a.n.id.localeCompare(b.n.id))
    .slice(0, MAX_NOTAS);

  // El material se destiló de un manual de auriculoterapia; para el informe la referencia es la
  // cartografía de Nogier. No se pasa `n.fuente` (nombre del autor + páginas) al modelo, y el
  // cuerpo se limpia de menciones al autor y de números de sección.
  const limpiar = (t) => String(t)
    .replace(/\bTerry\s+Oleson\b/gi, "Nogier")
    .replace(/\bOleson\b/gi, "Nogier")
    .replace(/\s*\(?§\s*\d+(?:\.\d+)?\)?/g, "");
  let ctx = "# Contexto de auriculoterapia (cartografía auricular de Nogier). Material de apoyo.\n\n";
  for (const { n } of picked) {
    ctx += `## ${n.id}\n`;
    ctx += limpiar(n.body) + "\n\n---\n\n";
  }
  return {
    context: ctx,
    notasUsadas: picked.map((p) => p.n.id),
    noResueltos,
    tokensEst: Math.round(ctx.length / 3.6),
  };
}

export function vaultTiene(idOrAlias) {
  return !!resolve(idOrAlias);
}

// Conjunto de todas las claves de zona usadas en el cerebro (para validación blanda).
const ZONAS = new Set();
for (const n of notes) for (const z of n.zona_auricular || []) ZONAS.add(norm(z));
export function zonaConocida(z) {
  return ZONAS.has(norm(z));
}
