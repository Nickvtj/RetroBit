"""Gera as imagens do README (docs/images/) desenhando no RetroBit de verdade.

Sobe um servidor local, abre o app no Chrome (Playwright), desenha uma cena
com as ferramentas, uma mandala com espelho e uma pixel art, e tira as
capturas. Assim as imagens acompanham a interface sempre que ela mudar.

Uso (precisa do Playwright e do Pillow; usa o Chrome instalado):
    pip install playwright pillow
    python scripts/readme-images.py

Não mexe em docs/images/logo.gif (o logotipo é feito à parte).
"""
import functools
import http.server
import io
import os
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'docs', 'images')
os.makedirs(OUT, exist_ok=True)


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


def serve():
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(NoCache, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{httpd.server_address[1]}/'


SETUP = "localStorage.setItem('retrobit-tour-done','1');localStorage.setItem('retrobit-lang','pt')"


class Painter:
    """Desenha com o rato em coordenadas da tela (720×540), como uma pessoa faria."""

    def __init__(self, page):
        self.pg = page

    @property
    def box(self):
        return self.pg.locator('#main-canvas').bounding_box()

    def at(self, x, y):
        b = self.box
        return b['x'] + x * b['width'] / 720, b['y'] + y * b['height'] / 540

    def stroke(self, pts, steps=6):
        m = self.pg.mouse
        m.move(*self.at(*pts[0]))
        m.down()
        for q in pts[1:]:
            m.move(*self.at(*q), steps=steps)
        m.up()
        self.pg.wait_for_timeout(40)

    def click(self, x, y, wait=650):
        self.pg.mouse.click(*self.at(x, y))
        self.pg.wait_for_timeout(wait)

    def tool(self, key, color=None, size=None):
        """Escolhe a ferramenta e (opcional) a cor e o tamanho, pelo menu rápido."""
        pg = self.pg
        sel = f'.wp-tool[data-key="{key}"]'
        pg.click(sel)  # escolhe (ou, se já estava ativa, abre o menu)
        if color is None and size is None:
            pg.keyboard.press('Escape')
            return
        if pg.is_hidden('#quick-menu'):
            pg.click(sel)
        if size is not None:
            pg.click(f'#quick-sizes [data-size="{size}"]')
        if color is not None:
            if pg.is_hidden('#quick-panel'):
                pg.click('#quick-more')
            pg.fill('#quick-hex', color)
            pg.press('#quick-hex', 'Enter')
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(120)

    def shape(self, key, color, size=1):
        pg = self.pg
        pg.click(f'#btn-shape-{key}')
        if pg.is_hidden('#quick-menu'):
            pg.click(f'#btn-shape-{key}')
        pg.click(f'#quick-sizes [data-size="{size}"]')
        if pg.is_hidden('#quick-panel'):
            pg.click('#quick-more')
        pg.fill('#quick-hex', color)
        pg.press('#quick-hex', 'Enter')
        pg.keyboard.press('Escape')


def png(page, name, target=None, **kw):
    path = os.path.join(OUT, name)
    (page.locator(target) if target else page).screenshot(path=path, **kw)
    print('ok', name)


def gif(page, name, target=None, width=None, frames=3, clip=None):
    """Quadros distintos do tremor (o ciclo tem 3) → GIF em loop."""
    shots, seen = [], set()
    for _ in range(30):
        if target:
            data = page.locator(target).screenshot()
        else:
            data = page.screenshot(clip=clip) if clip else page.screenshot()
        if data not in seen:
            seen.add(data)
            shots.append(Image.open(io.BytesIO(data)).convert('RGB'))
        if len(shots) == frames:
            break
        page.wait_for_timeout(40)
    if width:
        shots = [im.resize((width, round(im.height * width / im.width)), Image.LANCZOS) for im in shots]
    pal = [im.quantize(colors=255, method=Image.MEDIANCUT, dither=Image.NONE) for im in shots]
    pal[0].save(os.path.join(OUT, name), save_all=True, append_images=pal[1:], duration=85, loop=0, optimize=True)
    print('ok', name, f'({len(shots)} quadros)')


def new_project(pg):
    pg.click('[data-new]')
    pg.wait_for_timeout(900)


def save_and_back(pg, name):
    pg.click('#btn-save')
    pg.wait_for_timeout(400)
    pg.click('#btn-back')
    pg.wait_for_timeout(900)
    tile = pg.locator('[data-open]').first
    tile.locator('[data-menu]').click()
    pg.click('#proj-rename')
    pg.fill('#rename-input', name)
    pg.click('#rename-confirm')
    pg.wait_for_timeout(200)


def paint_scene(pg, d):
    """Paisagem: céu, sol, chão, casa, árvore e uma borboleta (com espelho)."""
    pg.click('#btn-background')
    pg.click('#bg-grid [data-hex="#a7d8f1"]')
    pg.keyboard.press('Escape')
    # Sol
    d.shape('ellipse', '#000000', 2)
    d.stroke([(560, 50), (660, 150)])
    d.tool('bucket', '#ffd23f')
    d.click(610, 100)
    d.tool('pen', '#000000', 2)
    for a, b in (((610, 30), (610, 12)), ((672, 100), (692, 100)), ((654, 56), (668, 42)), ((566, 56), (552, 42)), ((540, 100), (526, 100))):
        d.stroke([a, b])
    # Chão (camada própria)
    pg.click('#layers-add')
    d.tool('pencil', '#14532d', 2)
    d.stroke([(0, 400), (120, 380), (260, 395), (420, 372), (560, 390), (720, 378)], steps=10)
    d.tool('bucket', '#4ade80')
    d.click(360, 500)
    d.tool('spray', '#16a34a', 3)
    d.stroke([(40, 460), (200, 470), (360, 455), (520, 475), (690, 460)], steps=14)
    # Casa
    pg.click('#layers-add')
    d.shape('rect', '#000000', 2)
    d.stroke([(110, 260), (290, 392)])
    d.shape('line', '#000000', 2)
    d.stroke([(96, 262), (200, 180)])
    d.stroke([(200, 180), (304, 262)])
    d.stroke([(96, 262), (304, 262)])
    d.shape('rect', '#000000', 2)
    d.stroke([(178, 320), (222, 392)])
    d.tool('bucket', '#f97316')
    d.click(140, 300)
    d.tool('bucket', '#db2424')
    d.click(200, 230)
    d.tool('bucket', '#7c3aed')
    d.click(200, 360)
    # Árvore
    d.tool('brush', '#6b3f1d', 4)
    d.stroke([(470, 392), (472, 330), (468, 280)], steps=10)
    d.tool('spray', '#15803d', 5)
    for y in (230, 255, 280):
        d.stroke([(420, y), (520, y + 10), (430, y + 20)], steps=12)
    # Borboleta (espelho horizontal: as asas saem iguais dos dois lados)
    pg.click('#layers-add')
    pg.click('#btn-mirror-h')
    d.tool('pen', '#000000', 2)
    # As asas começam e acabam em cima do corpo (x=360), para o balde não vazar.
    d.stroke([(360, 120), (320, 78), (290, 90), (300, 130), (360, 132), (318, 160), (322, 186), (360, 146)], steps=8)
    pg.click('#btn-mirror-h')
    d.stroke([(360, 112), (360, 176)])
    pg.click('#btn-mirror-h')
    d.tool('bucket', '#e400e4')
    d.click(318, 110)
    d.click(330, 165)
    pg.click('#btn-mirror-h')
    # Nomes das camadas
    for i, name in enumerate(('Borboleta', 'Casa', 'Chão', 'Céu')):
        pg.locator('.layer-row__menu').nth(i).click()
        pg.click('#layer-menu-rename')
        pg.fill('#layer-rename-input', name)
        pg.click('#layer-rename-confirm')


def main():
    url = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, locale='pt-BR', device_scale_factor=1)
        ctx.add_init_script(SETUP)
        pg = ctx.new_page()
        pg.goto(url)
        pg.wait_for_timeout(800)
        png(pg, 'splash.png')
        # social.png: cartão de partilha 1200×630 a partir da splash
        im = Image.open(os.path.join(OUT, 'splash.png'))
        w, h = im.size
        crop = im.crop((0, (h - round(w * 630 / 1200)) // 2, w, (h + round(w * 630 / 1200)) // 2)).resize((1200, 630), Image.LANCZOS)
        crop.save(os.path.join(OUT, 'social.png'))
        print('ok social.png')

        pg.click('#btn-start')
        pg.wait_for_timeout(900)

        # Pixel art com a grade
        new_project(pg)
        d = Painter(pg)
        pg.click('#btn-grid')
        pg.click('#btn-grid')  # 16 px
        d.tool('pen', '#000000', 1)
        # Contorno do coração arrastando a caneta pelas células, interior com o balde e um brilho.
        cell = lambda c, r: (200 + c * 16 + 8, 120 + r * 16 + 8)
        outline = [(5, 2), (4, 1), (3, 0), (2, 0), (1, 1), (0, 2), (0, 4), (5, 9), (10, 4), (10, 2), (9, 1), (8, 0), (7, 0), (6, 1), (5, 2)]
        d.stroke([cell(c, r) for c, r in outline], steps=10)
        d.tool('bucket', '#ff3b30')
        d.click(*cell(5, 5))
        d.tool('pen', '#ffffff', 1)
        d.click(*cell(2, 2), wait=60)
        d.click(*cell(3, 2), wait=60)
        d.click(*cell(2, 3), wait=60)
        pg.mouse.move(10, 10)
        canvas = pg.locator('#canvas-frame').bounding_box()
        gif(pg, 'grid.gif', clip={'x': canvas['x'] + 150 * canvas['width'] / 720, 'y': canvas['y'] + 80 * canvas['height'] / 540,
                                    'width': 280 * canvas['width'] / 720, 'height': 230 * canvas['height'] / 540}, width=420)
        save_and_back(pg, 'Pixel')

        # Mandala com os dois espelhos
        new_project(pg)
        d = Painter(pg)
        pg.click('#btn-mirror-h')
        pg.click('#btn-mirror-v')
        d.tool('pen', '#7c3aed', 2)
        d.stroke([(360, 270), (300, 200), (330, 150), (360, 190)], steps=8)
        d.tool('marker', '#0bd3d3', 2)
        d.stroke([(250, 270), (290, 230), (320, 270), (290, 310), (250, 270)], steps=8)
        d.tool('brush', '#e400e4', 2)
        d.stroke([(200, 150), (250, 180), (230, 230)], steps=8)
        d.tool('fineliner', '#f97316', 2)
        d.stroke([(360, 60), (330, 100), (360, 130)], steps=8)
        d.tool('spray', '#ffd23f', 2)
        d.stroke([(150, 270), (180, 260), (190, 290)], steps=8)
        pg.mouse.move(10, 10)
        gif(pg, 'mirror.gif', target='#canvas-frame', width=520)
        save_and_back(pg, 'Mandala')

        # Paisagem
        new_project(pg)
        d = Painter(pg)
        paint_scene(pg, d)
        pg.mouse.move(10, 10)
        gif(pg, 'drawing.gif', target='#canvas-frame', width=640)
        gif(pg, 'editor.gif', width=1000)
        png(pg, 'editor.png')
        png(pg, 'tools.png', target='.tool-rail')
        png(pg, 'layers.png', target='#layers-panel')
        # Menu rápido
        pg.click('.wp-tool[data-key="brush"]')
        pg.click('.wp-tool[data-key="brush"]')
        pg.click('#quick-more')
        pg.wait_for_timeout(300)
        png(pg, 'quick-menu.png', target='#quick-menu')
        pg.keyboard.press('Escape')
        # Luva a segurar a casa
        pg.locator('.layer-row').nth(1).click()
        pg.click('#btn-select')
        d.stroke([(80, 170), (320, 400)])
        pg.mouse.move(*d.at(200, 300))
        pg.wait_for_timeout(300)
        b = pg.locator('#canvas-frame').bounding_box()
        png(pg, 'glove.png', clip={'x': b['x'] + 40, 'y': b['y'] + 120, 'width': 420, 'height': 400})
        pg.click('.wp-tool[data-key="pen"]')
        # Recorte
        pg.click('#btn-crop')
        pg.click('[data-crop]')
        pg.mouse.move(*d.at(80, 60))
        pg.mouse.down()
        pg.mouse.move(*d.at(520, 410), steps=8)
        png(pg, 'crop.png', target='#canvas-frame')
        pg.mouse.up()
        pg.keyboard.press('Control+z')
        pg.wait_for_timeout(200)
        # Exportar
        pg.click('#btn-export-gif')
        pg.wait_for_timeout(300)
        png(pg, 'export-modal.png', target='#export-modal .win')
        pg.keyboard.press('Escape')
        save_and_back(pg, 'Paisagem')
        pg.wait_for_timeout(500)
        png(pg, 'gallery.png', clip={'x': 0, 'y': 0, 'width': 1440, 'height': 420})

        # Balde: o momento em que a tinta se espalha
        pg.locator('[data-open]').first.click()
        pg.wait_for_timeout(1000)
        d = Painter(pg)
        pg.locator('.layer-row').nth(2).click()  # Chão
        d.tool('bucket', '#fde047')
        b = pg.locator('#canvas-frame').bounding_box()
        pg.mouse.click(*d.at(600, 470))
        frames = []
        for _ in range(7):
            frames.append(Image.open(io.BytesIO(pg.screenshot(clip=b))).convert('RGB'))
            pg.wait_for_timeout(45)
        frames = [f.resize((480, round(f.height * 480 / f.width)), Image.LANCZOS).quantize(colors=255, method=Image.MEDIANCUT, dither=Image.NONE) for f in frames]
        frames[0].save(os.path.join(OUT, 'bucket.gif'), save_all=True, append_images=frames[1:], duration=[90] * 6 + [900], loop=0, optimize=True)
        print('ok bucket.gif')

        # Celular em pé
        phone = browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR', has_touch=True, is_mobile=True, device_scale_factor=2)
        phone.add_init_script(SETUP)
        ph = phone.new_page()
        ph.goto(url)
        ph.wait_for_timeout(600)
        ph.tap('#btn-start')
        ph.wait_for_timeout(900)
        ph.tap('[data-new]')
        ph.wait_for_timeout(900)
        dp = Painter(ph)
        dp.tool('brush', '#e400e4', 3)
        dp.stroke([(120, 200), (240, 140), (360, 260), (480, 140), (600, 200)], steps=8)
        dp.tool('spray', '#0bd3d3', 3)
        dp.stroke([(150, 380), (360, 330), (570, 380)], steps=10)
        ph.tap('.wp-tool[data-key="spray"]')
        ph.wait_for_timeout(300)
        png(ph, 'mobile.png')
        browser.close()


if __name__ == '__main__':
    main()
