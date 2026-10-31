"""Teste rápido de ponta a ponta do RetroBit (rodar antes de publicar).

Sobe um servidor local, abre o app no Chrome sem janela e passa pelo
essencial: desenhar, balde, luva, desfazer, salvar, reabrir, exportar GIF e
PNG, backup .retrobit, inglês e a disposição no celular. Sai com erro se algo falhar.

Uso (precisa do Playwright e do Pillow; usa o Chrome instalado):
    pip install playwright pillow
    python scripts/smoke-test.py
"""
import functools
import http.server
import json
import os
import sys
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ST = "import('./js/state.js').then(({state}) => (%s))"
PIX = """([x, y]) => { const d = document.getElementById('main-canvas').getContext('2d').getImageData(x, y, 1, 1).data;
  return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''); }"""
SETUP = "localStorage.setItem('retrobit-tour-done','1');localStorage.setItem('retrobit-lang','pt')"

failures = []


def check(name, ok, extra=''):
    print(('  ok   ' if ok else '  FALHA ') + name + (f'  ({extra})' if extra != '' else ''))
    if not ok:
        failures.append(name)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


def main():
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{httpd.server_address[1]}/'
    errors = []

    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='pt-BR', accept_downloads=True)
        ctx.add_init_script(SETUP)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        pg.goto(url)
        pg.wait_for_timeout(600)
        pg.click('#btn-start')
        pg.wait_for_timeout(900)
        pg.click('[data-new]')
        pg.wait_for_timeout(900)
        box = pg.locator('#main-canvas').bounding_box()
        k = box['width'] / 720

        def at(x, y):
            return box['x'] + x * k, box['y'] + y * k

        print('desenho')
        pg.click('#btn-shape-rect')
        pg.mouse.move(*at(100, 100)); pg.mouse.down(); pg.mouse.move(*at(300, 250), steps=8); pg.mouse.up()
        check('retângulo desenhado', pg.evaluate(ST % "state.layers[0].paths.length") == 1)
        pg.click('.wp-tool[data-key="bucket"]')
        pg.evaluate(ST % "(state.toolColors.bucket = '#ff0000', state.color = '#ff0000')")
        pg.mouse.click(*at(200, 175)); pg.wait_for_timeout(700)
        check('balde pinta o interior', pg.evaluate(PIX, [200, 175]) == '#ff0000')
        pg.click('#btn-select')
        pg.mouse.move(*at(100, 175)); pg.mouse.down(); pg.mouse.move(*at(140, 215), steps=6); pg.mouse.up()
        # Na borda, a luva pega a forma ou o preenchimento (que passa por baixo da linha).
        where = "(p => p.mask ? p.mask.x + ',' + p.mask.y : Math.round(p.x0) + ',' + Math.round(p.y0))"
        moved = pg.evaluate(ST % f"state.layers[0].paths.map({where}).join(' ')")
        check('luva move o que pegou', moved not in ('100,100 97,97', '100,100 98,98'), moved)
        pg.keyboard.press('Control+z'); pg.wait_for_timeout(100)
        check('desfazer', pg.evaluate(ST % f"state.layers[0].paths.map({where}).join(' ')") != moved)
        pg.click('.wp-tool[data-key="pen"]')

        print('salvar e reabrir')
        pg.click('#btn-save'); pg.wait_for_timeout(400)
        pg.click('#btn-back'); pg.wait_for_timeout(900)
        pg.click('[data-open]'); pg.wait_for_timeout(1000)
        check('projeto reabre com o desenho', pg.evaluate(PIX, [200, 175]) == '#ff0000')

        print('exportar')
        for btn, test in (
            ('#export-gif', lambda f: Image.open(f).n_frames == 3),
            ('#export-png', lambda f: Image.open(f).size == (720, 540)),
            ('#export-png-clear', lambda f: Image.open(f).convert('RGBA').getpixel((600, 500))[3] == 0),
            ('#export-project', lambda f: json.load(open(f, encoding='utf-8'))['format'] == 'retrobit'),
        ):
            pg.click('#btn-export-gif')
            with pg.expect_download() as dl:
                pg.click(btn)
            check(f'exportar {btn[8:]}', test(dl.value.path()))

        print('celular e inglês')
        phone = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, locale='en-US')
        phone.add_init_script("localStorage.setItem('retrobit-tour-done','1')")
        ph = phone.new_page()
        ph.on('pageerror', lambda e: errors.append(str(e)))
        ph.goto(url); ph.wait_for_timeout(500)
        check('inglês pela língua do navegador', ph.inner_text('#btn-start') == "Let's draw!")
        ph.tap('#btn-start'); ph.wait_for_timeout(900); ph.tap('[data-new]'); ph.wait_for_timeout(900)
        tray = ph.locator('.tool-rail').bounding_box()
        check('bandeja de canetas embaixo no celular', tray['y'] > 700 and tray['width'] > 380, tray)
        check('sem rolagem horizontal da página', ph.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        b.close()

    check('nenhum erro no console', not errors, errors[:3])
    httpd.shutdown()
    print('\n' + ('TUDO OK' if not failures else f'{len(failures)} FALHA(S): ' + ', '.join(failures)))
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
