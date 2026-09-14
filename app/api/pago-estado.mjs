// POST /api/pago-estado   body: { transaccion_id }   ->   { aprobado, informe_id }
// Se llama cuando el navegador vuelve de Wompi. Nunca se confía en el parámetro de la
// redirección solo: se re-consulta el estado real de la transacción contra la API de Wompi.

import { exigirUsuario } from "./_lib/auth.mjs";
import { one, query } from "./_lib/db.mjs";
import { consultarTransaccion } from "./_lib/wompi.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST." });
  try {
    const usuario = await exigirUsuario(req, res);
    if (!usuario) return;

    const { transaccion_id } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!transaccion_id) return res.status(400).json({ error: "Falta 'transaccion_id'." });

    const tx = await consultarTransaccion(transaccion_id);
    const pago = await one(
      "select * from pagos where referencia = $1 and usuario_id = $2", [tx.reference, usuario.id]
    );
    if (!pago) return res.status(404).json({ error: "No se encontró la orden de pago." });

    if (tx.status === "APPROVED" && tx.amount_in_cents === pago.monto_centavos) {
      await query(
        "update pagos set estado = 'aprobado', transaccion_id = $1, actualizado_en = now() where id = $2",
        [tx.id, pago.id]
      );
      return res.status(200).json({ aprobado: true, informe_id: pago.informe_id });
    }

    if (tx.status === "DECLINED" || tx.status === "ERROR" || tx.status === "VOIDED") {
      await query(
        "update pagos set estado = 'rechazado', transaccion_id = $1, actualizado_en = now() where id = $2",
        [tx.id, pago.id]
      );
    }
    return res.status(200).json({ aprobado: false, estado_wompi: tx.status });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
