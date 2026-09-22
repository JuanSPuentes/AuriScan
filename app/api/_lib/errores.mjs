// Evita que un error interno (de Postgres, del proveedor de IA, de Chromium, etc.) le
// llegue crudo al navegador -- el detalle completo queda en los logs del servidor; al
// cliente solo un mensaje genérico. Errores ya controlados (validación, "falta X", 401/404)
// siguen construyéndose a mano en cada handler porque esos SÍ son seguros de mostrar.
export function errorInterno(res, e, mensajePublico = "Ocurrió un error interno. Intenta de nuevo en unos minutos.") {
  console.error(e);
  return res.status(500).json({ error: mensajePublico });
}
