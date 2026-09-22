// POST /api/checkout   body: { informe_id }   ->   { url, referencia }
// Crea la orden de pago en Wompi para desbloquear la descarga del PDF de un informe.

import { randomBytes } from "node:crypto";
import { exigirUsuario } from "./_lib/auth.mjs";
import { one, query } from "./_lib/db.mjs";
import { urlCheckout } from "./_lib/wompi.mjs";
import { errorInterno } from "./_lib/errores.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST." });
  try {
    const usuario = await exigirUsuario(req, res);
    if (!usuario) return;

    const { informe_id } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!informe_id) return res.status(400).json({ error: "Falta 'informe_id'." });

    const informe = await one("select id from informes where id = $1 and usuario_id = $2", [informe_id, usuario.id]);
    if (!informe) return res.status(404).json({ error: "Informe no encontrado." });

    const yaPagado = await one(
      "select id from pagos where informe_id = $1 and estado = 'aprobado' limit 1", [informe_id]
    );
    if (yaPagado) return res.status(200).json({ ya_pagado: true });

    const referencia = `pdf-${informe_id}-${randomBytes(4).toString("hex")}`;
    const origen = process.env.APP_ORIGIN;
    if (!origen) throw new Error("Falta APP_ORIGIN.");
    // vuelve a /app (la herramienta) SIN query string propio -- la doc de Wompi solo muestra
    // cómo agrega "?id=<transaccion>" cuando el redirect-url no trae ya un "?"; no dice qué
    // hace si ya existe uno (podría terminar en "...?informe_id=x?id=y", donde "id" deja de
    // ser una clave real del query string y pago-estado.mjs nunca ve el id de transacción).
    // No hace falta mandar informe_id acá: pago-estado.mjs ya lo recupera de la base a partir
    // de la referencia del pago, que sí viaja intacta en el propio registro de Wompi.
    const redirectUrl = `${origen}/app`;

    const { url, montoCentavos, moneda } = urlCheckout({ referencia, redirectUrl });

    await query(
      `insert into pagos (usuario_id, informe_id, referencia, monto_centavos, moneda, estado)
       values ($1, $2, $3, $4, $5, 'pendiente')`,
      [usuario.id, informe_id, referencia, montoCentavos, moneda]
    );

    return res.status(200).json({ url, referencia });
  } catch (e) {
    return errorInterno(res, e);
  }
}
