# Auriculoterapia PWA

Sube la foto de un oído → informe de auriculoterapia en PDF (infográfico + narrativa clínica).
Fase de **prueba**. Sin base de datos, sin datos de paciente.

## Estructura

```
app/
  index.html · src/            PWA (Vite, vanilla JS)
    main.mjs                    flujo: imagen → modo → /api/analizar → vista previa → PDF
    report.mjs                  informe JSON → HTML/SVG (infográfico + narrativa)
    styles.css
  api/
    analizar.mjs               función serverless: visión → RAG → informe → validación
    _lib/
      prompts.mjs               prompts de los pasos 1 y 3
      retrieve.mjs              RAG v1 (metadatos + grafo)
      alibaba.mjs               cliente OpenAI-compatible + estimación de coste
      validate.mjs              Ajv + sellado + disclaimer forzado
      vault-index.json          (generado) el cerebro compilado
      informe.schema.json       (copiado de ../../contrato)
      coordenadas-oreja.json    (copiado)
  scripts/
    prepare.mjs                 recompila el cerebro y copia los datos (corre en `build`)
    smoke.mjs                   prueba en seco SIN llamar a Alibaba
```

## Variables de entorno (servidor)

| Variable | Valor |
|---|---|
| `DASHSCOPE_API_KEY` | la key `sk-ws-…` del workspace (NUNCA en el cliente) |
| `ALIBABA_BASE_URL` | opcional; por defecto el endpoint de Singapur del workspace |
| `MODELO_VISION` | opcional; def. `qwen3-vl-flash` |
| `MODELO_INFORME` | opcional; def. `qwen3-vl-plus` |

## Probar en local

```bash
npm run smoke                     # pipeline (RAG + validación + plantilla) SIN gastar IA
npm run build                     # recompila el cerebro + build de la PWA
npm run local                     # servidor completo -> http://localhost:8787
```

- `http://localhost:8787/?demo=1` → informe de ejemplo, **sin llamar a la IA** (coste 0).
- Para analizar fotos reales: copia `.env.example` a `.env`, pega la key en `DASHSCOPE_API_KEY`,
  y `npm run local` de nuevo. Sube una foto de oído, elige el modo, "Analizar".

### `npm run dev` (puerto 5173) — iteración de frontend

Vite con **hot-reload**. `/api` se reenvía al deploy de producción (consume IA real, ~$0.002/consulta).
Para apuntar a otro backend: `API_PROXY=http://localhost:8787 npm run dev`.

## Deploy en Vercel

1. `vercel` (o conectar el repo). Framework detectado: Vite.
2. En *Settings → Environment Variables* añadir `DASHSCOPE_API_KEY`.
3. `buildCommand` = `npm run build` (recompila el cerebro y copia los datos antes de `vite build`).

## Coste por consulta

~**US$ 0.009** (1 centavo). Ver [`../costos.md`](../costos.md). La respuesta de `/api/analizar`
incluye `debug.costoTotalUsd` con el coste real de esa llamada.

## Pendiente

- Ilustración SVG de la oreja: es esquemática; ajustar arte y `coordenadas-oreja.json`.
- Verificar la descarga PDF (`jsPDF.html`) en móvil; si falla usa "Abrir para imprimir / guardar".
- Prueba end-to-end con foto real + Alibaba.
- Verificar si el endpoint MaaS soporta *context cache*.
