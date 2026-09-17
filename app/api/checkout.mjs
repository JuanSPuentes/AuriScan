// POST /api/checkout   body: { informe_id }   ->   { url, referencia }
// Crea la orden de pago en Wompi para desbloquear la descarga del PDF de un informe.

import { randomBytes } from "node:crypto";
import { exigirUsuario } from "./_lib/auth.mjs";
import { one, query } from "./_lib/db.mjs";
import { urlCheckout } from "./_lib/wompi.mjs";

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
    // vuelve a /app (la herramienta), no a "/" -- ahí es donde vive el manejo del retorno de pago.
    const redirectUrl = `${origen}/app?informe_id=${informe_id}`;

    const { url, montoCentavos, moneda } = urlCheckout({ referencia, redirectUrl });

    await query(
      `insert into pagos (usuario_id, informe_id, referencia, monto_centavos, moneda, estado)
       values ($1, $2, $3, $4, $5, 'pendiente')`,
      [usuario.id, informe_id, referencia, montoCentavos, moneda]
    );

    return res.status(200).json({ url, referencia });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
