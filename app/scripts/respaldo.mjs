// Respaldo diario de Postgres -> OSS. Corre dentro del contenedor "respaldo" del
// docker-compose, en loop: espera hasta la hora fijada y hace pg_dump + sube a OSS.
// No reemplaza tener el disco de la VM respaldado aparte -- es la red de seguridad barata
// mientras el proyecto no está en RDS (con backups automáticos incluidos).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import OSS from "ali-oss";

const exec = promisify(execFile);
const HORA_UTC = Number(process.env.RESPALDO_HORA_UTC || 7); // ~2am Colombia

function client() {
  const { OSS_REGION, OSS_BUCKET, OSS_AK_ID, OSS_AK_SECRET } = process.env;
  if (!OSS_REGION || !OSS_BUCKET || !OSS_AK_ID || !OSS_AK_SECRET) {
    console.error("Faltan variables de OSS -- el respaldo no se puede subir.");
    return null;
  }
  return new OSS({ region: OSS_REGION, bucket: OSS_BUCKET, accessKeyId: OSS_AK_ID, accessKeySecret: OSS_AK_SECRET });
}

async function respaldar() {
  const fecha = new Date().toISOString().slice(0, 10);
  console.log(`[respaldo] iniciando pg_dump (${fecha})`);
  try {
    const { stdout } = await exec("pg_dump", [process.env.DATABASE_URL, "--format=custom"], {
      maxBuffer: 1024 * 1024 * 200, encoding: "buffer",
    });
    const oss = client();
    if (!oss) return;
    const key = `respaldos/auriscan-${fecha}.dump`;
    await oss.put(key, stdout);
    console.log(`[respaldo] OK -> ${key} (${stdout.length} bytes)`);
  } catch (e) {
    console.error("[respaldo] FALLÓ:", e.message || e);
  }
}

function msHastaLaHora() {
  const ahora = new Date();
  const objetivo = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), HORA_UTC, 0, 0));
  if (objetivo <= ahora) objetivo.setUTCDate(objetivo.getUTCDate() + 1);
  return objetivo - ahora;
}

async function loop() {
  for (;;) {
    const espera = msHastaLaHora();
    console.log(`[respaldo] próxima corrida en ${Math.round(espera / 3600000)} h`);
    await new Promise((r) => setTimeout(r, espera));
    await respaldar();
  }
}

loop();
