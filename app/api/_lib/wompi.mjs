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

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Un intento de GET /transactions/{id} con una llave dada. Devuelve { data } en éxito,
// o lanza con r.status pegado al error (para que el que llama decida si reintenta).
async function intentoConsulta(transaccionId, llave) {
  const r = await fetch(`${API_BASE()}/transactions/${transaccionId}`, {
    headers: llave ? { Authorization: `Bearer ${llave}` } : {},
  });
  if (r.ok) return (await r.json()).data;
  const e = new Error(`Wompi respondió ${r.status} consultando la transacción.`);
  e.status = r.status;
  throw e;
}

// Consulta el estado real de una transacción contra la API de Wompi (nunca confiar solo
// en el parámetro `id` que trae la redirección del navegador).
//
// Reintenta solo las fallas del lado de Wompi (5xx o la petición misma fallando por red):
// ya pasó en producción que Wompi respondió un 500 pasajero justo cuando el navegador volvía
// del pago, y sin reintento eso le negaba el PDF a alguien que sí había pagado -- quedaba un
// pago "pendiente" huérfano que solo se podía arreglar a mano. Un 4xx (llave inválida, id mal
// formado, etc.) no se reintenta: reintentarlo no lo arregla, solo demora el error real.
//
// RESPALDO TEMPORAL (15 oct 2026): la WOMPI_PRIVATE_KEY de producción le hace dar 500 a este
// endpoint de forma consistente y reproducible (confirmado con curl directo, llave recopiada
// del dashboard dos veces) -- es un bug del lado de Wompi específico de esta cuenta, reportado
// a su soporte. Mientras lo arreglan, si los 3 intentos con la privada fallan por 5xx, se
// reintenta UNA vez con la WOMPI_PUBLIC_KEY (que sí funciona). No afloja la seguridad: quien
// llama a esto siempre revalida reference/amount_in_cents contra lo guardado antes de aprobar
// nada, sin importar qué llave trajo los datos. Borrar este respaldo (y el log de aviso) en
// cuanto Wompi confirme que arregló la llave privada.
export async function consultarTransaccion(transaccionId, intentos = 3) {
  if (!RE_TRANSACCION_ID.test(transaccionId || ""))
    throw new Error("Identificador de transacción inválido.");
  const { WOMPI_PRIVATE_KEY, WOMPI_PUBLIC_KEY } = process.env;
  let ultimoError;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await intentoConsulta(transaccionId, WOMPI_PRIVATE_KEY);
    } catch (e) {
      ultimoError = e;
      if (e.status && e.status < 500) break; // no se reintenta más veces, pero sí se prueba el respaldo de abajo
      if (intento < intentos) await dormir(400 * intento); // 400ms, 800ms
    }
  }
  if (WOMPI_PUBLIC_KEY) {
    try {
      const data = await intentoConsulta(transaccionId, WOMPI_PUBLIC_KEY);
      console.error(
        `[wompi] RESPALDO: la llave privada falló ${intentos} veces para ${transaccionId}; ` +
        `se usó la llave pública como último recurso. Revisar con soporte de Wompi por qué ` +
        `la privada está dando 500 -- esto no debería ser permanente.`
      );
      return data;
    } catch {
      // si también falla con la pública, se reporta el error original de la privada (más útil).
    }
  }
  throw ultimoError;
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
