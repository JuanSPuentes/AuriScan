// Limitador en memoria, por clave (ip, o ip+ruta). Correcto para esta app porque corre un
// único proceso "backend" (docker-compose no lo replica) -- si alguna vez se escala a más
// de una instancia, esto deja de ser exacto (el límite efectivo pasa a ser max × instancias)
// y hay que moverlo a un store compartido (Redis, etc.).

const ventanas = new Map(); // clave -> { cuenta, expira }

export function limitar(clave, max, ventanaMs) {
  const ahora = Date.now();
  const actual = ventanas.get(clave);
  if (!actual || actual.expira <= ahora) {
    ventanas.set(clave, { cuenta: 1, expira: ahora + ventanaMs });
    return { permitido: true };
  }
  if (actual.cuenta >= max) return { permitido: false, reintentarEnMs: actual.expira - ahora };
  actual.cuenta += 1;
  return { permitido: true };
}

// limpieza periódica para no acumular entradas vencidas indefinidamente en memoria
const limpieza = setInterval(() => {
  const ahora = Date.now();
  for (const [k, v] of ventanas) if (v.expira <= ahora) ventanas.delete(k);
}, 5 * 60 * 1000);
limpieza.unref?.();
