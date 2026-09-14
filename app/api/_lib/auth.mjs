// Verifica la sesión de Clerk (Google, único método habilitado) y resuelve/crea la fila
// en `usuarios`. El frontend manda el token de sesión como "Authorization: Bearer <token>".

import { verifyToken, createClerkClient } from "@clerk/backend";
import { one, query } from "./db.mjs";

let _clerk;
function clerkClient() {
  if (!_clerk) _clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return _clerk;
}

// Devuelve la fila de `usuarios` para el request, o null si no hay sesión válida.
// No lanza: quien la llame decide si el endpoint exige sesión o no.
export async function usuarioDeRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  let payload;
  try {
    payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  } catch {
    return null; // token inválido o vencido
  }
  const clerkId = payload.sub;
  if (!clerkId) return null;

  const existente = await one("select * from usuarios where clerk_user_id = $1", [clerkId]);
  if (existente) return existente;

  // Primera vez que se ve este usuario: trae el perfil (correo, nombre) desde Clerk y lo crea.
  const perfil = await clerkClient().users.getUser(clerkId);
  const email = perfil.emailAddresses?.[0]?.emailAddress || "";
  const nombre = [perfil.firstName, perfil.lastName].filter(Boolean).join(" ") || null;
  const r = await query(
    `insert into usuarios (clerk_user_id, email, nombre) values ($1, $2, $3)
     on conflict (clerk_user_id) do update set email = excluded.email
     returning *`,
    [clerkId, email, nombre]
  );
  return r.rows[0];
}

// Para endpoints que exigen sesión: responde 401 y devuelve null si no hay usuario.
export async function exigirUsuario(req, res) {
  const usuario = await usuarioDeRequest(req);
  if (!usuario) {
    res.status(401).json({ error: "Inicia sesión para continuar." });
    return null;
  }
  return usuario;
}

// Para el panel de la doctora: exige sesión Y rol admin.
export async function exigirAdmin(req, res) {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return null;
  if (usuario.rol !== "admin") {
    res.status(403).json({ error: "No autorizado." });
    return null;
  }
  return usuario;
}
