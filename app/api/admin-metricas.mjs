// GET /api/admin-metricas   ->   agregados para el artículo (solo rol=admin).
// puntos más propuestos/observados, sistemas más implicados (= "desequilibrio").

import { exigirAdmin } from "./_lib/auth.mjs";
import { obtenerMetricas } from "./_lib/metricas.mjs";
import { errorInterno } from "./_lib/errores.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Usa GET." });
  try {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const datos = await obtenerMetricas({ limitePuntos: 30 });
    return res.status(200).json(datos);
  } catch (e) {
    return errorInterno(res, e);
  }
}
