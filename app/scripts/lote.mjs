// Corre el pipeline COMPLETO sobre varias imágenes y resume el resultado.
//   node scripts/lote.mjs [carpeta] [n] [con_agujas|oreja_limpia]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const l of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { default: handler } = await import("../api/analizar.mjs");
const { construirDocumentoHTML } = await import("../src/report.mjs");

const carpeta = process.argv[2] || join(root, "..", "images");
const n = Number(process.argv[3] || 8);
const modo = process.argv[4] || "oreja_limpia";
const todas = readdirSync(carpeta).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const paso = Math.max(1, Math.floor(todas.length / n));
const muestra = todas.filter((_, i) => i % paso === 0).slice(0, n);
const outdir = join(root, "scripts", "lote-out");
mkdirSync(outdir, { recursive: true });

const mime = (f) => ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extname(f).toLowerCase()] || "image/jpeg");
const filas = [];
for (const f of muestra) {
  const url = `data:${mime(f)};base64,${readFileSync(join(carpeta, f)).toString("base64")}`;
  const res = { _s: 200, status(c) { this._s = c; return this; }, json(o) { this._b = o; } };
  const t0 = Date.now();
  try {
    await handler({ method: "POST", body: { imagen: url, modo, oreja: "no_determinada", consentimiento: true } }, res);
  } catch (e) { res._s = 599; res._b = { error: e.message }; }
  const s = ((Date.now() - t0) / 1000).toFixed(0);
  const b = res._b || {};
  if (res._s !== 200 || !b.informe) {
    filas.push({ img: f, s, http: res._s, rechazo: b.rechazo || "", error: (b.error || "").slice(0, 45) });
    continue;
  }
  const inf = b.informe;
  const sig = inf.observacion_visual?.signos || [];
  const sis = inf.hipotesis_diagnostica?.sistemas || [];
  const pts = inf.evaluacion_protocolo?.puntos || [];
  filas.push({
    img: f, s, "$": b.debug?.costoTotalUsd, reintento: b.debug?.tiempos?.informe2_ms ? "sí" : "",
    signos: sig.length, sistemas: sis.map((x) => x.sistema).join("+") || "(vacío)",
    motivo: inf.meta?.motivo, npuntos: pts.length,
    puntos: pts.map((p) => p.nombre).join(", ").slice(0, 70),
  });
  writeFileSync(join(outdir, f.replace(/\.\w+$/, ".html")), construirDocumentoHTML(inf, url));
  writeFileSync(join(outdir, f.replace(/\.\w+$/, ".json")), JSON.stringify(inf, null, 2));
}
console.table(filas);
console.log(`\nHTML/JSON por caso -> ${outdir}`);
