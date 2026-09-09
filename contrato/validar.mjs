// Valida los ejemplos contra informe.schema.json
// Uso:  node validar.mjs [archivo.json ...]   (por defecto: ejemplo-ansiedad.json)

import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(__dirname, "informe.schema.json"), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const files = process.argv.slice(2);
if (files.length === 0) files.push(join(__dirname, "ejemplo-ansiedad.json"));

let ok = true;
for (const f of files) {
  const data = JSON.parse(readFileSync(f, "utf8"));
  const valid = validate(data);
  console.log(`${valid ? "OK  " : "FALLA"}  ${basename(f)}`);
  if (!valid) {
    ok = false;
    for (const e of validate.errors) console.log(`   ${e.instancePath || "/"}  ${e.message}`);
  }
}
process.exit(ok ? 0 : 1);
