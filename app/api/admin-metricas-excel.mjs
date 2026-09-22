// GET /api/admin-metricas-excel   ->   las mismas métricas de /api/admin-metricas, como
// archivo .xlsx descargable (solo rol=admin). Sin el límite de 30 puntos que sí tiene el
// panel en pantalla -- esto es para analizar de verdad, no para un vistazo rápido.

import ExcelJS from "exceljs";
import { exigirAdmin } from "./_lib/auth.mjs";
import { obtenerMetricas } from "./_lib/metricas.mjs";
import { errorInterno } from "./_lib/errores.mjs";

const AZUL = "FF1F4E79";

function hojaTabla(wb, nombre, columnas, filas) {
  const hoja = wb.addWorksheet(nombre);
  hoja.columns = columnas.map((c) => ({ header: c.titulo, key: c.clave, width: c.ancho || 22 }));
  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  for (const f of filas) hoja.addRow(f);
  hoja.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + columnas.length)}1` };
  return hoja;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Usa GET." });
  try {
    const admin = await exigirAdmin(req, res);
    if (!admin) return;

    const datos = await obtenerMetricas({ limitePuntos: null });

    const wb = new ExcelJS.Workbook();
    wb.creator = "AuriScan";
    wb.created = new Date();

    const resumen = wb.addWorksheet("Resumen");
    resumen.columns = [{ key: "campo", width: 32 }, { key: "valor", width: 22 }];
    resumen.addRows([
      ["Informes guardados", datos.total_informes],
      ["Pagos aprobados", datos.pagos_aprobados.n],
      ["Total pagado (COP)", Number(datos.pagos_aprobados.total_centavos) / 100],
      ["Generado", new Date().toISOString().slice(0, 19).replace("T", " ")],
    ]);
    resumen.getColumn(1).font = { bold: true };

    hojaTabla(wb, "Sistemas implicados",
      [{ titulo: "Sistema", clave: "sistema", ancho: 28 }, { titulo: "Informes", clave: "n", ancho: 14 }],
      datos.sistemas_implicados.map((s) => ({ sistema: s.sistema, n: s.n })));

    hojaTabla(wb, "Puntos más frecuentes",
      [
        { titulo: "Punto", clave: "nombre", ancho: 32 },
        { titulo: "Estado", clave: "estado", ancho: 16 },
        { titulo: "Veces", clave: "n", ancho: 12 },
      ],
      datos.puntos_mas_frecuentes.map((p) => ({ nombre: p.nombre, estado: p.estado, n: p.n })));

    const buffer = await wb.xlsx.writeBuffer();
    const nombreArchivo = `auriscan-metricas-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    return errorInterno(res, e, "No se pudo generar el Excel. Intenta de nuevo en unos minutos.");
  }
}
