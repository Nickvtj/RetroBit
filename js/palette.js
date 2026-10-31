/** Paleta partilhada (menu rápido das ferramentas e cor do fundo): 48 cores + 12 cinzas. */

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function buildPalette() {
  const hues = [0, 20, 40, 65, 90, 140, 175, 200, 225, 260, 290, 320];
  const lights = [80, 64, 50, 36];
  const s = [];
  for (const l of lights) for (const h of hues) s.push(hslToHex(h, 72, l));
  for (let i = 0; i < hues.length; i++) {
    const v = Math.round((i / (hues.length - 1)) * 255).toString(16).padStart(2, '0');
    s.push(`#${v}${v}${v}`);
  }
  return s;
}

/** Preenche `gridEl` com as amostras da paleta; clicar numa chama `onPick(hex)`. */
export function buildColorGrid(gridEl, onPick) {
  gridEl.innerHTML = buildPalette()
    .map((hex) => `<button type="button" class="color-swatch" data-hex="${hex}" style="background:${hex}" title="${hex}"></button>`)
    .join('');
  gridEl.querySelectorAll('.color-swatch').forEach((sw) => {
    sw.addEventListener('click', () => onPick(sw.dataset.hex));
  });
}

/** Marca a amostra igual a `hex` (se existir) como a cor atual. */
export function markCurrentSwatch(gridEl, hex) {
  gridEl.querySelectorAll('.color-swatch').forEach((sw) => {
    sw.classList.toggle('is-current', sw.dataset.hex === hex);
  });
}

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
