// Alternativa a OSS para pruebas locales: guarda fotos/PDFs en el disco del contenedor
// en vez de subirlos a la nube. Mismo esquema de keys que oss.mjs (fotos/<id>.<ext>,
// pdfs/<id>.pdf) para que cambiar de un driver a otro sea solo la variable STORAGE_DRIVER.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname, extname } from "node:path";

const RAIZ = process.env.LOCAL_STORAGE_DIR || "/app/data";

const MIME_POR_EXT = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".pdf": "application/pdf",
};

function bufferDeDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw new Error("dataUrl inválida.");
  return { buffer: Buffer.from(m[2], "base64"), mime: m[1] };
}

async function guardar(key, buffer) {
  const ruta = join(RAIZ, key);
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, buffer);
  return key;
}

export async function subirFoto(informeId, dataUrl) {
  const { buffer, mime } = bufferDeDataUrl(dataUrl);
  const ext = mime.split("/")[1] || "jpg";
  return guardar(`fotos/${informeId}.${ext}`, buffer);
}

export async function subirPdf(informeId, buffer) {
  return guardar(`pdfs/${informeId}.pdf`, buffer);
}

export async function obtenerComoDataUrl(key) {
  const buffer = await readFile(join(RAIZ, key));
  const mime = MIME_POR_EXT[extname(key).toLowerCase()] || "application/octet-stream";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export function urlFirmada() {
  throw new Error("urlFirmada no aplica en modo de almacenamiento local.");
}
