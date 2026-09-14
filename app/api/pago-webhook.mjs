// POST /api/pago-webhook   -- lo llama Wompi directamente (sin sesión de usuario), como
// respaldo por si el navegador se cierra a mitad del pago. Verifica el checksum del evento
// (Wompi → Eventos → "Secreto de eventos") antes de tocar nada.

import { query } from "./_lib/db.mjs";
import { verificarChecksumWebhook } from "./_lib/wompi.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST." });
  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!verificarChecksumWebhook(payload)) return res.status(401).json({ error: "Checksum inválido." });

    const tx = payload?.data?.transaction;
    if (!tx?.reference) return res.status(200).json({ ok: true }); // evento que no nos interesa

    if (tx.status === "APPROVED") {
      await query(
        `update pagos set estado = 'aprobado', transaccion_id = $1, actualizado_en = now()
         where referencia = $2 and estado <> 'aprobado' and monto_centavos = $3`,
        [tx.id, tx.reference, tx.amount_in_cents]
      );
    } else if (["DECLINED", "ERROR", "VOIDED"].includes(tx.status)) {
      await query(
        `update pagos set estado = 'rechazado', transaccion_id = $1, actualizado_en = now()
         where referencia = $2 and estado = 'pendiente'`,
        [tx.id, tx.reference]
      );
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
