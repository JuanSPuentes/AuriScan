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
import { limitar } from "../api/_lib/rate-limit.mjs";

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

// nginx ya pone client_max_body_size 20m delante, pero este servidor también puede recibir
// tráfico directo (Vercel usa los mismos handlers de otra forma, y en local sin nginx
// también) -- sin este tope, `for await` de abajo acumula el body en memoria sin límite.
const MAX_BODY_BYTES = 15 * 1024 * 1024;

// /api/analizar cuesta dinero real (IA) por llamada; /api/checkout crea órdenes de pago
// reales en Wompi -- ambos con un límite más estricto que el resto. Ver rate-limit.mjs:
// en memoria, correcto porque este backend corre en un solo proceso.
const LIMITES_POR_RUTA = {
  "/api/analizar": { max: 10, ventanaMs: 15 * 60 * 1000 },
  "/api/checkout": { max: 20, ventanaMs: 15 * 60 * 1000 },
};
const LIMITE_GENERAL = { max: 200, ventanaMs: 15 * 60 * 1000 };

function ipCliente(req) {
  // detrás de nginx (proxy_set_header X-Real-IP) en Docker; socket directo en cualquier otro caso.
  return req.headers["x-real-ip"] || req.socket.remoteAddress || "desconocida";
}

const server = createServer(async (req, res) => {
  const pathname = req.url.split("?")[0];
  const ruta = RUTAS[pathname];
  if (!ruta) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "No encontrado." })); return; }

  const { max, ventanaMs } = LIMITES_POR_RUTA[pathname] || LIMITE_GENERAL;
  const { permitido, reintentarEnMs } = limitar(`${pathname}:${ipCliente(req)}`, max, ventanaMs);
  if (!permitido) {
    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": String(Math.ceil(reintentarEnMs / 1000)) });
    res.end(JSON.stringify({ error: "Demasiadas solicitudes. Intenta de nuevo en unos minutos." }));
    return;
  }

  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "La solicitud es demasiado grande." }));
      return;
    }
  }

  let parsedBody;
  try { parsedBody = body ? JSON.parse(body) : {}; }
  catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "JSON inválido." }));
    return;
  }

  const shimReq = { method: req.method, headers: req.headers, body: parsedBody };
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
    if (!res.headersSent) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Ocurrió un error interno. Intenta de nuevo en unos minutos." })); }
  }
});

server.listen(PORT, () => console.log(`\n  API backend  ->  :${PORT}\n`));
