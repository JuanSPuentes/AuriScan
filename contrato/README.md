# Contrato de salida — IA ↔ PDF

Una **sola estructura JSON** de la que se renderizan **los dos formatos** del PDF (infográfico
en portada + narrativa clínica). Nunca se contradicen porque salen del mismo objeto.

## Archivos

| Archivo | Qué es |
|---|---|
| `informe.schema.json` | JSON Schema (draft 2020-12). La definición normativa. |
| `ejemplo-ansiedad.json` | Ejemplo completo, equivalente a `reporte.md`. |
| `ejemplo-no-viable.json` | Ejemplo con `analisis_viable: false` (imagen insuficiente). |
| `coordenadas-oreja.json` | **Provisional.** Posición de cada punto sobre la ilustración genérica. Lo usa la plantilla, no la IA. |
| `validar.mjs` | `node validar.mjs [archivo…]` — valida contra el schema. |

## Dónde encaja

```
foto + modo ─▶ PASO 1  qwen3-vl-flash: describe la imagen
                    │
             PASO 2  retrieve.mjs (RAG): arma el contexto del cerebro
                    │
             PASO 3  qwen3-vl-plus( foto + contexto + ESTE SCHEMA )
                    │  ─▶ JSON conforme a informe.schema.json
                    ▼
             backend: valida, rellena [backend], fuerza el disclaimer
                    ▼
             plantilla: infográfico + narrativa ─▶ PDF descargable
```

## Quién rellena qué

- **La IA** produce todo el contenido clínico.
- **El backend (`/api/analizar`)** rellena y **sobrescribe siempre**:
  `meta.caso_id`, `meta.fecha`, `meta.generado_en`, `meta.modelo_ia`, y el texto de `disclaimer`.
  `meta.modo` lo fija la PWA (selector de la usuaria).
- **Anónimo**: no hay ningún campo de identidad del paciente. `caso_id` y `fecha` son
  autogenerados. `meta.motivo` es una etiqueta clínica (p. ej. "Ansiedad"), no un dato personal.

## Validación y reintento

1. `Ajv` valida la respuesta contra `informe.schema.json`.
2. Si falla → segunda llamada al modelo incluyendo los errores de validación (máx. 1 reintento).
3. Validación **blanda** (aviso, no rechazo) contra `../rag/vault-index.json`:
   - `signos[].zonas`, `evaluacion_protocolo.puntos[].id` y `.codigo_za` deberían existir en el
     cerebro. Si no, se registra y se coloca el marcador por `fallback_por_zona`.
4. Si `analisis_viable: false` → el PDF muestra solo la portada con el mensaje de "repetir la toma".

## Cómo se mapea al PDF

### Página 1 — infográfico (paleta azul)

| Elemento del infográfico | De dónde sale |
|---|---|
| Título "Caso NN \| motivo" | `infografico.titulo` (o `meta.caso_id` + `meta.motivo`) |
| Marcadores numerados sobre la oreja | `evaluacion_protocolo.puntos[]` → `orden` + posición por `codigo_za`/`id` en `coordenadas-oreja.json` (marca `oculto` con otro estilo) |
| Lista lateral de puntos | `evaluacion_protocolo.puntos[]` → `orden`, `nombre`, `localizacion` |
| Panel de ejes (1–4, variable) | `hipotesis_diagnostica.ejes[]` → `titulo` + `hallazgos` |
| Razonamiento / Conclusión | `infografico.razonamiento` / `infografico.conclusion` |
| Nota al pie | `disclaimer` (+ "Debe ser corroborado por un profesional experto") |

### Página 2+ — narrativa clínica

| Sección (como `reporte.md`) | De dónde sale |
|---|---|
| 1. Observación visual preliminar | `observacion_visual.caracteristicas_generales` + tabla de `observacion_visual.signos[]` (signo · localización · interpretación · confianza) |
| 2. Hipótesis diagnóstica | `hipotesis_diagnostica.diagnostico_principal` + `resumen` + `ejes[]` (cada eje con sus `hallazgos`) |
| 3. Evaluación del protocolo | `evaluacion_protocolo.puntos[]` (tabla) + `criterios_oleson[]` (checklist ✅/❌) + `valoracion_global` + `sugerencias[]` |
| 4. Pronóstico | `pronostico` (respuesta, sesiones `min–max`, frecuencia, tiempo, factores) |
| Limitaciones + confianza | `limitaciones[]` + `nivel_de_confianza_global` |
| Pie de todas las páginas | `disclaimer` + `meta.fecha` + `meta.modelo_ia` + "generado con IA" |

## Enums clave

- `meta.modo`: `con_agujas` \| `oreja_limpia`
- `evaluacion_protocolo.puntos[].estado`: `observado` (con agujas) \| `propuesto` (oreja limpia)
- `hipotesis_diagnostica.ejes[].eje`: `neuro-psicologico` \| `neuroendocrino` \| `sensorial` \| `homeostasis` \| `otro`
- `confianza` / `nivel_de_confianza_global`: `alta` \| `media` \| `baja`
- `pronostico.respuesta_esperada`: `excelente` \| `buena_a_excelente` \| `buena` \| `moderada` \| `reservada` \| `no_determinada`

## Pendiente

- Ajustar `coordenadas-oreja.json` a la ilustración SVG final (fase de diseño).
- Decidir si el reintento por validación usa el modelo fuerte o el barato.
