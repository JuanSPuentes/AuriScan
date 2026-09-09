# Marca — Dra. Jakeline Caro

`logo-fuente.pdf` es el archivo original de la doctora (vectorial, fondo transparente).
Trae 3 variantes de sticker; la app usa la **variante superior** (lockup vertical:
emblema + "DRA. JAKELINE CARO" / "MEDICINA INTEGRATIVA Y SALUD DIGITAL").

## Colores

| | Hex |
|---|---|
| Navy (texto, círculo, "S") | `#093453` |
| Teal (ondas EKG) | `#2E9A9A` aprox. |
| Cobre (aguja) | `#C0895F` aprox. |

## Regenerar los assets

`build_logo.py` recorta el PDF y deja en `app/public/`:

| Archivo | Qué es | Dónde se usa |
|---|---|---|
| `logo.svg` / `logo.png` | lockup completo (emblema + nombre) | cabecera web (`index.html`), fallback |
| `logo-emblema.svg` / `logo-emblema.png` | solo el emblema | cabecera del PDF (`report.mjs`), se embebe como data URI |
| `favicon.svg` | emblema | pestaña del navegador |
| `icon-192.png` / `icon-512.png` | emblema sobre blanco con margen | iconos PWA (manifest) |
| `apple-touch-icon.png` | íd. 180×180 | iOS |

Requiere Python con `pymupdf` y `Pillow`:

```
pip install pymupdf pillow
python branding/build_logo.py
```
