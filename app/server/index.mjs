// Servidor de la API para el contenedor de backend (Docker). Extiende el mismo patrón de
// scripts/servidor-local.mjs: un http.createServer con tabla de rutas hacia los mismos
// handlers (req,res)=>{} que ya usan los endpoints -- por eso api/*.mjs casi no cambia.
//
// Este contenedor SOLO sirve /api/* -- el estático (dist/) lo sirve nginx (contenedor de
// frontend), que además hace de reverse proxy de /api hacia este servidor.

import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT || 8787;

// --- cargar .env (solo si existe -- en Docker las variables ya vienen del compose/entorno) ---
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const REQUERIDAS = ["DASHSCOPE_API_KEY", "DATABASE_URL", "CLERK_SECRET_KEY"];
for (const v of REQUERIDAS) {
  if (!process.env[v]) console.error(`⚠  Falta ${v} en el entorno.`);
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
  "/api/analizar": analizar,
  "/api/pdf": pdf,
  "/api/checkout": checkout,
  "/api/pago-estado": pagoEstado,
  "/api/pago-webhook": pagoWebhook,
  "/api/mis-informes": misInformes,
  "/api/admin-metricas": adminMetricas,
};

const server = createServer(async (req, res) => {
  const ruta = RUTAS[req.url.split("?")[0]];
  if (!ruta) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "No encontrado." })); return; }

  let body = "";
  for await (const chunk of req) body += chunk;
  const shimReq = { method: req.method, headers: req.headers, body: body ? JSON.parse(body) : {} };
  const shimRes = {
    _s: 200, _h: {},
    status(c) { this._s = c; return this; },
    setHeader(k, v) { this._h[k] = v; },
    json(o) { res.writeHead(this._s, { "Content-Type": "application/json", ...this._h }); res.end(JSON.stringify(o)); },
    send(b) { res.writeHead(this._s, this._h); res.end(b); },
  };
  try { await ruta(shimReq, shimRes); }
  catch (e) {
    console.error(e);
    if (!res.headersSent) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: String(e.message || e) })); }
  }
});

server.listen(PORT, () => console.log(`\n  API backend  ->  :${PORT}\n`));
