// POST /api/pdf   body JSON: { informe, foto?, logo? }   ->   application/pdf (descarga directa)
// Renderiza el informe con Chromium headless. En Vercel usa @sparticuz/chromium; en local, el Chrome del sistema.

import { construirDocumentoHTML } from "../src/report.mjs";

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
  // local: Chrome/Edge del sistema
  const cand = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const { existsSync } = await import("node:fs");
  const exe = cand.find((p) => existsSync(p));
  if (!exe) throw new Error("No se encontró Chrome/Edge local para generar el PDF.");
  return puppeteer.launch({ executablePath: exe, headless: true });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST." });
  let browser;
  try {
    const { informe, foto, logo } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!informe?.meta) return res.status(400).json({ error: "Falta 'informe'." });

    const html = construirDocumentoHTML(informe, foto || null, logo || null);
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

    const nombre = String(informe.meta.caso_id || "informe-auricular").replace(/[^\w.-]/g, "") + ".pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(pdf));
  } catch (e) {
    return res.status(500).json({ error: "No se pudo generar el PDF: " + String(e.message || e) });
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }
}

export const config = { maxDuration: 60 };
