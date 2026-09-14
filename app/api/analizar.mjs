// POST /api/analizar
// body JSON: { imagen: "data:image/jpeg;base64,...", modo: "con_agujas" | "oreja_limpia" }
// respuesta: { informe, debug }
//
// Pipeline:  visión (qwen3-vl-flash)  ->  RAG  ->  informe (qwen3-vl-plus)  ->  validar/sellar

import { chat, imageContent, parseJsonLoose, costo } from "./_lib/alibaba.mjs";
import { recuperar } from "./_lib/retrieve.mjs";
import { PROMPT_VISION, SEMIOLOGIA_REF, promptInforme } from "./_lib/prompts.mjs";
import { validar, avisosVault, sellar, schema } from "./_lib/validate.mjs";
import { exigirUsuario } from "./_lib/auth.mjs";
import { guardarInforme, resumenPublico } from "./_lib/guardar-informe.mjs";
import { query } from "./_lib/db.mjs";

const SCHEMA_TEXT = JSON.stringify(schema, null, 2);

// Visión = qwen3-vl-plus: el examen semiológico estructurado (recorrido por regiones + checklist)
// necesita salida JSON fiable; flash la rompe con esa longitud. Override con MODELO_VISION.
const MODELO_VISION = process.env.MODELO_VISION || "qwen3-vl-plus";
const MODELO_INFORME = process.env.MODELO_INFORME || "qwen-flash";
// El paso 3 es solo texto por defecto (rápido/barato: se apoya en la descripción del paso 1).
// INFORME_CON_IMAGEN=1 -> vuelve a enviar la foto (requiere un modelo con visión en MODELO_INFORME).
const INFORME_CON_IMAGEN = process.env.INFORME_CON_IMAGEN === "1";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST." });

  try {
    const usuario = await exigirUsuario(req, res);
    if (!usuario) return; // exigirUsuario ya respondió 401

    const { imagen, modo, oreja, consentimiento, consentimientoInvestigacion } =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!imagen?.startsWith("data:image/")) return res.status(400).json({ error: "Falta 'imagen' (data URL)." });
    if (!["con_agujas", "oreja_limpia"].includes(modo)) return res.status(400).json({ error: "'modo' inválido." });
    if (consentimiento !== true) return res.status(400).json({ error: "Falta el consentimiento para procesar la imagen." });
    if (consentimientoInvestigacion !== true)
      return res.status(400).json({ error: "Falta el consentimiento para uso de los datos en investigación." });
    const orejaUsuaria = ["izquierda", "derecha"].includes(oreja) ? oreja : null;

    // Se guarda una sola vez (la primera vez que consiente) -- CONSENT_VERSION debe coincidir
    // con el texto exacto que aprobó el comité de ética; súbela solo si el texto cambia de fondo.
    const CONSENT_VERSION = process.env.CONSENT_VERSION || "v1";
    await query(
      `update usuarios set
         consentimiento_app_en = coalesce(consentimiento_app_en, now()),
         consentimiento_app_version = coalesce(consentimiento_app_version, $2),
         consentimiento_investigacion_en = coalesce(consentimiento_investigacion_en, now()),
         consentimiento_investigacion_version = coalesce(consentimiento_investigacion_version, $2)
       where id = $1`,
      [usuario.id, CONSENT_VERSION]
    );

    const debug = { costos: [], tiempos: {}, consentimiento_en: new Date().toISOString() };

    // --- PASO 1 · visión --------------------------------------------------
    const v = await chat({
      model: MODELO_VISION,
      json: true,
      temperature: 0.1,
      maxTokens: 2000,
      messages: [
        { role: "system", content: `${SEMIOLOGIA_REF}\n\n${PROMPT_VISION}` },
        { role: "user", content: [imageContent(imagen), { type: "text", text: "Examina esta oreja." }] },
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
    // Enriquecer las zonas: las de "signos" + las del recorrido que no vienen normales + las de signos_especificos.
    const esp = obs.signos_especificos || {};
    const zonasRecorrido = (obs.recorrido || [])
      .filter((r) => r && !/^(rosad|normal)/i.test((r.color || "").trim()) || !/^normal/i.test((r?.relieve || "normal").trim()))
      .map((r) => r.region);
    const zonas = [...new Set([
      ...(obs.zonas_con_signo || []),
      ...zonasRecorrido,
      ...(esp.escamas || []), ...(esp.papulas_nodulos || []), ...(esp.vasos_visibles || []),
      ...(esp.pliegue_diagonal_lobulo || esp.surcos_lobulo ? ["lobulo"] : []),
    ])];
    const signos = [...new Set([
      ...(obs.signos || []).map((s) => s.signo),
      ...(esp.escamas?.length ? ["descamacion"] : []),
      ...(esp.papulas_nodulos?.length ? ["papula"] : []),
      ...(esp.vasos_visibles?.length ? ["telangiectasias/venas"] : []),
      ...(esp.pliegue_diagonal_lobulo ? ["pliegue"] : []),
      ...(esp.surcos_lobulo ? ["surco"] : []),
    ])];
    const rag = recuperar({ zonas, signos, colorGeneral: obs.color_general, puntos_visibles: [] });
    debug.rag = { notas: rag.notasUsadas.length, tokensEst: rag.tokensEst, noResueltos: rag.noResueltos, zonas, signos };

    // --- PASO 3 · informe ----------------------------------------------
    const sys = promptInforme({ modo, schemaText: SCHEMA_TEXT });
    const textPart = { type: "text", text:
      `MODO: ${modo}\n\nOBSERVACIONES DEL PASO DE VISIÓN:\n${JSON.stringify(obs, null, 2)}\n\n` +
      `CONTEXTO DE REFERENCIA:\n${rag.context}` };
    const userContent = INFORME_CON_IMAGEN ? [imageContent(imagen), textPart] : [textPart];

    let informe, errores = [], corte = false;
    for (let intento = 1; intento <= 2; intento++) {
      const msgs = [{ role: "system", content: sys }, { role: "user", content: userContent }];
      if (intento === 2) msgs.push({
        role: "user",
        content: corte
          ? `Tu respuesta anterior se cortó o no fue JSON válido. Devuelve el informe COMPLETO y más CONCISO: justificaciones y textos de 1 frase, "hallazgos_probables" máximo 2 por sistema.`
          : `El JSON anterior no validó. Corrige exactamente estos errores y devuelve SOLO el JSON:\n- ${errores.join("\n- ")}`,
      });
      const g = await chat({ model: MODELO_INFORME, json: true, temperature: 0.2, maxTokens: 4000, messages: msgs });
      debug.costos.push({ paso: `informe#${intento}`, modelo: MODELO_INFORME, ...costo(MODELO_INFORME, g.usage) });
      debug.tiempos[`informe${intento}_ms`] = g.ms;
      try { informe = parseJsonLoose(g.text); corte = false; }
      catch (e) { errores = [String(e.message)]; corte = true; continue; }
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

    // El informe completo se guarda en la base (foto incluida) y queda ligado al usuario que
    // inició sesión -- es la pieza que alimenta las métricas del artículo. Al navegador solo
    // le llega un resumen: el PDF completo se genera después, y solo si hay un pago aprobado.
    const informeId = await guardarInforme({ usuarioId: usuario.id, informe, fotoDataUrl: imagen });

    return res.status(200).json({ informe_id: informeId, resumen: resumenPublico(informe) });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

export const config = { maxDuration: 300 };
