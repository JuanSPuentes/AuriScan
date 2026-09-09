// POST /api/analizar
// body JSON: { imagen: "data:image/jpeg;base64,...", modo: "con_agujas" | "oreja_limpia" }
// respuesta: { informe, debug }
//
// Pipeline:  visión (qwen3-vl-flash)  ->  RAG  ->  informe (qwen3-vl-plus)  ->  validar/sellar

import { chat, imageContent, parseJsonLoose, costo } from "./_lib/alibaba.mjs";
import { recuperar } from "./_lib/retrieve.mjs";
import { PROMPT_VISION, promptInforme } from "./_lib/prompts.mjs";
import { validar, avisosVault, sellar, schema } from "./_lib/validate.mjs";

const SCHEMA_TEXT = JSON.stringify(schema, null, 2);

const MODELO_VISION = process.env.MODELO_VISION || "qwen3-vl-flash";
const MODELO_INFORME = process.env.MODELO_INFORME || "qwen-flash";
// El paso 3 es solo texto por defecto (rápido/barato: se apoya en la descripción del paso 1).
// INFORME_CON_IMAGEN=1 -> vuelve a enviar la foto (requiere un modelo con visión en MODELO_INFORME).
const INFORME_CON_IMAGEN = process.env.INFORME_CON_IMAGEN === "1";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST." });

  try {
    const { imagen, modo, oreja, consentimiento } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!imagen?.startsWith("data:image/")) return res.status(400).json({ error: "Falta 'imagen' (data URL)." });
    if (!["con_agujas", "oreja_limpia"].includes(modo)) return res.status(400).json({ error: "'modo' inválido." });
    if (consentimiento !== true) return res.status(400).json({ error: "Falta el consentimiento para procesar la imagen." });
    const orejaUsuaria = ["izquierda", "derecha"].includes(oreja) ? oreja : null;

    const debug = { costos: [], tiempos: {}, consentimiento_en: new Date().toISOString() };

    // --- PASO 1 · visión --------------------------------------------------
    const v = await chat({
      model: MODELO_VISION,
      json: true,
      temperature: 0.1,
      maxTokens: 1200,
      messages: [
        { role: "system", content: PROMPT_VISION },
        { role: "user", content: [imageContent(imagen), { type: "text", text: "Describe esta oreja." }] },
      ],
    });
    const obs = parseJsonLoose(v.text);
    debug.observacion = obs;
    debug.costos.push({ paso: "vision", modelo: MODELO_VISION, ...costo(MODELO_VISION, v.usage) });
    debug.tiempos.vision_ms = v.ms;

    // --- corte temprano: imagen no apta (ahorra el paso del informe) ----
    if (obs.es_oreja === false)
      return res.status(200).json({ rechazo: "no_es_oreja", debug,
        mensaje: "La imagen no parece una oreja. Sube una foto lateral del pabellón auricular." });
    if (obs.calidad === "insuficiente")
      return res.status(200).json({ rechazo: "calidad", debug,
        mensaje: "La foto no tiene calidad suficiente (borrosa, oscura o mal encuadrada). Repite con buena luz y la oreja nítida y centrada." });

    // --- PASO 2 · recuperación (local, sin coste) -----------------------
    const rag = recuperar({
      zonas: obs.zonas_con_signo,
      signos: (obs.signos || []).map((s) => s.signo),
      puntos_visibles: [], // en oreja limpia no hay; con agujas, el modelo del paso 3 los deduce
    });
    debug.rag = { notas: rag.notasUsadas.length, tokensEst: rag.tokensEst, noResueltos: rag.noResueltos };

    // --- PASO 3 · informe ----------------------------------------------
    const sys = promptInforme({ modo, schemaText: SCHEMA_TEXT });
    const textPart = { type: "text", text:
      `MODO: ${modo}\n\nOBSERVACIONES DEL PASO DE VISIÓN:\n${JSON.stringify(obs, null, 2)}\n\n` +
      `CONTEXTO DE REFERENCIA:\n${rag.context}` };
    const userContent = INFORME_CON_IMAGEN ? [imageContent(imagen), textPart] : [textPart];

    let informe, errores = [];
    for (let intento = 1; intento <= 2; intento++) {
      const msgs = [{ role: "system", content: sys }, { role: "user", content: userContent }];
      if (intento === 2) msgs.push({
        role: "user",
        content: `El JSON anterior no validó. Corrige exactamente estos errores y devuelve SOLO el JSON:\n- ${errores.join("\n- ")}`,
      });
      const g = await chat({ model: MODELO_INFORME, json: true, temperature: 0.2, maxTokens: 3000, messages: msgs });
      debug.costos.push({ paso: `informe#${intento}`, modelo: MODELO_INFORME, ...costo(MODELO_INFORME, g.usage) });
      debug.tiempos[`informe${intento}_ms`] = g.ms;
      try { informe = parseJsonLoose(g.text); } catch (e) { errores = [String(e.message)]; continue; }
      const r = validar(informe);
      if (r.ok) { errores = []; break; }
      errores = r.errors;
      debug[`erroresValidacion${intento}`] = r.errors;
    }
    if (errores.length) return res.status(502).json({ error: "El modelo no produjo un informe válido.", errores, debug });

    // --- sellado + avisos ---------------------------------------------
    sellar(informe, { modo, modelo: MODELO_INFORME, oreja: orejaUsuaria });
    debug.avisosVault = avisosVault(informe);
    debug.costoTotalUsd = +debug.costos.reduce((s, c) => s + (c?.usd || 0), 0).toFixed(5);

    return res.status(200).json({ informe, debug });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

export const config = { maxDuration: 300 };
