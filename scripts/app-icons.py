"""Gera os ícones do app instalável (PWA / tela inicial) a partir do pixel-art
do favicon (assets/favicon.svg, grade 16x16), ampliado sem suavizar.

Uso (precisa do Pillow: pip install pillow):
    python scripts/app-icons.py            # escreve em assets/icons/

  icon-180.png           → apple-touch-icon (iPhone/iPad)
  icon-192.png, -512.png → ícone normal do Android/desktop
  icon-maskable-512.png  → versão com margem de segurança (o sistema recorta em círculo/squircle)
"""
import os
import re

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "assets", "favicon.svg")
OUT = os.path.join(ROOT, "assets", "icons")
os.makedirs(OUT, exist_ok=True)

GRID = 16
rects = re.findall(r'<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-fA-F]{3,6})"/>',
                   open(SRC, encoding="utf-8").read())


def hex_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def render(size, cells):
    """Desenha a grade 16x16 centrada numa tela de `cells` x `cells` pixels-de-arte."""
    art = Image.new("RGBA", (cells, cells), (255, 255, 255, 255))
    off = (cells - GRID) // 2
    for x, y, w, h, fill in rects:
        for dx in range(int(w)):
            for dy in range(int(h)):
                art.putpixel((off + int(x) + dx, off + int(y) + dy), hex_rgb(fill))
    return art.resize((size, size), Image.NEAREST)


render(180, 18).save(os.path.join(OUT, "icon-180.png"))
render(192, 18).save(os.path.join(OUT, "icon-192.png"))
render(512, 18).save(os.path.join(OUT, "icon-512.png"))
render(512, 24).save(os.path.join(OUT, "icon-maskable-512.png"))  # arte a 2/3 → dentro da zona segura
print("ok", OUT)
