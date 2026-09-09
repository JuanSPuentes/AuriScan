---
tipo: meta
aliases:
  - Cerebro
  - Vault de auriculoterapia
estado: borrador
---

# Cerebro — base de conocimiento de auriculoterapia

Vault de Obsidian que sirve de **base de conocimiento para la IA** de la PWA (foto de oído → reporte PDF). Todo el contenido se destila del libro:

> Terry Oleson. *Auriculoterapia: sistemas chino y occidental de acupuntura auricular*, 3.ª edición. (PDF escaneado en `../AURICULOTERAPIA ... 3a edicion.pdf`, 386 págs.)

El **capítulo 1** (Generalidades e historia) se excluye por decisión de la doctora. El resto se incorpora por capítulos.

## Para qué sirve cada cosa

- La doctora **lee y corrige** estas notas directamente en Obsidian. Son la fuente de verdad.
- Un paso de *build* deriva de aquí lo que la IA recibe por consulta (ver `../ANALISIS` cuando exista).
- La IA **no** recibe el vault entero: recibe un **núcleo fijo** + notas **recuperadas** según lo que vea en la foto.

## Estructura

| Carpeta | Contenido |
|---|---|
| `puntos/` | Un punto auricular por nota (localización, función, indicaciones) |
| `ejes/` | Los 4 ejes diagnósticos de referencia (uso **variable**: el informe incluye solo los que tienen hallazgos) |
| `semiologia/` | Signos visibles en la piel de la oreja y su interpretación — **lo que la IA lee en la foto** |
| `diagnostico/` | Procedimientos y principios de diagnóstico auricular (cap. 5) + fases de Nogier |
| `anatomia/` | Regiones y puntos de referencia del pabellón (cap. 3) |
| `zonas/` | Sistema de códigos de zona OMS (cap. 4) y tabla zona→punto |
| `tratamiento/` | Métodos, lineamientos generales, precauciones, impedimentos (cap. 6) |
| `protocolos/` | Combinaciones de puntos por condición (cap. 9) |
| `criterios/` | Reglas de selección de puntos (cap. 6.8) y lineamientos generales (6.15) |
| `_fuente/` | Transcripciones crudas por capítulo antes de destilar (trabajo interno) |

## Convención de frontmatter

```yaml
---
tipo: punto | eje | semiologia | diagnostico | anatomia | protocolo | criterio
aliases: [nombres alternativos]
zona_auricular: [helix, antihelix, concha-inferior, ...]   # zonas implicadas
puntos_relacionados: [Shen Men, Punto Cero, ...]
ejes: [neuro-psicologico | neuroendocrino | sensorial | homeostasis]
sistema: chino | occidental | ambos
senales_visuales: [eritema, descamacion, ...]   # SOLO semiologia: palabras clave del signo
fuente: "Oleson 3.ª ed. — §5.1, p. 139"
estado: completo | borrador | stub
---
```

Los campos `zona_auricular`, `puntos_relacionados`, `ejes` y `senales_visuales` son las **claves de recuperación** para el RAG v1 (búsqueda por metadatos + grafo, sin embeddings).

## Cómo recupera la IA (RAG v1, sin coste)

1. La IA-visión describe la foto → `{ zonas:[...], signos:[...], puntos_visibles:[...] }`.
2. Se traen:
   - **Núcleo fijo**: `[[Puntos maestros auriculares]]`, las 4 notas de `ejes/`, `[[Lineamientos para el diagnostico auricular]]`, `[[Criterios de seleccion de puntos]]`.
   - **Por `signos`**: notas de `semiologia/` cuyo `senales_visuales` coincide.
   - **Por `zonas`**: notas cuyo `zona_auricular` coincide.
   - **Por `puntos_visibles`**: esas notas de `puntos/` + las que enlazan (`[[...]]`).
3. Ese conjunto (~10–15k tokens) + la foto + el esquema de salida → modelo Qwen-VL → JSON del reporte.

## Estado de carga

- [x] Cap. 5 — Procedimientos diagnósticos auriculares (semiología + principios)
- [x] Cap. 7.1 — Puntos maestros
- [x] Cap. 3 — Anatomía de la aurícula (regiones, PR 0–17, somatotopía, cuadrantes)
- [x] Cap. 4 — Zonas auriculares y nomenclatura internacional (§4.1–4.5)
- [ ] Cap. 4.6 — Zonas detalladas región por región
- [x] Cap. 6 — Procedimientos de tratamiento (selección de puntos, lineamientos, precauciones, impedimentos, métodos)
- [x] Cap. 7.2–7.6 — Representaciones somatotópicas (musculoesquelético, cabeza/cara/cuello, órganos, endocrino, nervioso, funcionales) — 6 notas consolidadas
- [ ] Cap. 8 — Estudios de casos clínicos
- [~] Cap. 9 — Protocolos por condición: hechos §9.4, 9.6, 9.7, 9.8, 9.9, 9.10 + índice de las 20 categorías; resto pendiente
- [ ] Cap. 2 — Perspectivas teóricas (lenguaje de "razonamiento")
- [ ] Apéndices / glosario

> [!warning] Descargo
> Material de apoyo derivado de un texto de referencia. Todo reporte generado debe ser **corroborado por un profesional experto**. No sustituye el juicio clínico.
