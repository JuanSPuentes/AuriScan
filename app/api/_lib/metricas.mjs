// Consultas de métricas para el artículo -- un solo lugar, usado tanto por /api/admin-metricas
// (JSON para el panel) como por /api/admin-metricas-excel (.xlsx descargable). limitePuntos
// existe porque el panel en pantalla solo necesita un vistazo (30), pero la descarga es para
// analizar de verdad -- ahí no tiene sentido cortar la lista.
import { query } from "./db.mjs";

export async function obtenerMetricas({ limitePuntos = null } = {}) {
  const [totalInformes, sistemas, puntos, pagos] = await Promise.all([
    query("select count(*)::int as n from informes"),
    query(
      `select sistema, count(*)::int as n
         from informes_sistemas group by sistema order by n desc`
    ),
    query(
      `select nombre, estado, count(*)::int as n
         from informes_puntos group by nombre, estado order by n desc
         ${limitePuntos ? "limit $1" : ""}`,
      limitePuntos ? [limitePuntos] : []
    ),
    query(
      `select count(*)::int as n, coalesce(sum(monto_centavos),0)::bigint as total_centavos
         from pagos where estado = 'aprobado'`
    ),
  ]);

  return {
    total_informes: totalInformes.rows[0].n,
    sistemas_implicados: sistemas.rows,   // = "desequilibrio", mismo dato
    puntos_mas_frecuentes: puntos.rows,
    pagos_aprobados: pagos.rows[0],
  };
}
