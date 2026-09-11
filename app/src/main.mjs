import { construirDocumentoHTML } from "./report.mjs";
import * as historial from "./historial.mjs";

const $ = (s) => document.querySelector(s);
const estado = $("#estado");

let imagenDataUrl = null;
let modo = null;
let oreja = "no_determinada";
let consentimiento = false;
let informe = null;
let fotoActual = null;   // la foto que acompaña al informe mostrado (subida o recuperada del historial)
let logoDataUrl = null;

const LADO_MIN = 600; // px del lado mayor de la foto original
const HISTORIAL_VISIBLE = false; // los informes se siguen guardando en el dispositivo, pero la sección "Mis informes" está oculta

// Emblema del logo -> data URI (para que el informe sea autocontenido en la ventana de impresión)
fetch("/logo-emblema.png")
  .then((r) => (r.ok ? r.blob() : Promise.reject()))
  .then((b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }))
  .then((d) => { logoDataUrl = d; })
  .catch(() => {});

// --- 1 · imagen: elegir + redimensionar en el cliente -----------------
$("#file").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  setEstado("Procesando la imagen…");
  let r;
  try { r = await redimensionar(f, 1400, 0.85); }
  catch { setEstado("No se pudo leer la imagen. Prueba con otra foto.", true); return; }

  if (Math.max(r.ow, r.oh) < LADO_MIN) {
    imagenDataUrl = null;
    $("#preview").hidden = true;
    $("#dz-texto").textContent = "Toca para tomar o elegir una foto del oído";
    setEstado(`La foto es demasiado pequeña (${r.ow}×${r.oh} px). Necesita al menos ${LADO_MIN} px de lado para el análisis.`, true);
    refrescar();
    return;
  }

  imagenDataUrl = r.url;
  const img = $("#preview");
  img.src = imagenDataUrl;
  img.hidden = false;
  $("#dz-texto").textContent = "Cambiar foto";
  setEstado(Math.max(r.ow, r.oh) < 900 ? "Foto un poco justa de resolución; si el informe sale con baja confianza, repite con una más nítida." : "");
  refrescar();
});

function redimensionar(file, maxLado, calidad) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const ow = img.width, oh = img.height;
      const escala = Math.min(1, maxLado / Math.max(ow, oh));
      const c = document.createElement("canvas");
      c.width = Math.round(ow * escala);
      c.height = Math.round(oh * escala);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res({ url: c.toDataURL("image/jpeg", calidad), ow, oh });
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

$("#consent").addEventListener("change", (e) => { consentimiento = e.target.checked; refrescar(); });

function refrescar() {
  $("#analizar").disabled = !(imagenDataUrl && modo && consentimiento);
}

// --- 3 · analizar ---------------------------------------------------
$("#analizar").addEventListener("click", async () => {
  $("#analizar").disabled = true;
  setEstado("Preparando el análisis… (30–90 s, no cierres la página)");
  const t0 = Date.now();
  const fase = (s) => s < 22 ? "Observando la oreja región por región" : s < 45 ? "Redactando el informe" : "Revisando el informe";
  const timer = setInterval(() => {
    if (estado.hidden) return;
    const s = Math.round((Date.now() - t0) / 1000);
    setEstado(`${fase(s)}… ${s} s`);
  }, 1000);
  try {
    const r = await fetch("/api/analizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagen: imagenDataUrl, modo, oreja, consentimiento }),
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
    if (data.rechazo) {           // imagen no apta: se cortó antes del informe (no es un error)
      $("#preview").hidden = true;
      $("#dz-texto").textContent = "Toca para tomar o elegir una foto del oído";
      imagenDataUrl = null;
      setEstado(data.mensaje || "La imagen no sirve para el análisis. Prueba con otra foto.", true);
      return;
    }
    informe = data.informe;
    fotoActual = imagenDataUrl;
    mostrar(informe, data.debug, fotoActual);
    setEstado("");
    if (await historial.guardar({ informe, fotoDataUrl: fotoActual })) renderHistorial();
  } catch (err) {
    setEstado("Error: " + err.message, true);
  } finally {
    clearInterval(timer);
    refrescar();
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

function enlaceWhatsapp(inf) {
  const dx = inf?.hipotesis_diagnostica?.diagnostico_principal;
  const caso = inf?.meta?.caso_id;
  const msg = `Hola Dra. Jakeline, tengo mi informe de AuriScan${caso ? ` (${caso})` : ""}` +
    `${dx ? `: ${dx}` : ""}. Quiero agendar una consulta.`;
  return `https://wa.me/573108178456?text=${encodeURIComponent(msg)}`;
}

function mostrar(inf, debug, foto = fotoActual) {
  const html = construirDocumentoHTML(inf, foto, logoDataUrl);
  $("#agendar").href = enlaceWhatsapp(inf);
  const vista = $("#vista");
  vista.onload = () => {
    ajustarVista();
    setTimeout(ajustarVista, 300); // reajuste tras cargar fuentes
    const d = vista.contentDocument;
    if (d?.fonts?.ready) d.fonts.ready.then(ajustarVista);
  };
  vista.srcdoc = html;
  $("#resultado").hidden = false;
  $("#resultado").scrollIntoView({ behavior: "smooth" });
}

$("#descargar").addEventListener("click", async () => {
  if (!informe) return;
  const btn = $("#descargar");
  btn.disabled = true;
  setEstado("Generando el PDF…");
  try {
    const r = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ informe, foto: fotoActual, logo: logoDataUrl }),
    });
    if (!r.ok) throw new Error(`(${r.status})`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(informe.meta?.caso_id || "informe-auricular").replace(/[^\w.-]/g, "")}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setEstado("");
  } catch (err) {
    // reserva: abrir el informe en otra pestaña para imprimir/guardar
    abrirParaImprimir();
    setEstado("No se pudo generar el PDF automáticamente " + err.message + ". Se abrió en otra pestaña: elige «Guardar como PDF».", true);
  } finally {
    btn.disabled = false;
  }
});

function abrirParaImprimir() {
  const html = construirDocumentoHTML(informe, fotoActual, logoDataUrl);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  const lanzar = () => {
    const seguir = () => setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 300);
    if (w.document.fonts?.ready) w.document.fonts.ready.then(seguir).catch(seguir);
    else seguir();
  };
  if (w.document.readyState === "complete") lanzar();
  else w.addEventListener("load", lanzar);
}

function setEstado(t, esError = false) {
  estado.textContent = t;
  estado.hidden = !t;
  estado.classList.toggle("error", esError);
}

// --- historial (solo en este dispositivo) --------------------------
const fmtFecha = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? (iso || "") : d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
};

async function renderHistorial() {
  if (!HISTORIAL_VISIBLE || !historial.disponible()) return;
  const items = await historial.listar();
  const sec = $("#historial"), ul = $("#hist-lista");
  sec.hidden = items.length === 0;
  ul.innerHTML = items.map((it) => `
    <li data-id="${it.caso_id}">
      <button class="hist-abrir" type="button">
        <span class="hist-tit">${it.titulo}</span>
        <span class="hist-meta">${fmtFecha(it.fecha)} · ${it.modo === "con_agujas" ? "con agujas" : "oreja limpia"}</span>
      </button>
      <button class="hist-del" type="button" title="Borrar" aria-label="Borrar">✕</button>
    </li>`).join("");
}

$("#hist-lista").addEventListener("click", async (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.closest(".hist-del")) {
    await historial.borrar(id);
    renderHistorial();
    return;
  }
  if (e.target.closest(".hist-abrir")) {
    const rec = await historial.obtener(id);
    if (!rec) { setEstado("No se pudo abrir ese informe.", true); return; }
    informe = rec.informe;
    fotoActual = rec.foto || null;
    mostrar(informe, null, fotoActual);
    setEstado("Informe recuperado del historial de este dispositivo.");
  }
});

$("#hist-borrar-todo").addEventListener("click", async () => {
  if (!confirm("¿Borrar todos los informes guardados en este dispositivo?")) return;
  await historial.borrarTodo();
  renderHistorial();
});

let _rt;
window.addEventListener("resize", () => { clearTimeout(_rt); _rt = setTimeout(ajustarVista, 150); });

renderHistorial();
