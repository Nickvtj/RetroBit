"""Gera os sprites pixel-art das ferramentas do RetroBit (72x22, ponta à esquerda)
e a dinamite KABOOM! (72x26). O app amplia tudo 3x (image-rendering: pixelated).

Uso (precisa do Pillow: pip install pillow):
    python scripts/pixel-sprites.py            # escreve em assets/tools/

Cores-chave lidas por js/tool-art.js:
  W  branco puro       → cor da ferramenta
  L  (231,232,233)     → cor da ferramenta, clareada (brilho)
  S  (161,162,163)     → cor da ferramenta, escurecida (sombra)
  K  preto             → contorno (gerado automaticamente à volta de tudo)
Qualquer outra cor é "material" e fica como está.
"""
import math
import os
import sys

from PIL import Image

W, H = 72, 22
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "tools")
os.makedirs(OUT, exist_ok=True)

K = (0, 0, 0)
TW = (255, 255, 255)
TL = (231, 232, 233)
TS = (161, 162, 163)
DARK, DARK_L = (38, 38, 46), (92, 92, 106)
GOLD, GOLD_D, GOLD_L = (232, 178, 52), (168, 112, 28), (250, 220, 120)
MET, MET_L, MET_D = (140, 152, 172), (196, 206, 224), (100, 110, 130)
WOOD, WOOD_D = (236, 186, 124), (190, 132, 72)
GRAPH = (22, 22, 26)
PINK, PINK_L, PINK_D = (238, 128, 150), (250, 178, 192), (192, 86, 110)
BLUE, BLUE_L, BLUE_D = (58, 110, 206), (120, 166, 236), (34, 70, 150)
RED, RED_L, RED_D = (178, 52, 48), (222, 96, 84), (118, 28, 30)


class Sprite:
    def __init__(self, w=W, h=H):
        self.w, self.h = w, h
        self.px = {}
        self.glow = set()  # pixels sem contorno (ex.: faísca)

    def put(self, x, y, c, glow=False):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[(x, y)] = c
            if glow:
                self.glow.add((x, y))

    def band(self, x0, x1, y0, y1, color):
        """Preenche [x0..x1]×[y0..y1]; `color` pode ser fn(x, y, y0, y1)."""
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                self.put(x, y, color(x, y, y0, y1) if callable(color) else color)

    def column(self, x, cy, half, color, y0=None, y1=None):
        a, b = (cy - half, cy + half) if y0 is None else (y0, y1)
        for y in range(a, b + 1):
            self.put(x, y, color(x, y, a, b) if callable(color) else color)

    def cut(self, *pts):
        for p in pts:
            self.px.pop(p, None)

    def save(self, name):
        # contorno automático: vizinho (4-dir) de pixel pintado e ainda vazio
        filled = set(self.px)
        for (x, y) in list(filled - self.glow):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if q not in filled and 0 <= q[0] < self.w and 0 <= q[1] < self.h:
                    self.px.setdefault(q, K)
        im = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            im.putpixel((x, y), c + (255,))
        im.save(f"{OUT}/{name}.png")


def body(x, y, y0, y1):
    """Corpo tingido: 1 linha de brilho em cima, 2 de sombra em baixo."""
    if y == y0:
        return TL
    if y >= y1 - 1:
        return TS
    return TW


def metal(x, y, y0, y1):
    return MET_L if y == y0 + 1 else (MET_D if y == y1 else MET)


def dark(x, y, y0, y1):
    return DARK_L if y == y0 + 1 else DARK


# ── caneta (tinteiro) ─────────────────────────────────────────
s = Sprite()
for x in range(2, 13):
    h = (x - 2) * 3 // 10
    s.column(x, 11, h, lambda x, y, a, b: GOLD_D if y > 11 else (GOLD_L if y == a and b - a > 2 else GOLD))
for x in range(6, 13):
    s.put(x, 11, K)                      # fenda do aparo
s.put(9, 11, K); s.put(10, 11, K)
s.band(13, 20, 9, 13, dark)              # empunhadura
s.band(21, 58, 8, 14, body)              # corpo (cor)
s.band(59, 60, 8, 14, lambda x, y, a, b: GOLD_L if y == 9 else GOLD)
s.band(61, 69, 8, 14, dark)              # tampa
s.cut((69, 8), (69, 14))
s.band(42, 60, 6, 6, GOLD)               # clipe
s.put(60, 7, GOLD)
s.save("pen")

# ── caneta fina ───────────────────────────────────────────────
s = Sprite()
s.band(2, 9, 11, 11, MET_L)              # agulha metálica
for x in range(10, 18):
    s.column(x, 11, (x - 10) // 2, dark)
s.band(18, 62, 8, 14, body)
s.band(18, 19, 8, 14, dark)              # anel
s.band(63, 69, 8, 14, dark)
s.cut((69, 8), (69, 14))
s.band(46, 62, 6, 6, DARK)
s.put(62, 7, DARK)
s.save("fineliner")

# ── lápis ─────────────────────────────────────────────────────
s = Sprite()
for x in range(2, 15):
    h = 1 + (x - 2) * 3 // 12
    for y in range(11 - h, 11 + h + 1):
        if x <= 6 and abs(y - 11) <= (x - 1) // 2:
            s.put(x, y, GRAPH)           # grafite
        else:
            s.put(x, y, WOOD_D if y > 11 else WOOD)
for y in range(7, 16):                   # corte ondulado madeira/tinta
    for x in range(15 + (y % 2), 56):
        s.put(x, y, TL if y == 7 else (TS if y in (10, 14, 15) else TW))
s.band(56, 61, 7, 15, metal)             # virola
for y in range(7, 16):
    s.put(58, y, MET_D)
s.band(62, 68, 7, 15, lambda x, y, a, b: PINK_L if y == 8 else (PINK_D if y >= 14 else PINK))
s.cut((68, 7), (68, 15))
s.save("pencil")

# ── pincel ────────────────────────────────────────────────────
s = Sprite()
halves = {2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4, 11: 4, 12: 4, 13: 5, 14: 5, 15: 5, 16: 4, 17: 4, 18: 4, 19: 3, 20: 3}
for x, h in halves.items():
    s.column(x, 11, h, lambda x, y, a, b: TL if (y == a + 1 and b - a > 3) else (TS if y >= b - 1 and b - a > 2 else TW))
s.band(21, 28, 8, 14, metal)             # virola
for y in range(8, 15):
    s.put(23, y, MET_D); s.put(26, y, MET_D)
s.band(29, 50, 9, 13, lambda x, y, a, b: RED_L if y == a else (RED_D if y == b else RED))
s.band(51, 66, 10, 12, lambda x, y, a, b: RED_L if y == a else (RED_D if y == b else RED))
s.band(67, 68, 10, 12, RED_D)
s.cut((68, 10), (68, 12))
s.save("brush")

# ── marcador ──────────────────────────────────────────────────
s = Sprite()
for x in range(2, 9):
    top = max(9, 13 - (x - 2))
    s.column(x, 0, 0, lambda x, y, a, b: TS if y == b else TW, top, 13)
s.band(9, 14, 7, 15, dark)               # colar
s.band(15, 60, 5, 17, lambda x, y, a, b: TL if y in (5, 6) else (TS if y >= 15 else TW))
s.band(15, 16, 5, 17, TS)
s.band(61, 69, 6, 16, dark)              # tampa traseira
s.cut((69, 6), (69, 16))
s.save("marker")

# ── spray ─────────────────────────────────────────────────────
s = Sprite()
s.band(3, 6, 10, 12, dark)               # bico
s.put(3, 11, K)
for x, (a, b) in {7: (9, 13), 8: (8, 14), 9: (7, 15), 10: (7, 15), 11: (7, 15), 12: (7, 15)}.items():
    s.column(x, 0, 0, metal, a, b)
s.band(13, 14, 3, 19, MET_D)             # aro
s.band(15, 62, 3, 19, lambda x, y, a, b: TL if y in (3, 4) else (TS if y >= 16 else TW))
s.band(63, 66, 4, 18, metal)             # fundo
s.cut((66, 4), (66, 18))
skull = [
    "..#####..",
    ".#######.",
    "##..#..##",
    "##..#..##",
    "#########",
    ".###.###.",
    "..#.#.#..",
    "..#####..",
]
for j, row in enumerate(skull):
    for i, c in enumerate(row):
        if c == "#":
            s.put(34 + i, 6 + j, K)
s.save("spray")

# ── borracha (não é tingida) ─────────────────────────────────
s = Sprite()
s.band(8, 58, 10, 17, lambda x, y, a, b: BLUE if x >= 34 else PINK)       # frente
for y in range(5, 10):                                                     # topo em perspetiva
    off = 10 - y
    for x in range(8 + off, 59 + off):
        s.put(x, y, BLUE_L if x - off >= 34 else PINK_L)
for x in range(59, 64):                                                    # lateral
    off = x - 58
    for y in range(10 - off, 18 - off):
        s.put(x, y, BLUE_D)
for x in range(36, 57, 4):                                                 # riscas da cinta
    s.put(x, 14, BLUE_L)
s.save("eraser")
# ── dinamite KABOOM! (botão obliterar, 72×26 → 216×78) ────
FONT = {
    "K": ["#.#", "##.", "#..", "##.", "#.#"],
    "A": [".#.", "#.#", "###", "#.#", "#.#"],
    "B": ["##.", "#.#", "##.", "#.#", "##."],
    "O": [".#.", "#.#", "#.#", "#.#", ".#."],
    "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
    "!": ["#", "#", "#", ".", "#"],
}
DYN, DYN_L, DYN_D, DYN_C = (204, 46, 58), (240, 104, 108), (140, 24, 36), (110, 14, 24)
ROPE, ROPE_D = (196, 168, 110), (128, 100, 60)
s = Sprite(72, 26)
s.band(17, 66, 8, 20, lambda x, y, a, b: DYN_L if y in (9, 10) else (DYN_D if y >= 18 else DYN))
s.band(15, 16, 9, 19, DYN_C)                 # tampa esquerda
s.band(67, 68, 9, 19, DYN_C)                 # tampa direita
s.cut((68, 9), (68, 19))
for x in range(21, 64, 14):                  # dobras do papel
    s.put(x, 8, DYN_D); s.put(x, 20, DYN_C)
word, x = "KABOOM!", 0
glyphs = [FONT[c] for c in word]
total = sum(len(g[0]) for g in glyphs) + len(glyphs) - 1
x = 17 + (50 - total) // 2
for g in glyphs:
    for j, row in enumerate(g):
        for i, c in enumerate(row):
            if c == "#":
                s.put(x + i, 12 + j, K)
    x += len(g[0]) + 1
fuse = [(14, 14), (13, 14), (12, 15), (11, 16), (10, 16), (9, 15), (8, 14), (8, 13), (9, 12),
        (10, 12), (11, 11), (11, 10), (10, 9), (9, 8), (8, 7), (7, 6), (6, 5), (5, 5)]
for k, (fx, fy) in enumerate(fuse):            # rastilho torcido
    s.put(fx, fy, ROPE_D if k % 2 else ROPE)
SPARK = {(3, 4): (255, 240, 150), (2, 4): (255, 196, 40), (4, 4): (255, 196, 40), (3, 3): (255, 196, 40),
         (3, 5): (255, 196, 40), (1, 4): (255, 120, 30), (3, 2): (255, 120, 30), (1, 2): (255, 120, 30),
         (5, 2): (255, 150, 30), (1, 6): (255, 150, 30), (5, 6): (255, 120, 30), (4, 1): (255, 220, 90)}
for (sx, sy), c in SPARK.items():
    s.put(sx, sy, c, glow=True)
s.save("dynamite")
print("ok", OUT)
