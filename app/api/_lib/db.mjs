// Conexión a Postgres (sin ORM -- SQL parametrizado directo con `pg`).
// DATABASE_URL: postgresql://usuario:clave@host:5432/basededatos

import pg from "pg";

let _pool;
function pool() {
  if (!_pool) {
    const cs = process.env.DATABASE_URL;
    if (!cs) throw new Error("Falta DATABASE_URL.");
    _pool = new pg.Pool({ connectionString: cs, max: 10 });
  }
  return _pool;
}

// query("select * from usuarios where id = $1", [id])
export function query(text, params) {
  return pool().query(text, params);
}

// una fila o null
export async function one(text, params) {
  const r = await query(text, params);
  return r.rows[0] || null;
}

export async function tx(fn) {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const r = await fn(client);
    await client.query("commit");
    return r;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
