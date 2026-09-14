// Cuánto se ha gastado en el workspace de Model Studio de la doctora, usando la Billing API
// (BSS OpenAPI) de Alibaba Cloud — porque el Bill Details de la consola, agrupado por cuenta,
// no separa por workspace/API key; hay que leerlo a nivel de línea (DescribeInstanceBill) y
// parsear el campo instanceID, que trae "tipo;workspace_id;modelo;input_o_output;canal".
//
// Requiere un AccessKey de un usuario/rol RAM con la política de sistema AliyunBSSReadOnlyAccess
// (de solo lectura de facturación — no el mismo tipo de key "sk-..." que usa DashScope).
//
// Uso:
//   node scripts/gasto-doctora.mjs [YYYY-MM]      (por defecto: mes actual)
//
// Configura en app/.env (no se sube a git):
//   ALIBABA_AK_ID=...
//   ALIBABA_AK_SECRET=...

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// El paquete es CJS con doble envoltorio de "default" (Darabonba); el import por defecto de ESM
// solo desenvuelve un nivel, así que hay que bajar un nivel más para llegar a la clase real.
import bss, { DescribeInstanceBillRequest } from "@alicloud/bssopenapi20171214";
const Client = bss.default;
import * as $OpenApi from "@alicloud/openapi-client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
try {
  for (const l of readFileSync(envPath, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const AK_ID = process.env.ALIBABA_AK_ID;
const AK_SECRET = process.env.ALIBABA_AK_SECRET;
if (!AK_ID || !AK_SECRET) {
  console.error(
    "Faltan ALIBABA_AK_ID / ALIBABA_AK_SECRET en app/.env.\n" +
    "Son el AccessKey ID/Secret de un usuario RAM con la política AliyunBSSReadOnlyAccess\n" +
    "(distinto del 'sk-...' de DashScope — ese es para llamar los modelos, este es para leer la factura)."
  );
  process.exit(1);
}

const ciclo = process.argv[2] || new Date().toISOString().slice(0, 7); // YYYY-MM

// Palabras que identifican las líneas de Model Studio dentro de la factura completa de la cuenta.
const ES_MODEL_STUDIO = (nombre = "") =>
  /model studio|bailian|dashscope/i.test(nombre);

const client = new Client(
  new $OpenApi.Config({
    accessKeyId: AK_ID,
    accessKeySecret: AK_SECRET,
    // BSS OpenAPI para cuentas internacionales vive solo en ap-southeast-1 (no depende de en qué
    // región estén los recursos que se facturan) — "business.aliyuncs.com" a secas es el dominio
    // de cuentas mainland y da 400 "caller site doesn't match the API domain regionId".
    endpoint: "business.ap-southeast-1.aliyuncs.com",
  })
);

async function traerTodo() {
  let nextToken;
  const items = [];
  do {
    const req = new DescribeInstanceBillRequest({
      billingCycle: ciclo,
      isHideZeroCharge: false, // en false: si no, oculta justo las líneas de $0 que buscamos (pings de prueba)
      // Model Studio es consumo por token, no una "instancia" de recurso como una VM: en la vista
      // por instancia (isBillingItem:false) sus workspaces no siempre aparecen bien agrupados.
      // En la vista por ítem facturable sí -- ahí es donde de verdad sale cada workspaceId.
      isBillingItem: true,
      maxResults: 300,
      nextToken,
    });
    const resp = await client.describeInstanceBill(req);
    const data = resp.body?.data;
    for (const it of data?.items || []) items.push(it);
    nextToken = data?.nextToken || undefined;
  } while (nextToken);
  return items;
}

function partirInstanceId(id = "") {
  // Formato documentado por Model Studio: tipo;workspace_id;modelo;input_o_output;canal
  const partes = String(id).split(";");
  return {
    tipo: partes[0] || "",
    workspaceId: partes[1] || "(sin workspace)",
    modelo: partes[2] || "",
    io: partes[3] || "",
    canal: partes[4] || "",
  };
}

console.log(`Ciclo de facturación: ${ciclo}\n`);

let items;
try {
  items = await traerTodo();
} catch (e) {
  console.error("Error llamando a BSS OpenAPI:", e.message || e);
  console.error(
    "Revisa: 1) el AccessKey tiene AliyunBSSReadOnlyAccess, 2) el ciclo YYYY-MM es válido " +
    "y de los últimos 18 meses, 3) las credenciales no expiraron."
  );
  process.exit(1);
}

console.log(`Total de líneas en la factura de este ciclo: ${items.length}`);

const deModelStudio = items.filter((it) => ES_MODEL_STUDIO(it.productName) || ES_MODEL_STUDIO(it.commodityCode));

if (!deModelStudio.length) {
  const productos = [...new Set(items.map((it) => `${it.productName} (${it.commodityCode})`))];
  console.log(
    "\nNo encontré líneas que hagan match con /model studio|bailian|dashscope/ en el nombre del producto.\n" +
    "Productos presentes en esta factura (para ajustar el filtro si el nombre es otro):"
  );
  productos.forEach((p) => console.log("  -", p));
  process.exit(0);
}

// pretaxAmount = lo que se paga de verdad (ya con cupones/créditos gratis descontados).
// pretaxGrossAmount = precio de lista, antes de ese descuento -- el que muestra "Gross Amount"
// en la consola. Mientras haya crédito gratis cubriendo todo, pretaxAmount da 0 aunque el
// consumo real (gross) no lo sea; por eso hay que mostrar los dos.
const porWorkspace = new Map(); // workspaceId -> { pagado, bruto, n, modelos:Set }
for (const it of deModelStudio) {
  const { workspaceId, modelo } = partirInstanceId(it.instanceID);
  const acc = porWorkspace.get(workspaceId) || { pagado: 0, bruto: 0, n: 0, modelos: new Set() };
  acc.pagado += Number(it.pretaxAmount || 0);
  acc.bruto += Number(it.pretaxGrossAmount || it.pretaxAmount || 0);
  acc.n += 1;
  if (modelo) acc.modelos.add(modelo);
  porWorkspace.set(workspaceId, acc);
}

console.log(`\nLíneas de Model Studio: ${deModelStudio.length} · moneda: ${items[0]?.currency || "?"}\n`);
console.table(
  [...porWorkspace.entries()].map(([workspaceId, v]) => ({
    workspaceId,
    "costo real (gross)": v.bruto.toFixed(6),
    "pagado (con cupón)": v.pagado.toFixed(6),
    lineas: v.n,
    modelos: [...v.modelos].join(", "),
  }))
);

const totalBruto = deModelStudio.reduce((s, it) => s + Number(it.pretaxGrossAmount || it.pretaxAmount || 0), 0);
const totalPagado = deModelStudio.reduce((s, it) => s + Number(it.pretaxAmount || 0), 0);
console.log(`\nTotal Model Studio (todos los workspaces), ${ciclo}:`);
console.log(`  costo real (gross, antes de cupón): ${totalBruto.toFixed(6)} ${items[0]?.currency || ""}`);
console.log(`  pagado de verdad (con cupón/crédito gratis): ${totalPagado.toFixed(6)} ${items[0]?.currency || ""}`);
console.log(
  "\nPara identificar cuál workspaceId es el de la doctora: Model Studio → Workspaces, " +
  "compara el ID de la lista con los que salieron arriba."
);
