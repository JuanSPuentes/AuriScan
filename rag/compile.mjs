// Compilador del vault de Obsidian -> vault-index.json
// Lee cerebro/**/*.md, parsea el frontmatter y el cuerpo, y produce el índice
// que consume el módulo de recuperación (retrieve.mjs).
//
// Uso:  node compile.mjs
// Salida: rag/vault-index.json  +  resumen por consola

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = join(__dirname, "..", "cerebro");
const OUT = join(__dirname, "vault-index.json");

// --- utilidades ------------------------------------------------------------

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

// Parser mínimo de frontmatter para nuestro esquema conocido:
//  clave: escalar            ->  string (sin comillas)
//  clave: [a, b, c]          ->  array
//  clave:\n  - a\n  - b      ->  array
//  clave: []                 ->  array vacío
function parseFrontmatter(fm) {
  const obj = {};
  const lines = fm.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();

    if (val === "") {
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(lines[j].replace(/^\s*-\s+/, "").trim().replace(/^["']|["']$/g, ""));
        j++;
      }
      obj[key] = items.length ? items : "";
      i = j - 1;
      continue;
    }
    if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.slice(1, -1).trim();
      obj[key] = inner
        ? inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
        : [];
      continue;
    }
    obj[key] = val.replace(/^["']|["']$/g, "");
  }
  return obj;
}

function stripInlineCode(s) {
  return s.replace(/`[^`]*`/g, "").replace(/```[\s\S]*?```/g, "");
}

function extractLinks(body) {
  const set = new Set();
  const re = /\[\[([^\]|#\\]+)(?:\\?[|#][^\]]*)?\]\]/g;
  let m;
  const clean = stripInlineCode(body);
  while ((m = re.exec(clean))) set.add(m[1].trim());
  return [...set];
}

// Estimación de tokens. Sin el tokenizador real de Qwen; damos un rango.
//  ~ chars/4 (optimista, estilo inglés)  ~ chars/3.3 (conservador para español)
function estTokens(chars) {
  return { lo: Math.round(chars / 4), hi: Math.round(chars / 3.3) };
}

// --- compilación ---------------------------------------------------------

const files = walk(VAULT).sort();
const notes = [];
const aliasMap = {}; // alias/id en minúsculas -> id

for (const path of files) {
  const raw = readFileSync(path, "utf8").replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fm = m ? parseFrontmatter(m[1]) : {};
  const body = (m ? m[2] : raw).trim();
  const id = basename(path, ".md");
  const rel = relative(VAULT, path).replace(/\\/g, "/");

  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const note = {
    id,
    path: rel,
    tipo: fm.tipo || "",
    estado: fm.estado || "",
    sistema: fm.sistema || "",
    fuente: fm.fuente || "",
    numero: fm.numero || "",
    aliases: arr(fm.aliases),
    zona_auricular: arr(fm.zona_auricular).map((s) => s.toLowerCase()),
    senales_visuales: arr(fm.senales_visuales).map((s) => s.toLowerCase()),
    puntos_relacionados: arr(fm.puntos_relacionados),
    ejes: arr(fm.ejes),
    links: extractLinks(body),
    chars: body.length,
    tokens_est: estTokens(body.length),
    body,
  };
  notes.push(note);

  aliasMap[id.toLowerCase()] = id;
  for (const a of note.aliases) aliasMap[a.toLowerCase()] = id;
}

const index = { generatedAt: new Date().toISOString(), vault: "cerebro", notes, aliasMap };
writeFileSync(OUT, JSON.stringify(index, null, 2), "utf8");

// --- resumen ------------------------------------------------------------

const byTipo = {};
let totalLo = 0, totalHi = 0;
const sinClaves = [];
for (const n of notes) {
  byTipo[n.tipo || "(sin tipo)"] = (byTipo[n.tipo || "(sin tipo)"] || 0) + 1;
  totalLo += n.tokens_est.lo;
  totalHi += n.tokens_est.hi;
  const esRecuperable =
    n.zona_auricular.length || n.senales_visuales.length || n.puntos_relacionados.length || n.ejes.length;
  if (!esRecuperable && !["meta"].includes(n.tipo)) sinClaves.push(n.id);
}

console.log(`\nvault-index.json  ->  ${OUT}`);
console.log(`\n${notes.length} notas`);
console.log("por tipo:", byTipo);
console.log(`\nvault completo (si se enviara entero):  ~${totalLo}–${totalHi} tokens`);
console.log(`enlaces rotos: ` + (() => {
  const roto = new Set();
  for (const n of notes) for (const l of n.links) if (!aliasMap[l.toLowerCase()]) roto.add(l);
  return roto.size ? [...roto].join(", ") : "ninguno";
})());
console.log(`\nnotas sin claves de recuperación (${sinClaves.length}):`, sinClaves.join(", ") || "—");
