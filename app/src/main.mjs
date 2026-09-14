import { Clerk } from "@clerk/clerk-js";

const $ = (s) => document.querySelector(s);
const estado = $("#estado");

let imagenDataUrl = null;
let modo = null;
let oreja = "no_determinada";
let consentimiento = false;
let consentimientoInvestigacion = false;
let informeIdActual = null;
let resumenActual = null;

const LADO_MIN = 600; // px del lado mayor de la foto original

// --- 0 · sesión (Clerk, solo Google) ----------------------------------
const clerk = new Clerk(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
await clerk.load();

function authHeaders() {
  return clerk.session ? clerk.session.getToken().then((t) => ({ Authorization: `Bearer ${t}` })) : Promise.resolve({});
}

function actualizarSesion() {
  const conectado = !!clerk.user;
  $("#login-gate").hidden = conectado;
  $("#app-contenido").hidden = !conectado;
  if (conectado) clerk.mountUserButton($("#user-button"));
}
clerk.addListener(actualizarSesion);
actualizarSesion();

$("#btn-login").addEventListener("click", () => clerk.openSignIn({}));

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
$("#consent-investigacion").addEventListener("change", (e) => { consentimientoInvestigacion = e.target.checked; refrescar(); });

function refrescar() {
  $("#analizar").disabled = !(imagenDataUrl && modo && consentimiento && consentimientoInvestigacion);
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
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ imagen: imagenDataUrl, modo, oreja, consentimiento, consentimientoInvestigacion }),
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
    informeIdActual = data.informe_id;
    resumenActual = data.resumen;
    mostrarResumen(resumenActual, false);
    setEstado("");
    renderHistorial();
  } catch (err) {
    setEstado("Error: " + err.message, true);
  } finally {
    clearInterval(timer);
    refrescar();
  }
});

// --- resumen en pantalla (el informe completo solo existe en el servidor,
// y solo se convierte en PDF si hay un pago aprobado) -------------------
function enlaceWhatsapp(resumen) {
  const msg = `Hola Dra. Jakeline, tengo mi informe de AuriScan${resumen.caso_id ? ` (${resumen.caso_id})` : ""}` +
    `${resumen.diagnostico_principal ? `: ${resumen.diagnostico_principal}` : ""}. Quiero agendar una consulta.`;
  return `https://wa.me/573108178456?text=${encodeURIComponent(msg)}`;
}

function mostrarResumen(resumen, pagado) {
  $("#resumen-titulo").textContent = resumen.diagnostico_principal || "Análisis completado";
  $("#resumen-sistemas").innerHTML = (resumen.sistemas || []).map((s) => `<li>${s}</li>`).join("");
  $("#resumen-disclaimer").textContent = resumen.disclaimer || "";
  $("#agendar").href = enlaceWhatsapp(resumen);
  actualizarBotonDescarga(pagado);
  $("#resultado").hidden = false;
  $("#resultado").scrollIntoView({ behavior: "smooth" });
}

function actualizarBotonDescarga(pagado) {
  const btn = $("#descargar");
  btn.textContent = pagado ? "Descargar PDF" : "Pagar y descargar PDF";
  btn.dataset.pagado = pagado ? "1" : "";
}

$("#descargar").addEventListener("click", async () => {
  if (!informeIdActual) return;
  if (!$("#descargar").dataset.pagado) return iniciarPago();
  await descargarPdf();
});

async function iniciarPago() {
  const btn = $("#descargar");
  btn.disabled = true;
  setEstado("Preparando el pago…");
  try {
    const r = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ informe_id: informeIdActual }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    if (data.ya_pagado) { actualizarBotonDescarga(true); await descargarPdf(); return; }
    window.location.href = data.url; // redirige a Wompi
  } catch (err) {
    setEstado("No se pudo iniciar el pago: " + err.message, true);
    btn.disabled = false;
  }
}

async function descargarPdf() {
  const btn = $("#descargar");
  btn.disabled = true;
  setEstado("Generando el PDF…");
  try {
    const r = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ informe_id: informeIdActual }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || `(${r.status})`);
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(resumenActual?.caso_id || "informe-auricular").replace(/[^\w.-]/g, "")}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setEstado("");
  } catch (err) {
    setEstado("No se pudo descargar el PDF: " + err.message + ". Vuelve a intentar.", true);
  } finally {
    btn.disabled = false;
  }
}

// --- vuelta desde Wompi: /?informe_id=...&id=<transaccion>&env=... -----
async function revisarRetornoDePago() {
  const qs = new URLSearchParams(location.search);
  const informeId = qs.get("informe_id");
  const transaccionId = qs.get("id");
  if (!informeId || !transaccionId) return;
  history.replaceState({}, "", location.pathname); // limpia la URL

  setEstado("Confirmando el pago…");
  try {
    const r = await fetch("/api/pago-estado", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ transaccion_id: transaccionId }),
    });
    const data = await r.json();
    if (data.aprobado) {
      informeIdActual = data.informe_id;
      actualizarBotonDescarga(true);
      $("#resultado").hidden = false;
      setEstado("Pago aprobado. Descargando el PDF…");
      await descargarPdf();
      renderHistorial();
    } else {
      setEstado("El pago no se aprobó (" + (data.estado_wompi || "desconocido") + "). Intenta de nuevo.", true);
    }
  } catch (err) {
    setEstado("No se pudo confirmar el pago: " + err.message, true);
  }
}

function setEstado(t, esError = false) {
  estado.textContent = t;
  estado.hidden = !t;
  estado.classList.toggle("error", esError);
}

// --- mis informes (guardados en el servidor, ligados a la cuenta) ------
const fmtFecha = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? (iso || "") : d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
};

async function renderHistorial() {
  if (!clerk.user) return;
  const sec = $("#historial"), ul = $("#hist-lista");
  try {
    const r = await fetch("/api/mis-informes", { headers: await authHeaders() });
    const data = await r.json();
    const items = data.informes || [];
    sec.hidden = items.length === 0;
    ul.innerHTML = items.map((it) => `
      <li data-id="${it.id}" data-pagado="${it.pagado ? "1" : ""}">
        <button class="hist-abrir" type="button">
          <span class="hist-tit">${it.titulo || "Informe auricular"}</span>
          <span class="hist-meta">${fmtFecha(it.creado_en)} · ${it.modo === "con_agujas" ? "con agujas" : "oreja limpia"} · ${it.pagado ? "pagado" : "sin pagar"}</span>
        </button>
      </li>`).join("");
  } catch { sec.hidden = true; }
}

$("#hist-lista").addEventListener("click", async (e) => {
  const li = e.target.closest("li");
  if (!li || !e.target.closest(".hist-abrir")) return;
  informeIdActual = li.dataset.id;
  resumenActual = { caso_id: li.dataset.id };
  actualizarBotonDescarga(!!li.dataset.pagado);
  $("#resumen-titulo").textContent = li.querySelector(".hist-tit").textContent;
  $("#resumen-sistemas").innerHTML = "";
  $("#resumen-disclaimer").textContent = "Informe recuperado de tu historial.";
  $("#resultado").hidden = false;
  $("#resultado").scrollIntoView({ behavior: "smooth" });
});

revisarRetornoDePago();
