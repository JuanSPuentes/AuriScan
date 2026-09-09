import { construirDocumentoHTML } from "./report.mjs";

const $ = (s) => document.querySelector(s);
const estado = $("#estado");

let imagenDataUrl = null;
let modo = null;
let oreja = "no_determinada";
let informe = null;
let logoDataUrl = null;

// Logo -> data URI (para que el informe sea autocontenido en la ventana de impresión)
fetch("/logo.png")
  .then((r) => (r.ok ? r.blob() : Promise.reject()))
  .then((b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }))
  .then((d) => { logoDataUrl = d; })
  .catch(() => {});

// --- 1 · imagen: elegir + redimensionar en el cliente -----------------
$("#file").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  setEstado("Procesando la imagen…");
  imagenDataUrl = await redimensionar(f, 1400, 0.85);
  const img = $("#preview");
  img.src = imagenDataUrl;
  img.hidden = false;
  $("#dz-texto").textContent = "Cambiar foto";
  setEstado("");
  refrescar();
});

function redimensionar(file, maxLado, calidad) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", calidad));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

// --- 2 · modo  ·  3 · oreja ------------------------------------------
document.querySelectorAll(".op[data-modo]").forEach((b) =>
  b.addEventListener("click", () => {
    modo = b.dataset.modo;
    document.querySelectorAll(".op[data-modo]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    refrescar();
  }));
document.querySelectorAll(".op[data-oreja]").forEach((b) =>
  b.addEventListener("click", () => {
    oreja = b.dataset.oreja;
    document.querySelectorAll(".op[data-oreja]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));

function refrescar() {
  $("#analizar").disabled = !(imagenDataUrl && modo);
}

// --- 3 · analizar ---------------------------------------------------
$("#analizar").addEventListener("click", async () => {
  $("#analizar").disabled = true;
  setEstado("Analizando la imagen con la IA… (puede tardar 30–90 s, no cierres la página)");
  const t0 = Date.now();
  const timer = setInterval(() => {
    if (estado.hidden) return;
    setEstado(`Analizando… ${Math.round((Date.now() - t0) / 1000)} s`);
  }, 1000);
  try {
    const r = await fetch("/api/analizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagen: imagenDataUrl, modo, oreja }),
    });
    const txt = await r.text();
    let data;
    try { data = JSON.parse(txt); }
    catch {
      throw new Error(txt.trim()
        ? `Respuesta inesperada del servidor (${r.status}).`
        : `El análisis no respondió a tiempo (${Math.round((Date.now() - t0) / 1000)} s). Vuelve a intentar; con buena red suele funcionar al segundo intento.`);
    }
    if (!r.ok) throw new Error((data.error || `Error ${r.status}`) + (data.errores ? "\n" + data.errores.join("\n") : ""));
    informe = data.informe;
    mostrar(informe, data.debug);
    setEstado("");
  } catch (err) {
    setEstado("Error: " + err.message, true);
  } finally {
    clearInterval(timer);
    refrescar();
  }
});

// --- demo (sin gastar IA) ------------------------------------------
$("#demo").addEventListener("click", async () => {
  setEstado("Cargando ejemplo…");
  try {
    const r = await fetch("/ejemplo-oreja-limpia.json");
    informe = await r.json();
    mostrar(informe, null);
    setEstado("Ejemplo cargado (no consumió IA).");
  } catch {
    setEstado("No se pudo cargar el ejemplo.", true);
  }
});

// --- render + descarga -------------------------------------------
const PAGINA_PX = 794; // ancho A4 @96dpi

function ajustarVista() {
  const wrap = $("#vista-wrap"), vista = $("#vista");
  const doc = vista.contentDocument;
  if (!doc?.body) return;
  const disponible = wrap.clientWidth - 20; // menos el padding
  const escala = Math.min(1, disponible / PAGINA_PX);
  const altoReal = doc.documentElement.scrollHeight;
  vista.style.transform = `scale(${escala})`;
  vista.style.height = altoReal + "px";
  wrap.style.height = Math.ceil(altoReal * escala) + 20 + "px";
}

function mostrar(inf, debug) {
  const html = construirDocumentoHTML(inf, imagenDataUrl, logoDataUrl);
  const vista = $("#vista");
  vista.onload = () => {
    ajustarVista();
    setTimeout(ajustarVista, 300); // reajuste tras cargar fuentes
    const d = vista.contentDocument;
    if (d?.fonts?.ready) d.fonts.ready.then(ajustarVista);
  };
  vista.srcdoc = html;
  $("#resultado").hidden = false;
  if (debug) {
    $("#debug").hidden = false;
    $("#debug-pre").textContent =
      `notas RAG: ${debug.rag?.notas} · contexto ~${debug.rag?.tokensEst} tok\n` +
      `coste IA: US$ ${debug.costoTotalUsd}\n` +
      (debug.avisosVault?.length ? `avisos: ${debug.avisosVault.join(" | ")}\n` : "") +
      JSON.stringify(debug.costos, null, 2);
  }
  $("#resultado").scrollIntoView({ behavior: "smooth" });
}

$("#descargar").addEventListener("click", () => {
  if (!informe) return;
  const html = construirDocumentoHTML(informe, imagenDataUrl, logoDataUrl);
  const w = window.open("", "_blank");
  if (!w) {
    setEstado("El navegador bloqueó la ventana emergente. Permítelas para este sitio y vuelve a intentar.", true);
    return;
  }
  w.document.write(html);
  w.document.close();
  const lanzar = () => {
    const seguir = () => setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 300);
    if (w.document.fonts?.ready) w.document.fonts.ready.then(seguir).catch(seguir);
    else seguir();
  };
  if (w.document.readyState === "complete") lanzar();
  else w.addEventListener("load", lanzar);
  setEstado("Se abrió el informe en otra pestaña. Elige «Guardar como PDF» en el diálogo de impresión.");
});

function setEstado(t, esError = false) {
  estado.textContent = t;
  estado.hidden = !t;
  estado.classList.toggle("error", esError);
}

let _rt;
window.addEventListener("resize", () => { clearTimeout(_rt); _rt = setTimeout(ajustarVista, 150); });

const qs = new URLSearchParams(location.search);
if (qs.has("demo")) {
  $("#demo").click();
  if (qs.has("pdf")) setTimeout(() => $("#descargar").click(), 2500);
}
