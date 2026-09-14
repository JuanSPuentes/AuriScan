// Integración con Wompi (Web Checkout, Colombia). Variables de entorno:
//   WOMPI_PUBLIC_KEY, WOMPI_PRIVATE_KEY, WOMPI_INTEGRITY_SECRET
//   WOMPI_ENV = "test" | "prod"  (sandbox por defecto)
//   PRECIO_PDF_COP -- precio en pesos colombianos (ej. 15000)

import { createHash } from "node:crypto";

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

// Consulta el estado real de una transacción contra la API de Wompi (nunca confiar solo
// en el parámetro `id` que trae la redirección del navegador).
export async function consultarTransaccion(transaccionId) {
  const { WOMPI_PRIVATE_KEY } = process.env;
  const r = await fetch(`${API_BASE()}/transactions/${transaccionId}`, {
    headers: WOMPI_PRIVATE_KEY ? { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` } : {},
  });
  if (!r.ok) throw new Error(`Wompi respondió ${r.status} consultando la transacción.`);
  const { data } = await r.json();
  return data; // { id, status: "APPROVED"|"DECLINED"|"VOIDED"|"ERROR"|"PENDING", reference, amount_in_cents, ... }
}

// Verifica el checksum del evento del webhook (Eventos → "Secreto de eventos" en el dashboard).
export function verificarChecksumWebhook(payload) {
  const { EventChecksum, timestamp, data, signature } = payload || {};
  const secreto = process.env.WOMPI_EVENTS_SECRET;
  if (!secreto || !signature?.properties || !data) return false;
  const valores = signature.properties.map((p) => p.split(".").reduce((o, k) => o?.[k], { data })).join("");
  const calculado = createHash("sha256").update(`${valores}${timestamp}${secreto}`).digest("hex");
  return calculado === (EventChecksum || payload.checksum);
}
