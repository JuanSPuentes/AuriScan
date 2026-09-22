// Único lugar que decide qué cuenta como "una foto válida" -- usado tanto al recibir la
// imagen en /api/analizar como por los dos drivers de almacenamiento (local y OSS), para que
// el límite no dependa de mantener la misma regla en tres sitios. "La extensión no prueba
// nada": el MIME declarado se valida contra una lista cerrada, nunca se usa tal cual para el
// nombre de archivo ni el Content-Type sin pasar por acá.

export const MIME_PERMITIDOS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// de sobra para una foto ya redimensionada en el cliente a max 1400px (quedan unos cientos
// de KB); esto es una cota de seguridad contra un cliente que mande algo fuera de lo normal,
// no el tamaño esperado real.
const MAX_BYTES = 15 * 1024 * 1024;

export function decodificarFotoDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) throw new Error("Imagen inválida: se esperaba una foto en data URL (base64).");
  const mime = m[1].toLowerCase();
  const ext = MIME_PERMITIDOS[mime];
  if (!ext) throw new Error(`Tipo de imagen no permitido ("${mime}"). Solo JPEG, PNG o WEBP.`);
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_BYTES)
    throw new Error(`La imagen pesa demasiado (${(buffer.length / 1e6).toFixed(1)} MB, máximo ${MAX_BYTES / 1e6} MB).`);
  return { buffer, mime, ext };
}
