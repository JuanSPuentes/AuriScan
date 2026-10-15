import { Clerk } from "@clerk/clerk-js";

const $ = (s) => document.querySelector(s);

const clerk = new Clerk(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
await clerk.load();

function authHeaders() {
  return clerk.session ? clerk.session.getToken().then((t) => ({ Authorization: `Bearer ${t}` })) : Promise.resolve({});
}

function actualizarSesion() {
  const ub = $("#user-button");
  if (!clerk.user) {
    $("#login-gate").hidden = false;
    $("#no-autorizado").hidden = true;
    $("#panel").hidden = true;
    ub.innerHTML = "";
    return;
  }
  $("#login-gate").hidden = true;
  ub.innerHTML = `<span class="user-email">${clerk.user.primaryEmailAddress?.emailAddress || ""}</span>
     <button type="button" id="btn-logout" class="enlace">Cerrar sesión</button>`;
  $("#btn-logout").addEventListener("click", () => clerk.signOut());
  cargarMetricas();
}
clerk.addListener(actualizarSesion);
actualizarSesion();

$("#btn-login").addEventListener("click", () => clerk.redirectToSignIn({ redirectUrl: window.location.href }));

$("#btn-excel").addEventListener("click", async () => {
  const btn = $("#btn-excel");
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = "Generando…";
  try {
    const r = await fetch("/api/admin-metricas-excel", { headers: await authHeaders() });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || `Error ${r.status}`);
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const cd = r.headers.get("Content-Disposition") || "";
    const nombre = /filename="([^"]+)"/.exec(cd)?.[1] || "auriscan-metricas.xlsx";
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    alert("No se pudo descargar el Excel: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

function tabla(el, filas, cols) {
  el.innerHTML = `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${filas.length ? filas.map((f) => `<tr>${f.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${cols.length}">Sin datos todavía.</td></tr>`}</tbody>`;
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function cargarPagosPendientes() {
  try {
    const r = await fetch("/api/admin-pagos-pendientes", { headers: await authHeaders() });
    if (!r.ok) return;
    const data = await r.json();
    const filas = (data.pagos || []).map((p) => [
      new Date(p.creado_en).toLocaleString("es-CO"),
      escapar(p.email),
      `<code>${escapar(p.referencia)}</code>`,
      `${(p.monto_centavos / 100).toLocaleString("es-CO")} ${escapar(p.moneda)}`,
      escapar(p.caso_id || p.informe_id),
    ]);
    tabla($("#t-pagos-pendientes"), filas, ["Desde", "Paciente", "Referencia", "Monto", "Informe"]);
  } catch {
    // el resto del panel no depende de esto -- si falla, simplemente no se llena la tabla.
  }
}

$("#form-verificar-pago").addEventListener("submit", async (e) => {
  e.preventDefault();
  const referencia = $("#vp-referencia").value.trim();
  const transaccion_id = $("#vp-transaccion").value.trim();
  const btn = e.target.querySelector("button[type=submit]");
  const out = $("#vp-resultado");
  btn.disabled = true;
  out.hidden = false;
  out.classList.remove("error");
  out.textContent = "Consultando a Wompi…";
  try {
    const r = await fetch("/api/admin-pago-verificar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ referencia, transaccion_id }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);

    if (data.estado_nuevo === "aprobado" && data.estado_anterior !== "aprobado") {
      out.textContent = `Pago confirmado y actualizado a "aprobado". El paciente ya puede descargar su PDF (informe ${data.informe_id}).`;
    } else if (data.estado_nuevo === data.estado_anterior) {
      out.textContent = `Wompi dice que esa transacción está en estado "${data.estado_wompi}" -- no cambió nada acá (ya estaba en "${data.estado_anterior}").`;
    } else {
      out.textContent = `Actualizado de "${data.estado_anterior}" a "${data.estado_nuevo}" (Wompi: ${data.estado_wompi}).`;
    }
    cargarPagosPendientes();
  } catch (err) {
    out.classList.add("error");
    out.textContent = "No se pudo verificar: " + err.message;
  } finally {
    btn.disabled = false;
  }
});

async function cargarMetricas() {
  try {
    const r = await fetch("/api/admin-metricas", { headers: await authHeaders() });
    if (r.status === 403) {
      $("#no-autorizado").hidden = false;
      $("#panel").hidden = true;
      return;
    }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);

    $("#no-autorizado").hidden = true;
    $("#panel").hidden = false;
    $("#m-totales").textContent =
      `${data.total_informes} informes guardados · ${data.pagos_aprobados.n} pagos aprobados ` +
      `(${(data.pagos_aprobados.total_centavos / 100).toLocaleString("es-CO")} COP)`;

    tabla($("#t-sistemas"), data.sistemas_implicados.map((s) => [s.sistema, s.n]), ["Sistema", "Informes"]);
    tabla($("#t-puntos"), data.puntos_mas_frecuentes.map((p) => [p.nombre, p.estado, p.n]), ["Punto", "Estado", "Veces"]);
    cargarPagosPendientes();
  } catch (err) {
    $("#m-totales").textContent = "Error cargando métricas: " + err.message;
  }
}
