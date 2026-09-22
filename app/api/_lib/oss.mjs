// Sube fotos y PDFs a Alibaba OSS. Variables de entorno:
//   OSS_REGION (ej. "oss-us-east-1"), OSS_BUCKET, OSS_AK_ID, OSS_AK_SECRET

import OSS from "ali-oss";
import { decodificarFotoDataUrl } from "./imagen.mjs";

let _client;
function client() {
  if (!_client) {
    const { OSS_REGION, OSS_BUCKET, OSS_AK_ID, OSS_AK_SECRET } = process.env;
    if (!OSS_REGION || !OSS_BUCKET || !OSS_AK_ID || !OSS_AK_SECRET)
      throw new Error("Faltan OSS_REGION / OSS_BUCKET / OSS_AK_ID / OSS_AK_SECRET.");
    _client = new OSS({
      region: OSS_REGION,
      bucket: OSS_BUCKET,
      accessKeyId: OSS_AK_ID,
      accessKeySecret: OSS_AK_SECRET,
    });
  }
  return _client;
}

// Sube una foto (data URL) bajo fotos/<informeId>.<ext> -- devuelve la key guardada.
// mime ya viene validado contra una lista cerrada (decodificarFotoDataUrl) antes de usarse
// como Content-Type: si no se validara, un dataUrl con un mime falso ("text/html", etc.)
// quedaría servible con ese Content-Type desde el bucket -- riesgo de XSS si el objeto se
// abre directo con una URL firmada.
export async function subirFoto(informeId, dataUrl) {
  const { buffer, mime, ext } = decodificarFotoDataUrl(dataUrl);
  const key = `fotos/${informeId}.${ext}`;
  await client().put(key, buffer, { headers: { "Content-Type": mime } });
  return key;
}

// Sube el PDF generado (Buffer) bajo pdfs/<informeId>.pdf -- devuelve la key guardada.
export async function subirPdf(informeId, buffer) {
  const key = `pdfs/${informeId}.pdf`;
  await client().put(key, buffer, { headers: { "Content-Type": "application/pdf" } });
  return key;
}

// URL firmada temporal (para servir el PDF/foto sin hacer el bucket público).
export function urlFirmada(key, segundos = 300) {
  return client().signatureUrl(key, { expires: segundos });
}

// Descarga un objeto y lo devuelve como data URL -- para volver a montar el PDF
// (construirDocumentoHTML espera la foto como data URL, igual que hoy en el navegador).
export async function obtenerComoDataUrl(key) {
  const { content, res } = await client().get(key);
  const mime = res.headers["content-type"] || "application/octet-stream";
  return `data:${mime};base64,${content.toString("base64")}`;
}
