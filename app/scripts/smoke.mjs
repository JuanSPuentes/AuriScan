// Prueba en seco del pipeline SIN llamar a Alibaba:
//  - carga los módulos de la función
//  - corre la recuperación con una observación simulada
//  - valida el ejemplo del contrato
//  - renderiza el informe a PDF-HTML (comprobación de la plantilla)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recuperar } from "../api/_lib/retrieve.mjs";
import { validar, avisosVault, sellar } from "../api/_lib/validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..");

const obsSimulada = {
  zonas_con_signo: ["helix", "antihelix", "lobulo", "concha-inferior", "trago", "cisura-intertragica"],
  signos: [{ signo: "eritema" }, { signo: "hiperemia focal" }, { signo: "descamacion" }],
};

console.log("== RAG ==");
const rag = recuperar({ zonas: obsSimulada.zonas_con_signo, signos: obsSimulada.signos.map((s) => s.signo) });
console.log(`  ${rag.notasUsadas.length} notas · ~${rag.tokensEst} tokens de contexto · sin resolver: ${rag.noResueltos.length}`);

console.log("\n== Validación del contrato ==");
const { construirDocumentoHTML } = await import("../src/report.mjs");
for (const nombre of ["ejemplo-ansiedad.json", "ejemplo-oreja-limpia.json", "ejemplo-no-viable.json"]) {
  const ej = JSON.parse(readFileSync(join(repo, "contrato", nombre), "utf8"));
  const r = validar(ej);
  console.log(`  ${nombre.padEnd(26)} -> ${r.ok ? "OK" : "FALLA: " + r.errors.join("; ")}`);
  const av = avisosVault(ej);
  if (av.length) console.log(`     avisos vault: ${av.join(" | ")}`);
  sellar(ej, { modo: ej.meta.modo, modelo: "qwen-flash" });
  const html = construirDocumentoHTML(ej, null);
  const out = join(root, "scripts", `muestra-${nombre.replace(".json", ".html")}`);
  writeFileSync(out, html, "utf8");
  console.log(`     -> titulo "${ej.infografico.titulo}" · ${html.length} bytes -> ${out.replace(root, ".")}`);
}
console.log("\nOK");
