// Construye el documento del informe (foto + infográfico + narrativa) desde el JSON del contrato.
// Sin dependencias ni APIs de DOM: solo devuelve strings. Se usa en el navegador y en el smoke test.

import coords from "../api/_lib/coordenadas-oreja.json" with { type: "json" };

// --- paleta azul --------------------------------------------------------
const C = {
  tinta: "#12243b", tintaSuave: "#3f5675", azul: "#1f4e79", azulVivo: "#2e6da8",
  azulClaro: "#dbe8f4", papel: "#f4f7fb", linea: "#c6d5e6", ocre: "#9c5628", ok: "#2c6a4b",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SISTEMA_TITULO = {
  musculoesqueletico: "Sistema musculoesquelético",
  digestivo: "Sistema digestivo",
  cardiorrespiratorio: "Sistema cardiorrespiratorio",
  urogenital: "Sistema urogenital",
  neuroendocrino: "Eje neuroendocrino",
  "neuro-psicologico": "Eje neuro-psicológico",
  sensorial: "Eje sensorial",
  "homeostasis-general": "Homeostasis general",
  circulatorio: "Sistema circulatorio",
  piel: "Piel",
  otro: "Otro",
};

// --- ilustración esquemática de la oreja (izquierda, vista lateral) -----
const W = 360, H = 560;
function pos(punto) {
  const za = (punto.codigo_za || "").replace(/\s*\/\s*/g, "/").trim();
  const nom = punto.nombre || punto.id || "";
  const c = coords.puntos[za]
    || coords.puntos[punto.codigo_za]
    || Object.values(coords.puntos).find((p) => p.nombre === nom || p.nombre === punto.id)
    || coords.fallback_por_zona[(punto.zonas && punto.zonas[0]) || ""]
    || { x: 0.45, y: 0.5 };
  return { x: c.x * W, y: c.y * H, oculto: !!c.oculto };
}

function earSVG(puntos) {
  const marcas = puntos.map((p, i) => {
    const { x, y, oculto } = pos(p);
    return `<g>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="${oculto ? "#fff" : C.azul}" stroke="${C.azul}" stroke-width="2"/>
      <text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="700" fill="${oculto ? C.azul : "#fff"}">${p.orden ?? i + 1}</text>
    </g>`;
  }).join("");
  const lbl = (x, y, t) => `<text x="${x}" y="${y}" font-family="IBM Plex Sans,sans-serif" font-size="10" fill="${C.tintaSuave}" opacity="0.75">${t}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa auricular esquemático">
    <defs><radialGradient id="piel" cx="42%" cy="38%" r="72%"><stop offset="0%" stop-color="#eef4fb"/><stop offset="100%" stop-color="#dae7f4"/></radialGradient></defs>
    <path d="M138,26 C78,34 46,110 44,200 C42,286 52,372 84,446 C104,494 142,528 186,522 C232,516 250,470 242,420 C236,388 214,368 214,368 C266,372 288,300 262,252 C286,214 276,132 240,92 C210,58 182,20 138,26 Z" fill="url(#piel)" stroke="${C.azul}" stroke-width="3"/>
    <path d="M138,40 C86,52 60,120 58,204 C56,286 66,368 96,438" fill="none" stroke="${C.azulVivo}" stroke-width="9" stroke-linecap="round" opacity="0.85"/>
    <path d="M150,300 C150,240 148,180 158,140" fill="none" stroke="${C.tintaSuave}" stroke-width="6" stroke-linecap="round"/>
    <path d="M158,140 C170,118 196,112 214,120" fill="none" stroke="${C.tintaSuave}" stroke-width="6" stroke-linecap="round"/>
    <path d="M158,140 C138,150 128,178 130,206" fill="none" stroke="${C.tintaSuave}" stroke-width="6" stroke-linecap="round"/>
    <path d="M150,300 C154,340 160,372 170,392" fill="none" stroke="${C.tintaSuave}" stroke-width="6" stroke-linecap="round"/>
    <path d="M160,150 C150,168 150,188 156,204 C176,196 190,164 196,138 C182,132 168,138 160,150 Z" fill="#e6eef8" stroke="${C.linea}" stroke-width="1.5"/>
    <path d="M112,232 C96,268 96,330 118,372 C140,392 176,388 190,352 C202,316 198,262 176,232 C154,214 128,214 112,232 Z" fill="#c9dcef" stroke="${C.linea}" stroke-width="2"/>
    <path d="M214,262 C244,258 250,312 228,326 C212,320 206,276 214,262 Z" fill="#dbe8f4" stroke="${C.tintaSuave}" stroke-width="2"/>
    <path d="M172,352 C200,346 222,364 218,388 C198,392 176,378 172,352 Z" fill="#dbe8f4" stroke="${C.tintaSuave}" stroke-width="2"/>
    <path d="M150,398 C126,428 130,486 172,502 C214,514 244,486 240,448 C236,414 192,392 150,398 Z" fill="#eef4fb" stroke="${C.linea}" stroke-width="2"/>
    ${lbl(40, 116, "hélix")} ${lbl(196, 132, "fosa tr.")} ${lbl(118, 312, "concha")}
    ${lbl(240, 300, "trago")} ${lbl(150, 380, "antitr.")} ${lbl(176, 470, "lóbulo")}
    ${marcas}
  </svg>`;
}


const PIE_MARCA = "Dra. Jakeline Caro · Medicina Integrativa y Salud Digital";
const PIE_CONTACTO = "Medicinaintegrativadrajakeline@gmail.com";
// Cabecera de marca: emblema + nombre tipografiado (el lockup vertical no se lee a tamaño de cabecera).
const marcaHead = (logo) => `<div class="marca-head">
  ${logo ? `<img class="emblema" src="${logo}" alt="">` : ""}
  <div class="marca-txt"><span class="marca-nombre">Dra. Jakeline Caro</span>
  <span class="marca-sub">Medicina Integrativa y Salud Digital</span></div>
</div>`;

// --- infográfico (página 1) -------------------------------------------
function infograficoHTML(inf, fotoDataUrl, logoDataUrl) {
  const puntos = inf.evaluacion_protocolo?.puntos || [];
  const sistemas = inf.hipotesis_diagnostica?.sistemas || [];

  const fotoBox = fotoDataUrl
    ? `<figure class="foto"><img src="${fotoDataUrl}" alt="Oreja analizada"/><figcaption>Imagen analizada</figcaption></figure>`
    : `<div class="foto foto-vacia">Sin imagen adjunta</div>`;

  const listaPuntos = puntos.map((p) => `
    <li><span class="num">${p.orden}</span>
      <span><b>${esc(p.nombre)}</b>${p.codigo_za ? ` · <span class="za">${esc(p.codigo_za)}</span>` : ""}
      ${p.estado === "propuesto" ? ' <span class="tag">propuesto</span>' : ""}
      ${p.localizacion ? `<br><span class="loc">${esc(p.localizacion)}</span>` : ""}</span></li>`).join("");

  const panelSistemas = sistemas.length ? sistemas.map((s) => `
    <div class="sist">
      <h4>${esc(s.titulo || SISTEMA_TITULO[s.sistema] || s.sistema)}</h4>
      ${s.base_observacional ? `<p class="base">${esc(s.base_observacional)}</p>` : ""}
      ${s.region_corporal ? `<p class="reg"><b>Región:</b> ${esc(s.region_corporal)}</p>` : ""}
      ${s.hallazgos_probables?.length ? `<ul>${s.hallazgos_probables.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
    </div>`).join("")
    : `<p class="sin">${esc(inf.hipotesis_diagnostica?.resumen || "Coloración homogénea; sin zonas de reactividad diferencial.")}</p>`;

  return `<section class="pagina infografico">
    <header>
      ${marcaHead(logoDataUrl)}
      <p class="marca">Análisis de imagen · auriculoterapia</p>
      <h1>${esc(inf.infografico?.titulo || "Informe auricular")}</h1>
      <p class="sub">${inf.meta?.oreja && inf.meta.oreja !== "no_determinada" ? "Oreja " + esc(inf.meta.oreja) + " · " : ""}vista ${esc(inf.meta?.vista || "lateral")} ·
        ${inf.meta?.modo === "con_agujas" ? "puntos observados" : "puntos propuestos"} · ${esc(inf.meta?.fecha || "")}</p>
    </header>

    <div class="cuerpo">
      ${fotoBox}
      <div class="mapa">${earSVG(puntos)}
        <p class="leyenda">Mapa de referencia · <span class="pt-lleno"></span> superficie &nbsp; <span class="pt-vacio"></span> vista oculta</p>
      </div>
    </div>

    <div class="bloque">
      <h3>Puntos ${inf.meta?.modo === "con_agujas" ? "observados" : "propuestos"}</h3>
      <ol class="puntos">${listaPuntos || "<li>—</li>"}</ol>
    </div>

    <div class="bloque">
      <h3>Sistemas implicados</h3>
      <div class="grid-sist">${panelSistemas}</div>
    </div>

    <div class="cierre">
      <div><h3>Razonamiento</h3><p>${esc(inf.infografico?.razonamiento || "")}</p></div>
      <div><h3>Conclusión</h3><p>${esc(inf.infografico?.conclusion || "")}</p></div>
    </div>
    <footer>
      <span class="pie-marca">${PIE_MARCA}</span><br>
      <span class="pie-contacto">${PIE_CONTACTO}</span><br>
      ${esc(inf.disclaimer || "")}
    </footer>
  </section>`;
}

// --- narrativa clínica (páginas 2+) ----------------------------------
function tabla(headers, filas) {
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function narrativaHTML(inf, logoDataUrl) {
  const ov = inf.observacion_visual || {};
  const hd = inf.hipotesis_diagnostica || {};
  const ep = inf.evaluacion_protocolo || {};
  const pr = inf.pronostico || {};

  const signos = tabla(
    ["Signo", "Color", "Localización", "Ext.", "Interpretación"],
    (ov.signos || []).map((s) => [esc(s.signo), esc((s.color || "").replace(/_/g, " ")),
      esc(s.localizacion), esc(s.extension || ""), esc(s.interpretacion)]));

  const sistemas = (hd.sistemas || []).map((s) => `
    <div class="bloque-sist">
      <h4>${esc(s.titulo || SISTEMA_TITULO[s.sistema] || s.sistema)}</h4>
      ${s.base_observacional ? `<p class="pa"><b>Base:</b> ${esc(s.base_observacional)}</p>` : ""}
      ${s.region_corporal ? `<p class="pa"><b>Región corporal:</b> ${esc(s.region_corporal)}</p>` : ""}
      ${s.puntos_asociados?.length ? `<p class="pa"><b>Puntos:</b> ${s.puntos_asociados.map(esc).join(", ")}</p>` : ""}
      ${s.hallazgos_probables?.length ? `<ul>${s.hallazgos_probables.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
    </div>`).join("") || `<p>${esc(hd.resumen || "Sin sistemas con hallazgos localizados.")}</p>`;

  const puntos = tabla(
    ["#", "Punto", "Zona", "Sistema", "Estado", "Justificación"],
    (ep.puntos || []).map((p) => [p.orden, `<b>${esc(p.nombre)}</b>`, esc(p.codigo_za || ""),
      esc((p.sistema || "").replace(/-/g, " ")), esc(p.estado), esc(p.justificacion)]));

  const criterios = (ep.criterios_oleson || []).map((c) =>
    `<li>${c.cumple ? '<span class="si">✔</span>' : '<span class="no">✘</span>'} ${esc(c.criterio)}${c.nota ? ` — <i>${esc(c.nota)}</i>` : ""}</li>`).join("");

  const sesiones = pr.sesiones_estimadas ? `${pr.sesiones_estimadas.min}–${pr.sesiones_estimadas.max}` : "—";

  return `<section class="pagina narrativa">
    <header class="nar-head">${marcaHead(logoDataUrl)}
      <h2>Informe clínico de apoyo</h2>
      <p class="ref">Basado en la cartografía auricular de Paul Nogier. ${esc(inf.meta?.caso_id || "")}</p>
    </header>

    <h3>1 · Observación visual</h3>
    <p><b>Coloración predominante:</b> ${esc((ov.caracteristicas_generales?.color_general || "—").replace(/_/g, " "))}.
       ${esc(ov.caracteristicas_generales?.descripcion || "")}</p>
    ${ov.signos?.length ? signos : "<p>Coloración homogénea, sin signos focales relevantes.</p>"}
    ${ov.caracteristicas_generales?.hallazgos_normales?.length
      ? `<p class="pa"><b>Regiones sin alteración:</b> ${ov.caracteristicas_generales.hallazgos_normales.map(esc).join(", ")}.</p>`
      : ""}

    <h3>2 · Hipótesis: sistemas implicados</h3>
    <p class="dx"><b>${esc(hd.diagnostico_principal || "—")}</b></p>
    <p>${esc(hd.resumen || "")}</p>
    ${sistemas}

    <h3>3 · Evaluación del protocolo</h3>
    ${ep.puntos?.length ? puntos : "<p>—</p>"}
    ${criterios ? `<p class="st">Criterios de selección de puntos</p><ul class="crit">${criterios}</ul>` : ""}
    <p>${esc(ep.valoracion_global || "")}</p>
    ${ep.sugerencias?.length ? `<p class="st">Sugerencias</p><ul>${ep.sugerencias.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}

    <h3>4 · Pronóstico</h3>
    <ul class="prono">
      <li><b>Respuesta esperada:</b> ${esc((pr.respuesta_esperada || "").replace(/_/g, " "))}</li>
      <li><b>Sesiones estimadas:</b> ${sesiones}</li>
      <li><b>Frecuencia:</b> ${esc(pr.frecuencia || "—")}</li>
      ${pr.tiempo_de_respuesta ? `<li><b>Tiempo de respuesta:</b> ${esc(pr.tiempo_de_respuesta)}</li>` : ""}
    </ul>

    <h3>Limitaciones</h3>
    <ul>${(inf.limitaciones || []).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>

    <footer>
      <span class="pie-marca">${PIE_MARCA}</span><br>
      <span class="pie-contacto">${PIE_CONTACTO}</span><br>
      ${esc(inf.disclaimer || "")} · Generado con IA (${esc(inf.meta?.modelo_ia || "")}) · ${esc(inf.meta?.fecha || "")}
    </footer>
  </section>`;
}

// --- CSS del documento ------------------------------------------------
const CSS = `
  :root{ --tinta:${C.tinta}; --tinta2:${C.tintaSuave}; --azul:${C.azul}; --azul2:${C.azulVivo};
         --azulc:${C.azulClaro}; --linea:${C.linea}; --ocre:${C.ocre}; --ok:${C.ok}; }
  *{ box-sizing:border-box; }
  body{ margin:0; font-family:"Spectral","Georgia",serif; color:var(--tinta); background:#e9eef4; }
  .pagina{ width:210mm; min-height:297mm; padding:16mm 15mm; margin:0 auto 8mm; background:#fff; box-shadow:0 1px 6px rgba(18,36,59,.15); }
  h1{ font-size:24pt; margin:.2em 0; color:var(--azul); letter-spacing:-.01em; }
  h2{ font-size:18pt; color:var(--azul); border-bottom:2px solid var(--azul); padding-bottom:.2em; }
  h3{ font-size:12.5pt; color:var(--azul2); margin:1.1em 0 .4em; }
  h4{ font-size:10.5pt; margin:.7em 0 .3em; color:var(--azul); }
  p,li,td,th{ font-size:10pt; line-height:1.5; }
  .marca,.sub,.ref{ font-family:"IBM Plex Sans",system-ui,sans-serif; color:var(--tinta2); }
  .marca{ font-size:8pt; letter-spacing:.18em; text-transform:uppercase; margin:0; }
  .sub,.ref{ font-size:9pt; margin:.2em 0 0; }
  /* marca — emblema + nombre, margen superior izquierdo */
  .marca-head{ display:flex; align-items:center; gap:9px; margin:0 0 8px; }
  .marca-head .emblema{ height:16mm; width:auto; flex:none; }
  .marca-txt{ display:flex; flex-direction:column; line-height:1.15; }
  .marca-nombre{ font-family:"Spectral","Georgia",serif; font-weight:700; font-size:13pt; color:var(--azul); letter-spacing:.01em; }
  .marca-sub{ font-family:"IBM Plex Sans",system-ui,sans-serif; font-size:7.5pt; letter-spacing:.14em; text-transform:uppercase; color:var(--tinta2); }
  .infografico header{ border-bottom:1px solid var(--linea); padding-bottom:10px; }
  .nar-head{ margin-bottom:6px; }
  .nar-head .emblema{ height:12mm; }
  .nar-head .marca-nombre{ font-size:11pt; }
  .nar-head h2{ margin:.1em 0; }
  .pie-marca{ font-weight:600; color:var(--azul); }
  .pie-contacto{ color:var(--tinta2); }
  .infografico .cuerpo{ display:flex; gap:16px; margin-top:14px; align-items:flex-start; }
  .foto{ width:46%; flex:none; margin:0; }
  .foto img{ width:100%; max-height:300px; object-fit:contain; border:1px solid var(--linea); border-radius:6px; background:#f4f7fb; }
  .foto figcaption{ font-family:"IBM Plex Sans",sans-serif; font-size:7.5pt; color:var(--tinta2); text-align:center; margin-top:3px; }
  .foto-vacia{ display:grid; place-items:center; height:220px; border:1px dashed var(--linea); border-radius:6px; color:var(--tinta2); font-size:9pt; }
  .infografico .mapa{ width:46%; flex:none; }
  .infografico .mapa svg{ width:100%; height:auto; max-height:300px; }
  .leyenda{ font-family:"IBM Plex Sans",sans-serif; font-size:7.5pt; color:var(--tinta2); text-align:center; margin:.3em 0 0; }
  .pt-lleno,.pt-vacio{ display:inline-block; width:7px; height:7px; border-radius:50%; border:1.5px solid var(--azul); vertical-align:middle; }
  .pt-lleno{ background:var(--azul); }
  .bloque{ margin-top:14px; border-top:1px solid var(--linea); padding-top:8px; }
  ol.puntos{ list-style:none; margin:0; padding:0; columns:2; column-gap:20px; }
  ol.puntos li{ display:flex; gap:9px; padding:5px 0; border-bottom:1px solid var(--linea); break-inside:avoid; }
  .num{ flex:none; width:20px; height:20px; border-radius:50%; background:var(--azul); color:#fff; font-family:"IBM Plex Sans",sans-serif; font-weight:700; font-size:8.5pt; display:grid; place-items:center; }
  .za{ font-family:"IBM Plex Mono",monospace; font-size:8pt; color:var(--azul2); }
  .tag{ font-family:"IBM Plex Sans",sans-serif; font-size:7pt; background:var(--azulc); color:var(--azul); padding:0 5px; border-radius:999px; text-transform:uppercase; }
  .loc{ font-size:8.5pt; color:var(--tinta2); }
  .grid-sist{ display:grid; grid-template-columns:1fr 1fr; gap:8px 18px; }
  .sist h4{ margin:.2em 0; }
  .sist .base{ font-size:9pt; color:var(--tinta2); font-style:italic; margin:.15em 0; }
  .sist .reg{ font-size:9pt; margin:.15em 0; }
  .sist ul{ margin:.2em 0; padding-left:1.1em; } .sist li{ font-size:9pt; }
  .cierre{ display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:14px; border-top:1px solid var(--linea); padding-top:10px; }
  .infografico footer, .narrativa footer{ margin-top:16px; padding-top:8px; border-top:1px solid var(--linea); font-family:"IBM Plex Sans",sans-serif; font-size:8pt; color:var(--ocre); }
  .sin{ color:var(--tinta2); font-style:italic; }
  /* narrativa */
  table{ border-collapse:collapse; width:100%; margin:.6em 0 1em; }
  th,td{ border:1px solid var(--linea); padding:5px 7px; text-align:left; vertical-align:top; font-size:9pt; }
  th{ background:var(--azulc); font-family:"IBM Plex Sans",sans-serif; font-size:8pt; text-transform:uppercase; letter-spacing:.03em; }
  .dx{ background:var(--azulc); padding:8px 10px; border-left:3px solid var(--azul); }
  .bloque-sist{ margin:.6em 0; } .bloque-sist ul{ margin:.2em 0; padding-left:1.1em; }
  .pa{ font-size:9pt; color:var(--tinta2); margin:.12em 0; }
  ul.crit{ list-style:none; padding:0; } ul.crit li{ padding:3px 0; }
  .si{ color:var(--ok); font-weight:700; } .no{ color:var(--ocre); font-weight:700; }
  .st{ font-family:"IBM Plex Sans",sans-serif; font-size:9pt; font-weight:600; color:var(--azul2); margin:.8em 0 .2em; }
  ul.prono{ list-style:none; padding:0; } ul.prono li{ padding:2px 0; }
  @media print{ body{ background:#fff; } .pagina{ box-shadow:none; margin:0; } .pagina + .pagina{ page-break-before:always; } }
`;

// Normaliza la salida del modelo: referencia = Nogier (no Oleson), sin números de sección, y sin
// menciones a "confianza"/"fiabilidad" (la doctora no quiere que se muestren niveles de confianza).
const normalizarFuente = (s) => s
  .replace(/\bTerry\s+Oleson\b/gi, "Paul Nogier")
  .replace(/\bOleson\b/gi, "Nogier")
  .replace(/\s*\(?§\s*\d+(?:\.\d+)?\)?/g, "")
  .replace(/,?\s*(?:lo que|que)\s+(?:reduce|limita|disminuye|baja|afecta a?)\s+la\s+(?:confianza|fiabilidad)[^.;]*/gi, "")
  .replace(/\b(?:baja|media|alta|menor|escasa|limitada)\s+(?:confianza|fiabilidad)\b/gi, "carácter orientativo")
  .replace(/\b(?:la\s+)?(?:confianza|fiabilidad)\s+(?:en|de)\s+(?:la\s+)?(?:interpretaci[oó]n|lectura|hip[oó]tesis)/gi, "la lectura")
  .replace(/\bconfianza\b/gi, "orientación").replace(/\bfiabilidad\b/gi, "certeza");

export function construirDocumentoHTML(informe, fotoDataUrl = null, logoDataUrl = null) {
  const cuerpo = informe.analisis_viable === false
    ? infograficoHTML(informe, fotoDataUrl, logoDataUrl)
    : infograficoHTML(informe, fotoDataUrl, logoDataUrl) + narrativaHTML(informe, logoDataUrl);
  return normalizarFuente(`<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>${esc(informe.infografico?.titulo || "Informe auricular")}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@500;600;700&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono&display=swap">
    <style>${CSS}</style></head><body>${cuerpo}</body></html>`);
}

export { infograficoHTML, narrativaHTML };
