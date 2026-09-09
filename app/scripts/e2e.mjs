// Prueba end-to-end REAL: llama a Alibaba con una imagen y ejecuta todo el pipeline.
//   node scripts/e2e.mjs [ruta-imagen] [con_agujas|oreja_limpia]
// Consume IA (~1 centavo). Requiere app/.env con la key + endpoint.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const l of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const imgPath = process.argv[2] || join(root, "..", "Reporte.jpeg");
const modo = process.argv[3] || "con_agujas";
if (!existsSync(imgPath)) { console.error("no existe:", imgPath); process.exit(1); }

const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extname(imgPath).toLowerCase()] || "image/jpeg";
const dataUrl = `data:${mime};base64,${readFileSync(imgPath).toString("base64")}`;

const { default: handler } = await import("../api/analizar.mjs");

const res = {
  _s: 200, status(c) { this._s = c; return this; },
  json(o) { this._body = o; },
};
console.log(`imagen: ${imgPath}  modo: ${modo}\nllamando…\n`);
const t0 = Date.now();
await handler({ method: "POST", body: { imagen: dataUrl, modo, consentimiento: true } }, res);
console.log(`HTTP ${res._s}  (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);

if (res._s !== 200) { console.log(JSON.stringify(res._body, null, 2)); process.exit(1); }

const { informe, debug } = res._body;
console.log("— DEBUG —");
console.log("observación:", JSON.stringify(debug.observacion).slice(0, 300));
console.log("RAG:", debug.rag);
console.log("tiempos:", debug.tiempos);
console.log("costos:", debug.costos);
console.log("coste total USD:", debug.costoTotalUsd);
console.log("avisos vault:", debug.avisosVault);
if (debug.erroresValidacion1) console.log("errores validación intento 1:", debug.erroresValidacion1);
console.log("\n— INFORME —");
console.log("analisis_viable:", informe.analisis_viable);
console.log("motivo:", informe.meta?.motivo, "| oreja:", informe.meta?.oreja);
console.log("diagnóstico:", informe.hipotesis_diagnostica?.diagnostico_principal);
console.log("ejes:", (informe.hipotesis_diagnostica?.ejes || []).map((e) => e.eje).join(", "));
console.log("puntos:", (informe.evaluacion_protocolo?.puntos || []).map((p) => p.nombre).join(", "));

writeFileSync(join(root, "scripts", "e2e-informe.json"), JSON.stringify(informe, null, 2));
const { construirDocumentoHTML } = await import("../src/report.mjs");
writeFileSync(join(root, "scripts", "e2e-informe.html"), construirDocumentoHTML(informe));
console.log("\n-> scripts/e2e-informe.json  +  scripts/e2e-informe.html");
