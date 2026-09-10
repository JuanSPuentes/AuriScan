// Historial de informes — SOLO en el dispositivo (IndexedDB). Nada sale del navegador.
// Si IndexedDB no está disponible (modo privado, etc.), el historial queda desactivado sin romper la app.

const DB = "auricular";
const STORE = "informes";
const MAX = 40; // se conservan los más recientes

function abrir() {
  return new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open(DB, 1); } catch (e) { return rej(e); }
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore(STORE, { keyPath: "caso_id" });
      s.createIndex("guardado_en", "guardado_en");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

const tx = (db, modo) => db.transaction(STORE, modo).objectStore(STORE);
const prom = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export function disponible() {
  return typeof indexedDB !== "undefined";
}

/** Guarda (o reemplaza) un informe y su foto. Devuelve true si se guardó. */
export async function guardar({ informe, fotoDataUrl }) {
  const id = informe?.meta?.caso_id;
  if (!id) return false;
  try {
    const db = await abrir();
    const rec = {
      caso_id: id,
      titulo: informe.infografico?.titulo || "Informe auricular",
      motivo: informe.meta?.motivo || "",
      modo: informe.meta?.modo || "",
      fecha: informe.meta?.fecha || "",
      guardado_en: Date.now(),
      informe,
      foto: fotoDataUrl || null,
    };
    await prom(tx(db, "readwrite").put(rec));
    await podar(db);
    db.close();
    return true;
  } catch { return false; }
}

async function podar(db) {
  const todos = await prom(tx(db, "readonly").getAll());
  if (todos.length <= MAX) return;
  const sobra = todos.sort((a, b) => a.guardado_en - b.guardado_en).slice(0, todos.length - MAX);
  const store = tx(db, "readwrite");
  for (const r of sobra) store.delete(r.caso_id);
}

/** Lista los informes, del más reciente al más antiguo (sin el JSON completo ni la foto). */
export async function listar() {
  try {
    const db = await abrir();
    const todos = await prom(tx(db, "readonly").getAll());
    db.close();
    return todos
      .sort((a, b) => b.guardado_en - a.guardado_en)
      .map(({ caso_id, titulo, motivo, modo, fecha, guardado_en }) => ({ caso_id, titulo, motivo, modo, fecha, guardado_en }));
  } catch { return []; }
}

/** Devuelve { informe, foto } de un caso, o null. */
export async function obtener(id) {
  try {
    const db = await abrir();
    const r = await prom(tx(db, "readonly").get(id));
    db.close();
    return r ? { informe: r.informe, foto: r.foto } : null;
  } catch { return null; }
}

export async function borrar(id) {
  try { const db = await abrir(); await prom(tx(db, "readwrite").delete(id)); db.close(); return true; }
  catch { return false; }
}

export async function borrarTodo() {
  try { const db = await abrir(); await prom(tx(db, "readwrite").clear()); db.close(); return true; }
  catch { return false; }
}
