// Regenera vault-index.json y copia los archivos del contrato a api/_lib/.
// Corre antes de `vite build`. En Vercel (donde ../rag y ../contrato NO existen)
// no hace nada: los archivos ya viajan dentro de api/_lib/.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..");
const lib = join(root, "api", "_lib");
mkdirSync(lib, { recursive: true });

const compile = join(repo, "rag", "compile.mjs");
if (!existsSync(compile)) {
  console.log("prepare: sin ../rag ni ../contrato (deploy) — se usan los archivos ya presentes en api/_lib/");
  process.exit(0);
}

execFileSync("node", [compile], { stdio: "inherit" });

const pub = join(root, "public");
const copias = [
  [join(repo, "rag", "vault-index.json"), join(lib, "vault-index.json")],
  [join(repo, "contrato", "informe.schema.json"), join(lib, "informe.schema.json")],
  [join(repo, "contrato", "coordenadas-oreja.json"), join(lib, "coordenadas-oreja.json")],
  [join(repo, "contrato", "ejemplo-oreja-limpia.json"), join(pub, "ejemplo-oreja-limpia.json")],
  [join(repo, "contrato", "ejemplo-ansiedad.json"), join(pub, "ejemplo-ansiedad.json")],
];
for (const [src, dst] of copias) { copyFileSync(src, dst); console.log("copiado", dst.replace(root, ".")); }
