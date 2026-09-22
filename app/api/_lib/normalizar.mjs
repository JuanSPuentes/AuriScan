// Corrige valores de color que el modelo redacta con sus propias palabras al pasar del
// paso de visión (texto libre) al informe final (enum estricto del schema) -- p. ej. escribe
// "rojo intenso" en vez de "rojo_brillante". Antes de esto, ese desajuste tumbaba la
// validación del schema (2 intentos, ~70s, sin informe) por un campo puramente descriptivo,
// no por un error de contenido clínico.

const sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function construirBuscador(alias) {
  const tabla = new Map();
  for (const [canon, variantes] of Object.entries(alias)) {
    tabla.set(sinAcentos(canon), canon);
    for (const v of variantes) tabla.set(sinAcentos(v), canon);
  }
  // Más largas primero: si el texto trae varias claves como subcadena (p. ej. "rojo oscuro"
  // contiene también "rojo"), que gane la más específica, no la que se registró primero.
  const porLongitud = [...tabla.entries()].sort((a, b) => b[0].length - a[0].length);
  return (valor, porDefecto) => {
    if (valor == null) return porDefecto;
    const limpio = sinAcentos(valor);
    if (tabla.has(limpio)) return tabla.get(limpio);
    // coincidencia parcial (p. ej. "rojo oscuro/vinoso" o "rojo oscuro en la zona X")
    for (const [clave, canon] of porLongitud) if (limpio.includes(clave)) return canon;
    return porDefecto;
  };
}

const COLOR_SIGNO = construirBuscador({
  rojo_brillante: ["rojo brillante", "rojo vivo", "rojo intenso", "rojo claro", "rojizo", "eritema", "rojo"],
  rojo_oscuro: ["rojo oscuro", "vinoso", "rojo vinoso", "granate", "bordo", "rojizo oscuro"],
  purpura: ["purpura", "morado", "violaceo"],
  blanco: ["blanco", "blanquecino", "blanquecina"],
  palido: ["palido", "palida", "palidez"],
  gris_marron: ["gris marron", "gris-marron", "marron", "gris oscuro", "pardo", "gris"],
  normal: ["normal", "rosado normal", "rosado", "sin cambios", "sin alteracion", "ninguno"],
});

const COLOR_GENERAL = construirBuscador({
  rosado_normal: ["rosado normal", "rosado", "normal", "coloracion normal", "sin alteracion"],
  rojo_difuso: ["rojo difuso", "eritema difuso", "enrojecimiento generalizado", "rojo generalizado"],
  rojo_focal: ["rojo focal", "eritema focal", "rojo localizado", "rojo puntual"],
  palido: ["palido", "palida", "palidez", "palidez generalizada"],
  mixto: ["mixto", "variable", "irregular"],
  no_determinado: ["no determinado", "indeterminado", "no_determinado"],
});

export function normalizarInforme(informe) {
  const ov = informe?.observacion_visual;
  if (!ov) return informe;
  if (ov.caracteristicas_generales?.color_general) {
    ov.caracteristicas_generales.color_general =
      COLOR_GENERAL(ov.caracteristicas_generales.color_general, "no_determinado");
  }
  for (const s of ov.signos || []) {
    if (s.color) s.color = COLOR_SIGNO(s.color, "normal");
  }
  return informe;
}
