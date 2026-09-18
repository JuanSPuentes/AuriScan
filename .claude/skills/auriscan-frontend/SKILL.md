---
name: auriscan-frontend
description: Use for any visual/frontend change to the AuriScan app — app/index.html (landing), app/app.html (la herramienta), app/admin.html, app/src/*.css, app/src/report.mjs. Fija el sistema de diseño ya establecido, obliga a verificar con captura de pantalla real antes de dar un cambio por terminado, y evita dejar páginas sin revisar mientras se pule otra.
---

# AuriScan — desarrollo de frontend

## Por qué existe esta skill

En sesiones anteriores: (1) se cambió el hero de `/` a un tema oscuro que no combinaba con el
resto del sitio y hubo que revertirlo por completo; (2) mientras se pulía el footer de `/`, el
footer de `/app` (que es otro archivo, otras clases) se quedó exactamente como estaba y el
usuario lo vio como "esto no mejora en nada". Ambos eran evitables con un proceso fijo. Esta
skill es ese proceso — no un rediseño nuevo cada vez.

## 1. El sistema de diseño ya existe — reutilízalo, no lo reinventes

Variables en `app/src/styles.css :root` (compartidas con `landing.css`):

| Variable | Valor | Uso |
|---|---|---|
| `--tinta` | `#12243b` | texto principal |
| `--tinta2` | `#4b5972` | texto secundario |
| `--azul` | `#1f4e79` | marca, botones, títulos |
| `--azul2` | `#2e6da8` | acentos, hover, enlaces |
| `--azulc` | `#dbe8f4` | fondo de chip/marco/badge |
| `--papel` | `#f4f7fb` | fondo de página |
| `--linea` | `#c6d5e6` | bordes |
| `--ocre` | `#9c5628` | acento secundario, disclaimers |
| `--radio` | `12px` | radio de borde estándar |

Tipografía: **Spectral** (serif, títulos) + **IBM Plex Sans** (texto) + **IBM Plex Mono** (datos
técnicos, ids). Todo el sitio es de **tema claro**. No introduzcas paletas o fondos oscuros
nuevos sin que el usuario lo pida de forma explícita y específica — ya se intentó una vez sin
pedirlo con suficiente claridad y se revirtió.

Antes de estilizar algo nuevo, busca en el propio repo un patrón ya resuelto y reutilízalo en
vez de inventar uno:

| Necesitas | Reutiliza |
|---|---|
| Tarjeta con borde + sombra | `.paso-tarjeta`, `.login-gate`, `.l-metodo-card` |
| Chip / píldora | `.l-chips li`, `.af-contacto a`, `.l-doctora-focos li` |
| Marco circular con degradado (logo/ilustración) | `.l-doctora-marco`, `.l-hero-circulo` |
| Numerador circular de paso | `.paso-num`, `.l-paso-num`, `.l-metodo-ia-num` |
| Banner/CTA de ancho completo | `.l-anuncio`, `.l-cta-final` |

Si el pedido es de aspecto general ("mejora el diseño", "hazlo ver más profesional"), es una
señal para *auditar qué patrones ya existen* antes de escribir CSS nuevo, no para crear un
lenguaje visual paralelo.

## 2. Hay tres páginas -- revísalas todas, no solo la que te muestran

| Archivo | Qué es | Clases propias |
|---|---|---|
| `app/index.html` | landing | `l-*` en `landing.css` |
| `app/app.html` | la herramienta (login, subir foto, informe) | `.top`, `.login-gate`, `.paso*`, `.app-footer`/`.af-*` en `styles.css` |
| `app/admin.html` | panel de métricas | `.tabla-metricas` y otras en `styles.css` |

Cada una tiene su **propio nav y footer** (no son componentes compartidos). Si el usuario pide
un cambio genérico de estilo/consistencia, revisa las tres antes de decir que terminaste --
"ya se ve bien" en una sola página no es la tarea completa.

## 3. Nunca des por terminado un cambio visual sin una captura real

Este entorno (Windows) no tiene `chromium-cli`. Usa Puppeteer -- ya es dependencia del proyecto
(`puppeteer-core`, la misma que usa `api/pdf.mjs`):

```bash
cd app
node scripts/prepare.mjs && npx vite build
(nohup npx vite preview --port 4173 --host > /tmp/preview.log 2>&1 &) ; sleep 3
```

Script mínimo -- guárdalo como `app/scripts/shot-tmp.mjs` (bórralo al terminar, no lo comitees):

```js
import puppeteer from "puppeteer-core";
const exe = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"; // o Edge si no existe
const browser = await puppeteer.launch({ executablePath: exe, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 }); // repetir a 390x844 para móvil
await page.goto("http://127.0.0.1:4173/RUTA?v=" + Date.now(), { waitUntil: "networkidle0" });
await page.screenshot({ path: "shot.png", fullPage: true });
await browser.close();
```

Reglas:
- Corre el script **desde dentro de `app/`** -- si no, `puppeteer-core` no resuelve (no está en
  el scratchpad ni en la raíz del repo).
- Usa `?v=` con timestamp en la URL: la PWA tiene service worker (`vite-plugin-pwa`) y puede
  servir una build vieja cacheada sin el query param.
- **Mira la imagen con el visor antes de decir que algo se ve bien.** No lo asumas por el CSS
  que escribiste -- ya pasó que el nav se veía distinto a lo esperado y solo la captura lo
  reveló.
- Al terminar: borra los `.png` temporales y mata el proceso del preview
  (`netstat -ano | grep :4173` -> `taskkill //PID <pid> //F`) para no dejar procesos ni archivos
  sueltos en el repo. Confirma con `git status --short` que solo quedan los archivos que sí
  editaste a propósito.
- **Un `browser.launch()` nuevo por página/ruta que vayas a comparar.** Reutilizar el mismo
  browser para varias `page.goto()`/`page.reload()` seguidas (para ahorrar tiempo, ej. recorrer
  las 3 páginas en un solo script) puede producir capturas `fullPage` que muestran el contenido
  de la página ANTERIOR en vez de la actual -- un artefacto de Chromium headless, no un bug del
  sitio. Ya pasó: `/app` y `/admin` "aparecían" como si fueran el landing en varias corridas
  seguidas, y la causa real era el método de prueba, no el HTML/CSS. Si una captura muestra algo
  que no cuadra con el HTML, antes de reportarlo como bug verifica con un `browser.launch()`
  aislado (una sola página, una sola ruta) y compara contra `page.evaluate()` consultando el DOM
  directamente (`document.title`, `document.querySelector(...)`) -- eso no miente aunque la
  imagen sí pueda inducir a error.
- **Rutas limpias (`/app`, `/admin`) solo existen en producción** (las reescribe `nginx.conf` --
  ver `location = /app { try_files /app.html =404; }`). `vite preview` no las conoce: pide
  `/app.html` y `/admin.html` directamente, o vas a terminar probando el fallback (que sirve el
  landing) y no la página real.

## 4. Si el pedido puede implicar cambiar de tema (claro/oscuro) o paleta

Sepáralo en dos preguntas antes de tocar código: una para la **composición** (qué elementos,
qué layout -- ej. "barra de anuncio + nav con enlaces + badge + imagen circular") y otra para
la **paleta** (qué colores/tema). No asumas que "algo parecido a [referencia externa]" incluye
su paleta; casi siempre lo que se pide es la estructura, no los colores de otra marca.

## 5. Cambios pequeños y verificables, no todo de una vez

Edita una sección o página, reconstruye, compara la captura contra la anterior, y recién ahí
sigue con la próxima. No reescribas varias páginas en un solo golpe sin verificar cada una --
así quedó sin tocar el footer de `/app` mientras se pulía el de `/`.

## Referencia relacionada

Para decisiones de estética pura (tipografía, jerarquía, qué tan "genérico" se ve algo), usa
también la skill `frontend-design` si está disponible en la sesión -- esta skill (`auriscan-frontend`)
cubre el proceso y las convenciones específicas de este repo; esa otra cubre criterio de diseño
general.
