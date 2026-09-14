// Guarda un informe completo: fila en `informes` (jsonb) + filas derivadas en
// `informes_puntos` / `informes_sistemas` (para que las métricas del artículo sean
// un GROUP BY directo, sin tener que parsear el jsonb cada vez) + la foto en OSS.

import { tx } from "./db.mjs";
import { subirFoto } from "./oss.mjs";

export async function guardarInforme({ usuarioId, informe, fotoDataUrl }) {
  return tx(async (c) => {
    const r = await c.query(
      `insert into informes (usuario_id, caso_id, contrato, modo, oreja, modelo_ia)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        usuarioId,
        informe.meta?.caso_id || null,
        JSON.stringify(informe),
        informe.meta?.modo || null,
        informe.meta?.oreja || null,
        informe.meta?.modelo_ia || null,
      ]
    );
    const informeId = r.rows[0].id;

    const puntos = informe.evaluacion_protocolo?.puntos || [];
    for (const p of puntos) {
      await c.query(
        `insert into informes_puntos (informe_id, orden, nombre, codigo_za, categoria, estado, sistema)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [informeId, p.orden ?? null, p.nombre, p.codigo_za || null, p.categoria || null, p.estado || null, p.sistema || null]
      );
    }

    const sistemas = informe.hipotesis_diagnostica?.sistemas || [];
    for (const s of sistemas) {
      await c.query(
        `insert into informes_sistemas (informe_id, sistema, titulo, confianza) values ($1, $2, $3, $4)`,
        [informeId, s.sistema, s.titulo || null, s.confianza || null]
      );
    }

    if (fotoDataUrl) {
      const key = await subirFoto(informeId, fotoDataUrl);
      await c.query(`insert into archivos (informe_id, tipo, oss_key) values ($1, 'foto', $2)`, [informeId, key]);
    }

    return informeId;
  });
}

// El resumen que sí se manda al navegador antes de pagar -- nada de puntos, tratamiento
// ni mapa. Solo lo necesario para que la persona entienda que hay un resultado real.
export function resumenPublico(informe) {
  const hd = informe.hipotesis_diagnostica || {};
  return {
    caso_id: informe.meta?.caso_id,
    fecha: informe.meta?.fecha,
    diagnostico_principal: hd.diagnostico_principal || null,
    sistemas: (hd.sistemas || []).map((s) => s.titulo || s.sistema),
    disclaimer: informe.disclaimer,
  };
}
