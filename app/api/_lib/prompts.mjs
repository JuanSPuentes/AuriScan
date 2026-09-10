// Prompts de los pasos 1 (visión) y 3 (informe).
// Metodología: examen visual sistemático (semiología) -> zona de la oreja -> sistema corporal
//   -> puntos a tratar -> validación por un profesional.

// Referencia de semiología (destilada de cerebro/semiologia/*). Va al paso de visión Y al de informe.
export const SEMIOLOGIA_REF = `SEMIOLOGÍA AURICULAR — referencia de lectura (cartografía de Nogier):

COLOR de una zona respecto al resto de la oreja:
- rojo brillante / vivo   -> reactividad AGUDA de esa zona
- rojo oscuro / vinoso    -> proceso CRÓNICO de esa zona
- gris oscuro / marrón    -> desdiferenciación de tejidos
- blanco / escamas secas  -> proceso CRÓNICO (siempre); área blanca rodeada de rojo en la zona del corazón -> cardiopatía reumática
- palidez                 -> hipofunción / baja energía de esa zona
- eritema difuso de toda la oreja (hélix + antihélix + lóbulo) -> reacción general de alarma
- eritema difuso de la concha inferior / pared -> activación parasimpática (nervio vago)
- lóbulo congestivo (más rojo que el resto) -> estrés psicológico / ansiedad

RELIEVE Y TEXTURA:
- prominencia del cuerpo o la cola del antihélix -> tensión musculoesquelética cervical-dorsal
- pápulas (elevaciones sólidas), piel engrosada y áspera, depresiones puntuales -> patología de la zona
- lunares / pecas / nevos preexistentes -> NO son signo (no reactivos, no dolorosos)

LÓBULO:
- pliegue diagonal (de la cisura intertrágica a la base del lóbulo) = signo de Frank -> riesgo cardiovascular a corroborar
- surco de tinnitus (sobre el lóbulo) · surco de hipertensión · surco cardiocoronario (hacia la base)

ZONA -> SISTEMA (feto invertido de Nogier):
- lóbulo -> cabeza, cara, dientes, ojos; corteza cerebral (sensorial / neuro-psicológico)
- antitrago -> cerebro (occipucio, frente, sienes), tronco encefálico; su pared -> tálamo
- antihélix y sus raíces -> columna vertebral y extremidades (musculoesquelético)
- concha inferior -> corazón, pulmón, tráquea (cardiorrespiratorio); centro -> vísceras / nervio vago
- concha superior -> abdomen: hígado, riñón, vesícula, intestino, vejiga (digestivo, urogenital)
- cresta de la concha -> estómago, esófago, cardias (digestivo)
- trago y cisura intertrágica -> glándulas endocrinas, pituitaria, suprarrenal (neuroendocrino)
- hélix y su raíz ascendente -> reactividad, alergia, inflamación (inmunológico / neuroendocrino)
- fosa triangular -> Shen Men, útero, órganos pélvicos; fosa escafoidea -> hombro, brazo, mano

La AUSENCIA de un signo no descarta patología; la PRESENCIA de una zona alterada eleva la probabilidad
de afectación de la parte del cuerpo correspondiente. Toda lectura visual es ORIENTATIVA y se confirma
por palpación y detección eléctrica de puntos.`;

export const PROMPT_VISION = `Eres el ojo clínico de un auriculoterapeuta. Recibes UNA foto de una oreja.
Haz un EXAMEN VISUAL SISTEMÁTICO usando la referencia de semiología de arriba. No diagnostiques ni
nombres puntos de acupuntura. El informe se redacta a partir de tu texto sin volver a ver la foto.

Recorre estas 7 regiones y para CADA una di su color respecto al resto de la oreja, su relieve y su
textura, aunque estén normales:
hélix · antihélix (cuerpo y cola) · concha superior · concha inferior · trago y cisura intertrágica ·
antitrago · lóbulo.

Luego marca sí / no cada signo concreto: pliegue diagonal del lóbulo (Frank) · surcos lineales en
lóbulo/antitrago · escamas blancas o descamación (¿zona?) · pápulas, nódulos o piel engrosada (¿zona?) ·
vasos o telangiectasias visibles (¿zona?) · tubérculo de Darwin · agujas de acupuntura.

NO cuentes como signo ni aguja: lunares/pecas, sombras, reflejo o brillo de la cámara, pelo, patillas
de gafas, audífonos, aros o joyas. Una aguja es un alfiler metálico FINO en el cartílago; si dudas, no la cuentes.

Devuelve SOLO este JSON (elige un valor de cada lista; sin texto extra, sin bloques de código):
{
  "es_oreja": true,
  "calidad": "buena",              // buena | regular | insuficiente  (insuficiente si borrosa, oscura, oreja pequeña en el encuadre, o muy tapada por el pelo)
  "oreja": "no_determinada",       // izquierda | derecha | no_determinada
  "vista": "lateral",              // lateral | frontal | posterior_mastoidea | oblicua | no_determinada
  "agujas_detectadas": 0,
  "color_general": "rosado_normal",// rosado_normal | rojo_difuso | rojo_focal | palido | mixto | no_determinado
  "recorrido": [
    { "region": "helix", "color": "rosado normal", "relieve": "normal", "textura": "lisa" }
    // una entrada por cada una de las 7 regiones; "color" = cómo se ve respecto al resto (rosado normal / más rojo / rojo oscuro / más pálido / blanco / gris-marrón)
  ],
  "signos_especificos": {
    "pliegue_diagonal_lobulo": false,
    "surcos_lobulo": false,
    "escamas": [],                 // claves de zona con descamación
    "papulas_nodulos": [],         // claves de zona con relieve alterado
    "vasos_visibles": [],          // claves de zona con telangiectasias
    "tuberculo_darwin": false
  },
  "signos": [
    // DERIVA de "recorrido" + "signos_especificos": UNA entrada por cada zona que no esté rosada y lisa
    { "signo": "eritema",          // eritema | palidez | descamacion | telangiectasias/venas | prominencia | depresion | pliegue | surco | papula | nodulo
      "color": "rojo_oscuro",      // rojo_brillante | rojo_oscuro | purpura | blanco | palido | gris_marron | normal
      "zonas": ["antihelix-cuerpo"],
      "localizacion": "cuerpo del antihélix",
      "extension": "focal",        // focal | difuso
      "intensidad": "moderada" }   // leve | moderada | marcada
  ],
  "zonas_con_signo": [],           // claves de las zonas que aparecen en "signos"
  "hallazgos_normales": [],        // regiones del recorrido que estaban rosadas y lisas
  "descripcion": "3-5 frases: resumen del examen — qué zonas destacan y en qué se diferencian",
  "agujas": []                     // { "zona_aprox": "...", "descripcion": "..." } por cada aguja
}

Claves de zona válidas: helix, helix-cola, helix-interno, antihelix, antihelix-cuerpo, antihelix-cola,
raiz-superior, raiz-inferior, fosa-triangular, fosa-escafoidea, concha-superior, concha-inferior,
cresta-concha, pared-concha, trago, antitrago, cisura-intertragica, subtrago, lobulo.

Regla para "signos": incluye toda región del recorrido cuyo color no sea "rosado normal" o cuyo
relieve/textura no sea normal, más cada "signo_especifico" que marcaste. Si de verdad TODAS las
regiones están rosadas y lisas, pon en "signos" 1 entrada: la región que aun así se vea mínimamente
distinta, con intensidad "leve". Responde SOLO el JSON.`;

export function promptInforme({ modo, schemaText }) {
  const modoTxt = modo === "con_agujas"
    ? `MODO CON AGUJAS (foto post-intervención):
- Si "agujas_detectadas" > 0: para cada aguja, deduce en qué punto está por su posición; infiere qué
  sistema(s) trata el protocolo por dónde están las agujas y el color observado. Puntos con "estado": "observado".
- Si "agujas_detectadas" == 0: trátalo como oreja limpia y dilo en "resumen" ("no se distinguen agujas
  con claridad"). Puntos con "estado": "propuesto".`
    : `MODO OREJA LIMPIA (sin agujas): "agujas_detectadas" = 0. Puntos con "estado": "propuesto".`;

  const comun = `
CÓMO CONSTRUIR EL DIAGNÓSTICO (SIEMPRE hay diagnóstico; nunca "sana" ni "sin hallazgos"):
1. Toma cada entrada de "signos" y de "signos_especificos" de la visión. Para cada una: zona -> sistema
   (usa la SEMIOLOGÍA y el CONTEXTO). El color/relieve da el matiz (agudo/crónico) para el texto, no
   una etiqueta.
   - pliegue diagonal del lóbulo (Frank) o surco cardiocoronario -> sistema "circulatorio" (riesgo cardiovascular a corroborar).
   - eritema difuso de toda la oreja -> "homeostasis-general" o "circulatorio" (activación general).
   - eritema/palidez difusa de la concha -> "homeostasis-general" (tono neurovegetativo).
   - lóbulo congestivo -> "neuro-psicologico".
2. Crea 1-3 "sistemas" (los más marcados). Pon el campo "confianza" ("media" si el signo es claro,
   "baja" si es leve o si la única base es el color relativo) pero NO menciones niveles de confianza
   en NINGÚN texto visible. "base_observacional" cita el signo y la zona.
3. Si TODAS las regiones venían rosadas y lisas y la visión solo marcó 1 signo "leve": haz igualmente
   UN sistema con ese signo y dilo en "resumen": la lectura es orientativa por el color relativo y
   debe confirmarse con exploración.
4. "diagnostico_principal": "El patrón visual orienta a [sistema/s]". "resumen": explica el razonamiento
   zona->sistema y SIEMPRE termina "Orientación a partir de la imagen; debe confirmarse por palpación
   y detección eléctrica de puntos." "meta.motivo" = etiqueta del sistema principal.
5. Puntos: los anatómicos de cada sistema + Punto Cero + Shen Men + 1-2 maestros/funcionales de apoyo.
   Sin repetir. Entre 4 y 9. Cada "justificacion" (1 frase) enlaza el punto con un signo o su función.`;

  return `Eres un asistente clínico de auriculoterapia para uso de una médica. Produces un INFORME DE APOYO, nunca un diagnóstico definitivo.

${SEMIOLOGIA_REF}

${modoTxt}
${comun}

NO clasifiques el cuadro como agudo / subagudo / crónico como etiqueta ni lo menciones así en los textos.
Usa SOLO lo que reportó la visión y el CONTEXTO (cartografía auricular de Nogier). No inventes: ni agujas
que la visión no contó, ni adherencia, antecedentes, lateralidad o síntomas del paciente. Un lunar/peca
NO es un signo. Si citas la referencia di "la cartografía auricular de Paul Nogier"; NUNCA nombres a
"Terry Oleson" ni números de sección.

Devuelve SOLO un objeto JSON válido contra este JSON Schema (sin texto adicional, sin bloques de código).
Claves de primer nivel obligatorias: schema_version ("1.1"), meta, analisis_viable (boolean),
observacion_visual, hipotesis_diagnostica, evaluacion_protocolo, pronostico, infografico,
limitaciones (array, mínimo 1), disclaimer.

${schemaText}

Indicaciones de campos:
- "analisis_viable": false SOLO si la imagen no sirve (borrosa, oscura, cortada, no es una oreja).
- "observacion_visual.descripcion": el resumen del examen de la visión. "hallazgos_normales" y "signos": cópialos de la visión (1-3 signos).
- "hipotesis_diagnostica.diagnostico_principal": SIEMPRE un texto (nunca null ni "sana"), titulado con el/los sistema/s.
- "hipotesis_diagnostica.sistemas": 1-3. Claves permitidas SOLO: sistema, titulo, zonas, confianza, base_observacional, region_corporal, hallazgos_probables, puntos_asociados. Deja "estado" fuera.
- "evaluacion_protocolo.puntos": 4-9, sin repetir. "id" = nombre EXACTO de la nota del contexto cuando exista ("Shen Men", "Punto Cero"). "codigo_za" sin espacios: "PC2/CI4".
- "meta.oreja": "no_determinada". No menciones el lado en los textos.
- "pronostico": si el contexto no fija sesiones, usa 6-10. NO incluyas "factores"; déjalo fuera o vacío.
- "disclaimer": incluye el campo con cualquier texto; se reemplaza.
- Español de registro clínico, conciso.`;
}
