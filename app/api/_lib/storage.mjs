// Punto único de importación para guardar/leer fotos y PDFs. Cambia de driver con
// STORAGE_DRIVER=local (disco del contenedor, para pruebas -- por defecto) o
// STORAGE_DRIVER=oss (Alibaba OSS, para cuando ya haya bucket real). El resto del código
// (guardar-informe.mjs, pdf.mjs) no sabe ni le importa cuál de los dos está activo.

const driver = process.env.STORAGE_DRIVER === "oss"
  ? await import("./oss.mjs")
  : await import("./local-storage.mjs");

export const { subirFoto, subirPdf, obtenerComoDataUrl, urlFirmada } = driver;
