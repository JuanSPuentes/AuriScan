# Coste de IA por llamada

Precios **Alibaba Model Studio, endpoint US (`dashscope-us`)**, USD por millón de tokens.

| Modelo | Uso | Entrada | Salida |
|---|---|---|---|
| `qwen3-vl-flash` | paso 1 — describir la imagen (ve la foto) | $0.05 | $0.40 |
| `qwen-flash` | paso 3 — redactar el informe (solo texto) | $0.05 | $0.40 |

El paso 3 es **solo texto**: se apoya en la descripción del paso 1 y en el contexto del cerebro (RAG). Así es rápido y barato. Para volver a enviar la foto al paso 3: `INFORME_CON_IMAGEN=1` + un `MODELO_INFORME` con visión.

## Medido (deploy real en Vercel, sep. 2026)

Imagen de prueba (contexto RAG de 21 notas / ~8k tokens):

| | Tokens | Coste |
|---|---|---|
| Paso 1 · visión (`qwen3-vl-flash`) | 1.420 in / 149 out | $0.00013 |
| Paso 3 · informe (`qwen-flash`) | 13.316 in / 1.670 out | $0.00133 |
| **Total** | | **$0.00146** · 19 s |

Foto de oreja **real** (más zonas → contexto RAG ~44 notas / ~18k tokens):

| | Tokens aprox. | Coste aprox. |
|---|---|---|
| Paso 1 · visión | ~1,5k in / ~0,2k out | ~$0.00015 |
| Paso 3 · informe | ~18k in / ~2k out | ~$0.0017 |
| **Total por consulta** | | **≈ $0.0018 – $0.0025** |

Con un reintento de validación (poco frecuente): **~$0.004**.

**El PDF se genera en el navegador → $0 extra.** "Por llamada" = "por PDF".

## Comparativa de modelos para el paso 3 (probado)

| Modelo | Tiempo | Coste | Notas |
|---|---|---|---|
| **`qwen-flash` (texto)** ← elegido | ~14 s | ~$0.0013 | rápido, barato, fiable con el prompt reforzado |
| `qwen-plus` (texto) | ~19 s | ~$0.007 | igual de fiable pero 5× más caro y no más rápido |
| `qwen3-vl-plus` (+ imagen) | **14–70 s** (muy variable) | ~$0.006 | mejor "criterio visual" pero lento e impredecible; casi provoca timeout en Vercel |

## Proyección mensual (con `qwen-flash`, ~$0.002/consulta)

| Volumen | Consultas/mes | Coste IA/mes |
|---|---|---|
| 10/día | 300 | ~$0.60 |
| 50/día | 1.500 | ~$3 |
| 200/día | 6.000 | ~$12 |

## Otros

- Digitalización del libro + cerebro + RAG v1: **$0**.
- Cuota gratuita de Model Studio (1M tokens/modelo, 90 días): cubre la prueba.
- Vercel: función serverless con `maxDuration: 300`. Plan actual lo permite.
- Sin base de datos, sin almacenamiento de imágenes.
