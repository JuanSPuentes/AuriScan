// Validación del informe contra el schema + relleno de campos [backend] + disclaimer forzado.

import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { vaultTiene, zonaConocida } from "./retrieve.mjs";
import schema from "./informe.schema.json" with { type: "json" };

export { schema };

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const _validate = ajv.compile(schema);

export const DISCLAIMER =
  "Este material es de apoyo, de carácter educativo, y no configura un diagnóstico clínico. Si " +
  "deseas acceder a una consulta con una médica especialista, agenda tu cita con la Dra. Jakeline " +
  "Caro al whatsapp +57 310 817 8456.";

export function validar(informe) {
  const ok = _validate(informe);
  return { ok, errors: (_validate.errors || []).map((e) => `${e.instancePath || "/"} ${e.message}`) };
}

// Validación blanda contra el cerebro: avisa de ids/zonas/puntos que no existen.
export function avisosVault(informe) {
  const avisos = [];
  const zs = [
    ...(informe?.observacion_visual?.signos || []).flatMap((s) => s.zonas || []),
    ...(informe?.hipotesis_diagnostica?.sistemas || []).flatMap((s) => s.zonas || []),
  ];
  const zonaGenerica = (z) => /^(general|generalizad|toda[- ]la[- ]auricul|difus)/i.test(String(z || ""));
  for (const z of zs) if (!zonaGenerica(z) && !zonaConocida(z)) avisos.push(`zona no reconocida: "${z}"`);
  for (const p of informe?.evaluacion_protocolo?.puntos || []) {
    if (p.id && !vaultTiene(p.id)) avisos.push(`punto sin nota en el cerebro: "${p.id}"`);
  }
  return [...new Set(avisos)];
}

// Rellena lo que pone el backend y fuerza el disclaimer.
export function sellar(informe, { modo, modelo, oreja }) {
  const now = new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const ymd = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const hms = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const id = `AUR-${ymd}-${hms}`;         // referencia = fecha + hora, no un nº correlativo
  const hhmm = hms.slice(0, 4);
  informe.schema_version = "1.1";
  informe.meta = {
    ...informe.meta,
    caso_id: id,
    fecha: now.toISOString().slice(0, 10),
    generado_en: now.toISOString(),
    modelo_ia: modelo,
    modo,
    // La usuaria sabe qué oreja es; su elección manda. Si no la indicó, "no_determinada"
    // (no fiarse del modelo: no distingue izq/der en una foto de perfil).
    oreja: oreja || "no_determinada",
  };
  informe.disclaimer = DISCLAIMER;
  informe.infografico = informe.infografico || {};
  if (informe.analisis_viable === false) {
    informe.infografico.titulo = `Caso ${hhmm} · Imagen no analizable`;
  } else {
    const m = informe.meta.motivo;
    const hayMotivo = m && !/no especificad|sin especificar|no determinad/i.test(m);
    informe.infografico.titulo = hayMotivo ? `Caso ${hhmm} · ${m}` : `Caso ${hhmm} · Análisis auricular`;
  }
  return informe;
}
