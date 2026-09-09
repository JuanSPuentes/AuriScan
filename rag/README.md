# RAG — prototipo

Recuperación v1 para la [Auriculoterapia PWA](../ANALISIS.html): **metadatos + grafo, sin
embeddings, sin base de datos**. Toma lo que la IA-visión ve en la foto y arma el bloque de
contexto que recibe el modelo generador.

## Piezas

| Archivo | Qué hace |
|---|---|
| `compile.mjs` | Lee `../cerebro/**/*.md`, parsea frontmatter + enlaces, genera `vault-index.json` |
| `retrieve.mjs` | Dado un caso simulado `{zonas, signos, puntos_visibles}`, selecciona notas y escribe `context-<caso>.md` |
| `vault-index.json` | Índice generado (no se versiona) |
| `context-<caso>.md` | Contexto de ejemplo generado (no se versiona) |

## Uso

```bash
node compile.mjs                 # regenera el índice tras editar el cerebro
node retrieve.mjs ansiedad       # casos: ansiedad (def.) | cefalea | limpia
```

## Lógica de recuperación v1

1. **Núcleo fijo** (siempre): 4 ejes, `Puntos maestros auriculares`, criterios 6.8,
   lineamientos 6.15, `Lineamientos para el diagnostico auricular`,
   `Observacion visual de la piel auricular`, `Vistas y orientacion de la auricula`
   — más un salto por sus enlaces (trae los puntos maestros citados).
2. **Por signos**: notas de `semiologia/` cuyo `senales_visuales` coincide (subcadena, sin acentos).
3. **Por zonas**: notas de contexto (anatomía de región, semiología, protocolo, criterio,
   diagnóstico, eje) y las 7 notas-resumen de somatotopía cuyo `zona_auricular` coincide.
   Los **puntos concretos NO entran por zona** (entrarían casi todos).
4. **Por puntos visibles**: la nota del punto + las notas que enlaza (1 salto por el grafo).

## Mediciones (vault de 67 notas, ~26–31k tokens completo)

| Caso | Notas | Tokens de contexto* |
|---|---|---|
| ansiedad/estrés (con agujas) | ~47 | ~17,5–21k |
| cefalea + cervicalgia | ~42 | ~16–20k |
| oreja limpia | ~40 | ~15,5–19k |

\* Estimación `chars/4`–`chars/3.3`. Sin el tokenizador real de Qwen. La imagen añade ~1–2k.

### Hallazgos

- **Todos los puntos y enlaces resuelven** (0 rotos, 0 sin resolver).
- El contexto ensamblado para "ansiedad" contiene todo lo que necesita un informe estilo
  `reporte.md`: 4 ejes, semiología del color, criterios 6.8, protocolos 9.7/9.8/9.4, los 5
  puntos en juego y la somatotopía relevante.
- **La recuperación por zona es intrínsecamente amplia**: cuando la visión "ve" signos en 6–7
  regiones, casi toda la anatomía y los protocolos entran. Por eso el ahorro frente a "enviar
  el vault entero" es hoy de solo ~30–40 %.
- **Conclusión**: con el vault actual (~30k tokens) enviar el núcleo ampliado ≈ casi todo el
  vault es viable y más simple; con Context Cache de Alibaba el coste marginal es bajo. El RAG
  selectivo se vuelve rentable cuando el vault crezca (resto del cap. 9, cap. 8, cap. 2,
  ampliaciones de la doctora → x2–x3).

## Siguiente

- Integrar `retrieve.mjs` como módulo dentro de `/api/analizar` (Vercel).
- Definir el **esquema JSON de salida** (contrato IA ↔ PDF) — es lo que falta antes del backend.
- Opcional v2: capa de embeddings local si la recuperación por metadatos se queda corta.
