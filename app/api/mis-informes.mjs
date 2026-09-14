// GET /api/mis-informes   ->   historial del usuario logueado, guardado en el servidor
// (reemplaza el historial que antes vivía solo en IndexedDB del dispositivo).

import { exigirUsuario } from "./_lib/auth.mjs";
import { query } from "./_lib/db.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Usa GET." });
  try {
    const usuario = await exigirUsuario(req, res);
    if (!usuario) return;

    const r = await query(
      `select i.id, i.caso_id, i.modo, i.creado_en,
              i.contrato->'infografico'->>'titulo' as titulo,
              (p.id is not null) as pagado
         from informes i
         left join pagos p on p.informe_id = i.id and p.estado = 'aprobado'
        where i.usuario_id = $1
        order by i.creado_en desc
        limit 50`,
      [usuario.id]
    );
    return res.status(200).json({ informes: r.rows });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
