// POST /api/pdf   body JSON: { informe_id }   ->   application/pdf (descarga directa)
//
// El informe completo NUNCA sale del servidor sin pagar: se lee de la base (no del navegador,
// que solo tiene el resumen desde /api/analizar), y solo se genera el PDF si hay un pago
// aprobado para ese informe y ese usuario. Renderiza con Chromium headless -- en Docker, el
// Chromium del sistema (mismo camino que ya usaba el desarrollo local); en Vercel, @sparticuz/chromium.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { construirDocumentoHTML } from "../src/report.mjs";
import { exigirUsuario } from "./_lib/auth.mjs";
import { one } from "./_lib/db.mjs";
import { obtenerComoDataUrl, subirPdf } from "./_lib/storage.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function lanzar() {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // @sparticuz/chromium detecta el entorno por AWS_EXECUTION_ENV / AWS_LAMBDA_JS_RUNTIME.
    // Vercel Fluid Compute (Node 24) no coincide con lo que espera -> forzamos AL2023 antes de
    // importar el paquete, para que extraiga sus .so y ponga LD_LIBRARY_PATH.
    process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs20.x";
    process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs20.x";
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  // Docker / local: Chromium del sistema. CHROME_PATH lo fija el Dockerfile del backend.
  const cand = [
    process.env.CHROME_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const exe = cand.find((p) => existsSync(p));
  if (!exe) throw new Error("No se encontró Chrome/Chromium para generar el PDF.");
  return puppeteer.launch({
    executablePath: exe,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // hace falta corriendo como root en el contenedor
  });
}

let _logoDataUrl;
function logoDataUrl() {
  if (_logoDataUrl !== undefined) return _logoDataUrl;
  try {
    const buf = readFileSync(join(ROOT, "public", "logo-emblema.png"));
    _logoDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    _logoDataUrl = null;
  }
  return _logoDataUrl;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST." });
  let browser;
  try {
    const usuario = await exigirUsuario(req, res);
    if (!usuario) return;

    const { informe_id } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!informe_id) return res.status(400).json({ error: "Falta 'informe_id'." });

    const fila = await one("select * from informes where id = $1 and usuario_id = $2", [informe_id, usuario.id]);
    if (!fila) return res.status(404).json({ error: "Informe no encontrado." });

    const pago = await one(
      "select * from pagos where informe_id = $1 and usuario_id = $2 and estado = 'aprobado' limit 1",
      [informe_id, usuario.id]
    );
    if (!pago) return res.status(402).json({ error: "Este informe todavía no tiene un pago aprobado." });

    const informe = fila.contrato;
    const archivoFoto = await one("select oss_key from archivos where informe_id = $1 and tipo = 'foto'", [informe_id]);
    const fotoDataUrl = archivoFoto ? await obtenerComoDataUrl(archivoFoto.oss_key) : null;

    const html = construirDocumentoHTML(informe, fotoDataUrl, logoDataUrl());
    browser = await lanzar();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 25000 });
    try { await page.evaluateHandle("document.fonts && document.fonts.ready"); } catch {}
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });
    const buffer = Buffer.from(pdf);

    // Queda guardado en OSS para no tener que regenerarlo si lo vuelve a pedir.
    try {
      const key = await subirPdf(informe_id, buffer);
      await one(
        `insert into archivos (informe_id, tipo, oss_key) values ($1, 'pdf', $2)
         on conflict do nothing returning id`,
        [informe_id, key]
      );
    } catch { /* no bloquea la descarga si falla el guardado */ }

    const nombre = String(informe.meta?.caso_id || "informe-auricular").replace(/[^\w.-]/g, "") + ".pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (e) {
    return res.status(500).json({ error: "No se pudo generar el PDF: " + String(e.message || e) });
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }
}

export const config = { maxDuration: 60 };
