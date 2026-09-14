// Servidor local para PROBAR la app completa sin Vercel.
//   1) npm run build
//   2) crea app/.env con:  DASHSCOPE_API_KEY=sk-ws-...
//   3) node scripts/servidor-local.mjs   ->  http://localhost:8787
//
// Sirve dist/ y enruta POST /api/analizar al mismo handler que usa Vercel.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(root, "dist");
const PORT = process.env.PORT || 8787;

// --- cargar .env -------------------------------------------------------
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
if (!process.env.DASHSCOPE_API_KEY) {
  console.error("⚠  Falta DASHSCOPE_API_KEY. Crea app/.env con  DASHSCOPE_API_KEY=sk-ws-...");
}
if (!existsSync(DIST)) {
  console.error("⚠  No existe dist/. Ejecuta primero:  npm run build");
  process.exit(1);
}

const [analizar, pdf, checkout, pagoEstado, pagoWebhook, misInformes, adminMetricas] = await Promise.all([
  import("../api/analizar.mjs").then((m) => m.default),
  import("../api/pdf.mjs").then((m) => m.default),
  import("../api/checkout.mjs").then((m) => m.default),
  import("../api/pago-estado.mjs").then((m) => m.default),
  import("../api/pago-webhook.mjs").then((m) => m.default),
  import("../api/mis-informes.mjs").then((m) => m.default),
  import("../api/admin-metricas.mjs").then((m) => m.default),
]);
const RUTAS = {
  "/api/analizar": analizar, "/api/pdf": pdf, "/api/checkout": checkout,
  "/api/pago-estado": pagoEstado, "/api/pago-webhook": pagoWebhook,
  "/api/mis-informes": misInformes, "/api/admin-metricas": adminMetricas,
};

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

const server = createServer(async (req, res) => {
  // --- API ---
  const ruta = RUTAS[req.url.split("?")[0]];
  if (ruta) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const shimReq = { method: req.method, headers: req.headers, body: body ? JSON.parse(body) : {} };
    const shimRes = {
      _s: 200, _h: {},
      status(c) { this._s = c; return this; },
      setHeader(k, v) { this._h[k] = v; },
      json(o) { res.writeHead(this._s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); },
      send(b) { res.writeHead(this._s, this._h); res.end(b); },
    };
    try { await ruta(shimReq, shimRes); }
    catch (e) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: String(e.message || e) })); }
    return;
  }
  // --- estáticos ---
  let p = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  if (p === "/" || p === "\\") p = "/index.html";
  let file = join(DIST, p);
  if (!existsSync(file)) file = join(DIST, "index.html"); // SPA fallback
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end("no encontrado"); }
});

server.listen(PORT, () => {
  console.log(`\n  Auriculoterapia PWA  ->  http://localhost:${PORT}`);
  console.log(`  demo sin IA          ->  http://localhost:${PORT}/?demo=1`);
  console.log(`  API key: ${process.env.DASHSCOPE_API_KEY ? "cargada ✓" : "FALTA ✗"}\n`);
});
