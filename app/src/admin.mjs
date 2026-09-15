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

function tabla(el, filas, cols) {
  el.innerHTML = `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${filas.length ? filas.map((f) => `<tr>${f.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${cols.length}">Sin datos todavía.</td></tr>`}</tbody>`;
}

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
  } catch (err) {
    $("#m-totales").textContent = "Error cargando métricas: " + err.message;
  }
}
