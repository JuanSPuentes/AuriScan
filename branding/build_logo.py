# Extrae los assets del logo desde branding/logo-fuente.pdf y los deja en app/public/
#   pip install pymupdf pillow   &&   python branding/build_logo.py
import re, io, os
import pymupdf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "logo-fuente.pdf")
PUB = os.path.join(HERE, "..", "app", "public")

src = pymupdf.open(SRC)
EMB  = pymupdf.Rect(206.5, 31.1, 399.2, 241.5)   # solo emblema (aguja + círculo + S + ondas)
LOCK = pymupdf.Rect(85,    31.1, 522.0, 321.0)   # emblema + "DRA. JAKELINE CARO" / subtítulo

def svg_crop(clip):
    nd = pymupdf.open()
    pg = nd.new_page(width=clip.width, height=clip.height)
    pg.show_pdf_page(pg.rect, src, 0, clip=clip)
    return pg.get_svg_image()

def strip_orphan_fonts(svg):
    # el recorte del emblema no tiene texto: fuera los glyph paths huérfanos
    used = set(re.findall(r'xlink:href="#(font_\w+)"', svg))
    def drop(m):
        return "" if m.group(1) not in used else m.group(0)
    svg = re.sub(r'<path id="(font_\w+)"[^>]*/>', drop, svg)
    return svg

def png_crop(clip, target_w, out, bg=None, pad_frac=0.0):
    z = target_w / clip.width
    pix = src[0].get_pixmap(matrix=pymupdf.Matrix(z, z), clip=clip, alpha=True)
    im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
    if pad_frac or bg:
        w, h = im.size
        side = int(round(max(w, h) * (1 + 2 * pad_frac)))
        canvas = Image.new("RGBA", (side, side), bg or (0, 0, 0, 0))
        canvas.alpha_composite(im, ((side - w) // 2, (side - h) // 2))
        im = canvas
    # el arte es plano (4-5 colores + antialias): cuantizar a paleta recorta mucho el peso
    im = im.quantize(colors=192, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(out, optimize=True)
    print(f"  {out}  {im.size[0]}x{im.size[1]}  {os.path.getsize(out)//1024} KB")

# --- SVG ---
open(f"{PUB}/logo.svg", "w", encoding="utf-8", newline="\n").write(svg_crop(LOCK))
open(f"{PUB}/logo-emblema.svg", "w", encoding="utf-8", newline="\n").write(strip_orphan_fonts(svg_crop(EMB)))
open(f"{PUB}/favicon.svg", "w", encoding="utf-8", newline="\n").write(strip_orphan_fonts(svg_crop(EMB)))
print("SVG:", "logo.svg", len(open(f'{PUB}/logo.svg').read()),
      "| emblema/favicon", len(open(f'{PUB}/favicon.svg').read()))

# --- PNG con transparencia (web + PDF) ---
print("PNG transparentes:")
png_crop(LOCK, 1600, f"{PUB}/logo.png")             # fallback del lockup si el SVG no carga
png_crop(EMB, 512, f"{PUB}/logo-emblema.png")       # cabecera web + se embebe como data URI en el PDF

# --- iconos PWA: emblema centrado sobre fondo claro, con margen (safe zone maskable) ---
print("Iconos PWA:")
WHITE = (255, 255, 255, 255)
png_crop(EMB, 380, f"{PUB}/icon-192.png", bg=WHITE, pad_frac=0.16)
png_crop(EMB, 760, f"{PUB}/icon-512.png", bg=WHITE, pad_frac=0.16)
png_crop(EMB, 300, f"{PUB}/apple-touch-icon.png", bg=WHITE, pad_frac=0.12)

# normaliza iconos a tamaño exacto
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    p = f"{PUB}/{name}"
    Image.open(p).resize((size, size), Image.LANCZOS).save(p)
    print(f"  {name} -> {size}x{size}")
