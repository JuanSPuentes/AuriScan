# Auriculoterapia PWA

App web (instalable) donde una médica sube la foto de un oído y descarga un **PDF** con un
informe de auriculoterapia: la foto analizada + un mapa de puntos + el razonamiento clínico.
**Material de apoyo** — el PDF siempre indica que debe corroborarlo un profesional.

Fase de prueba · desplegada en **https://app-two-pearl-50.vercel.app**

## Cómo funciona (por consulta, ~20 s, ~$0.002)

```
foto + modo (con agujas / oreja limpia) + oreja (opcional)
  1. VISIÓN   Qwen mira la foto → describe color de la piel y dónde, venas, descamación, agujas
  2. RAG      según lo visto, trae ~20 notas del "cerebro" (~8k tokens)
  3. INFORME  Qwen redacta un JSON: color+ubicación → zona de la oreja → sistema corporal
              → estado agudo/crónico → puntos a tratar → validación
  → PDF: foto real + infográfico + informe clínico
```

Sin datos del paciente, sin base de datos. IA: Alibaba (Qwen), región US.

## El cerebro

`cerebro/` es un **vault de Obsidian** (67 notas `.md` enlazadas) destilado del manual de
**Terry Oleson — *Auriculoterapia*, 3.ª ed.** Se construyó leyendo el PDF escaneado del libro
(sin OCR de pago). Cubre los capítulos 3–7 y parte del 9. Una nota por concepto (un punto, una
zona, un signo, un sistema, un protocolo). **La doctora puede editarlo en Obsidian.**

Por cada consulta viajan solo las ~20 notas relevantes (~8k tokens), no el libro entero.

## Estructura

| Carpeta | Qué es |
|---|---|
| `cerebro/` | el vault de Obsidian (conocimiento). Ver `cerebro/README.md` |
| `contrato/` | el JSON Schema del informe (contrato IA ↔ PDF) + ejemplos + validador |
| `rag/` | prototipo de la recuperación (compilador del vault + pruebas) |
| `app/` | la PWA + la función serverless. Se despliega en Vercel. Ver `app/README.md` |
| `ANALISIS.html` | dossier completo: decisiones, arquitectura, riesgos, costes |
| `costos.md` | desglose del coste de IA por llamada |
| `Reporte.jpeg`, `reporte.md` | el formato de salida que pidió la doctora (referencia) |

## Puesta en marcha

```bash
cd app
npm install
cp .env.example .env          # pega la key de Alibaba en DASHSCOPE_API_KEY
npm run build                 # recompila el cerebro + build de la PWA
npm run local                 # http://localhost:8787  (frontend + /api)
```

El PDF de referencia del libro (`AURICULOTERAPIA*.pdf`, ~190 MB) **no está en git** — se guarda
aparte. El cerebro ya está destilado y sí está versionado.
