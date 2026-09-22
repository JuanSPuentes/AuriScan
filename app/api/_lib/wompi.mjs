// Integración con Wompi (Web Checkout, Colombia). Variables de entorno:
//   WOMPI_PUBLIC_KEY, WOMPI_PRIVATE_KEY, WOMPI_INTEGRITY_SECRET
//   WOMPI_ENV = "test" | "prod"  (sandbox por defecto)
//   PRECIO_PDF_COP -- precio en pesos colombianos (ej. 15000)

import { createHash, timingSafeEqual } from "node:crypto";

const API_BASE = () =>
  process.env.WOMPI_ENV === "prod" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
const CHECKOUT_BASE = () =>
  process.env.WOMPI_ENV === "prod" ? "https://checkout.wompi.co/p/" : "https://checkout.wompi.co/p/";

function montoEnCentavos() {
  const cop = Number(process.env.PRECIO_PDF_COP || 15000);
  return Math.round(cop * 100); // Wompi factura en centavos de peso
}

// SHA-256("{referencia}{monto-en-centavos}{moneda}{secreto-de-integridad}"), en hex.
function firmaIntegridad(referencia, montoCentavos, moneda, secreto) {
  return createHash("sha256").update(`${referencia}${montoCentavos}${moneda}${secreto}`).digest("hex");
}

// Arma la URL del Web Checkout de Wompi para una referencia (usamos el informe_id).
export function urlCheckout({ referencia, redirectUrl }) {
  const { WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET } = process.env;
  if (!WOMPI_PUBLIC_KEY || !WOMPI_INTEGRITY_SECRET) throw new Error("Faltan llaves de Wompi.");
  const monto = montoEnCentavos();
  const moneda = "COP";
  const firma = firmaIntegridad(referencia, monto, moneda, WOMPI_INTEGRITY_SECRET);
  const qs = new URLSearchParams({
    "public-key": WOMPI_PUBLIC_KEY,
    currency: moneda,
    "amount-in-cents": String(monto),
    reference: referencia,
    "signature:integrity": firma,
    "redirect-url": redirectUrl,
  });
  return { url: `${CHECKOUT_BASE()}?${qs.toString()}`, montoCentavos: monto, moneda };
}

// Wompi id de transacción: alfanumérico + guiones -- se valida ANTES de meterlo en la URL
// (nunca se construye una petición con un valor sin validar, aunque el host de destino
// esté fijo y no sea explotable como SSRF: igual podría inyectar segmentos de ruta raros).
const RE_TRANSACCION_ID = /^[A-Za-z0-9-]{1,100}$/;

// Consulta el estado real de una transacción contra la API de Wompi (nunca confiar solo
// en el parámetro `id` que trae la redirección del navegador).
export async function consultarTransaccion(transaccionId) {
  if (!RE_TRANSACCION_ID.test(transaccionId || ""))
    throw new Error("Identificador de transacción inválido.");
  const { WOMPI_PRIVATE_KEY } = process.env;
  const r = await fetch(`${API_BASE()}/transactions/${transaccionId}`, {
    headers: WOMPI_PRIVATE_KEY ? { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` } : {},
  });
  if (!r.ok) throw new Error(`Wompi respondió ${r.status} consultando la transacción.`);
  const { data } = await r.json();
  return data; // { id, status: "APPROVED"|"DECLINED"|"VOIDED"|"ERROR"|"PENDING", reference, amount_in_cents, ... }
}

// comparación en tiempo constante -- un "===" normal filtra por temporización cuánto del
// hash coincide letra por letra, aunque acá el margen de explotación sea chico (igual es
// gratis evitarlo y es exactamente para esto que existe timingSafeEqual).
function igualesEnTiempoConstante(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Verifica el checksum del evento del webhook (Eventos → "Secreto de eventos" en el dashboard).
export function verificarChecksumWebhook(payload) {
  const { EventChecksum, timestamp, data, signature } = payload || {};
  const secreto = process.env.WOMPI_EVENTS_SECRET;
  if (!secreto || !signature?.properties || !data) return false;
  const valores = signature.properties.map((p) => p.split(".").reduce((o, k) => o?.[k], { data })).join("");
  const calculado = createHash("sha256").update(`${valores}${timestamp}${secreto}`).digest("hex");
  return igualesEnTiempoConstante(calculado, EventChecksum || payload.checksum);
}
