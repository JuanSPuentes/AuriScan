// GET /api/admin-pagos-pendientes   ->   pagos que quedaron en "pendiente" hace rato (solo rol=admin).
//
// Por qué existe: un pago se confirma por dos caminos automáticos -- el webhook de Wompi
// (server a server, funciona aunque el navegador se cierre) y la vuelta del navegador a /app,
// que vuelve a consultar el estado real contra la API de Wompi (pago-estado.mjs). Si AMBOS
// fallan a la vez (el cliente cierra la pestaña antes de volver y justo entonces el webhook
// no pudo escribir en la base, por ejemplo), el pago queda huérfano: Wompi ya cobró, pero acá
// sigue en "pendiente" para siempre. Este endpoint es la forma de VER que eso pasó -- el panel
// usa admin-pago-verificar.mjs para resolverlo.
//
// "Hace rato" = más de 15 minutos: un pago recién creado está pendiente sin que sea un
// problema (la persona puede seguir en el checkout de Wompi en otra pestaña).

import { exigirAdmin } from "./_lib/auth.mjs";
import { query } from "./_lib/db.mjs";
import { errorInterno } from "./_lib/errores.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Usa GET." });
  try {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const r = await query(
      `select p.id, p.referencia, p.monto_centavos, p.moneda, p.creado_en,
              i.id as informe_id, i.caso_id,
              u.email
         from pagos p
         join informes i on i.id = p.informe_id
         join usuarios u on u.id = p.usuario_id
        where p.estado = 'pendiente' and p.creado_en < now() - interval '15 minutes'
        order by p.creado_en desc
        limit 100`
    );
    return res.status(200).json({ pagos: r.rows });
  } catch (e) {
    return errorInterno(res, e);
  }
}
