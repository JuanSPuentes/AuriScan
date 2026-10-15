// POST /api/admin-pago-verificar   body: { referencia, transaccion_id }   (solo rol=admin)
// ->   { estado_anterior, estado_nuevo, informe_id }
//
// Herramienta de último recurso para un pago huérfano (ver admin-pagos-pendientes.mjs): la
// doctora busca la referencia en el dashboard de Wompi (comercios.wompi.co → Transacciones),
// copia el ID de esa transacción acá, y este endpoint hace EXACTAMENTE lo mismo que
// pago-estado.mjs -- vuelve a consultar el estado real contra la API de Wompi, nunca se
// confía en lo que escriba quien llena el formulario. Solo cambia la base si Wompi confirma
// que esa transacción es, de verdad, la de esa referencia y por el monto correcto.

import { exigirAdmin } from "./_lib/auth.mjs";
import { one, query } from "./_lib/db.mjs";
import { consultarTransaccion } from "./_lib/wompi.mjs";
import { errorInterno } from "./_lib/errores.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST." });
  try {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const { referencia, transaccion_id } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!referencia || !transaccion_id) return res.status(400).json({ error: "Faltan 'referencia' y/o 'transaccion_id'." });

    const pago = await one("select * from pagos where referencia = $1", [referencia]);
    if (!pago) return res.status(404).json({ error: "No existe ningún pago con esa referencia." });

    const tx = await consultarTransaccion(transaccion_id);
    if (tx.reference !== referencia)
      return res.status(409).json({ error: `Esa transacción de Wompi es de la referencia "${tx.reference}", no de "${referencia}".` });
    if (tx.amount_in_cents !== pago.monto_centavos)
      return res.status(409).json({ error: `El monto de Wompi (${tx.amount_in_cents}) no coincide con el esperado (${pago.monto_centavos}).` });

    const estadoAnterior = pago.estado;
    let estadoNuevo = estadoAnterior;
    if (tx.status === "APPROVED") estadoNuevo = "aprobado";
    else if (["DECLINED", "ERROR", "VOIDED"].includes(tx.status)) estadoNuevo = "rechazado";

    if (estadoNuevo !== estadoAnterior) {
      await query(
        "update pagos set estado = $1, transaccion_id = $2, actualizado_en = now() where id = $3",
        [estadoNuevo, tx.id, pago.id]
      );
    }

    return res.status(200).json({
      estado_anterior: estadoAnterior,
      estado_nuevo: estadoNuevo,
      estado_wompi: tx.status,
      informe_id: pago.informe_id,
    });
  } catch (e) {
    return errorInterno(res, e);
  }
}
