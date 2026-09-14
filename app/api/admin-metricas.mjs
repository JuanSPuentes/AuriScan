// GET /api/admin-metricas   ->   agregados para el artículo (solo rol=admin).
// puntos más propuestos/observados, sistemas más implicados (= "desequilibrio").

import { exigirAdmin } from "./_lib/auth.mjs";
import { query } from "./_lib/db.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Usa GET." });
  try {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const [totalInformes, sistemas, puntos, pagos] = await Promise.all([
      query("select count(*)::int as n from informes"),
      query(
        `select sistema, count(*)::int as n
           from informes_sistemas group by sistema order by n desc`
      ),
      query(
        `select nombre, estado, count(*)::int as n
           from informes_puntos group by nombre, estado order by n desc limit 30`
      ),
      query(
        `select count(*)::int as n, coalesce(sum(monto_centavos),0)::bigint as total_centavos
           from pagos where estado = 'aprobado'`
      ),
    ]);

    return res.status(200).json({
      total_informes: totalInformes.rows[0].n,
      sistemas_implicados: sistemas.rows,   // = "desequilibrio", mismo dato
      puntos_mas_frecuentes: puntos.rows,
      pagos_aprobados: pagos.rows[0],
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
