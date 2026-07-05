/**
 * Carregador dos sprites das ferramentas (arte PNG preto/branco, fundo
 * transparente, ponta à esquerda).
 *
 * Para o utilizador saber QUE COR cada ferramenta carrega, o CORPO (os pixels
 * brancos) é pintado com a cor escolhida. Usamos "colorize" — multiplicamos a
 * cor pela luminosidade original — para preservar a forma e o sombreado da arte
 * em vez de a achatar. O contorno preto mantém-se (branco no tema escuro) para
 * a silhueta continuar a ler-se. A borracha não é tingida.
 */

const imageCache = new Map();
const tintedCache = new Map();

function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

function parseHex(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function getTintedToolUrl(tool, color, theme = 'light') {
  const key = `${tool.key}:${color}:${theme}`;
  if (tintedCache.has(key)) return tintedCache.get(key);

  const img = await loadImage(tool.img);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);

  const [cr, cg, cb] = parseHex(color);
  const dark = theme === 'dark';
  const isEraser = tool.key === 'eraser' || tool.tool === 'eraser';
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;

  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 10) continue;
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const mn = Math.min(r, g, b);
    const mx = Math.max(r, g, b);
    const isWhite = mn > 205 && (mx - mn) < 24;   // SÓ o branco puro
    const isBlack = mx < 64;                       // contorno

    if (isEraser) {                                // borracha não recebe cor
      if (dark && isWhite) { px[i] = px[i + 1] = px[i + 2] = 0; }
      else if (dark && isBlack) { px[i] = px[i + 1] = px[i + 2] = 255; }
      continue;
    }

    if (isWhite) {
      px[i] = cr; px[i + 1] = cg; px[i + 2] = cb;  // branco → cor escolhida (chapado)
    } else if (isBlack) {
      if (dark) { px[i] = px[i + 1] = px[i + 2] = 255; } // contorno → branco no escuro
    } else if (dark) {
      // material colorido (madeira, virola, dourado): clareia p/ ser visível no preto
      px[i] = Math.round(r + (255 - r) * 0.45);
      px[i + 1] = Math.round(g + (255 - g) * 0.45);
      px[i + 2] = Math.round(b + (255 - b) * 0.45);
    }
    // no tema claro os materiais coloridos ficam intactos
  }
  ctx.putImageData(data, 0, 0);

  const url = canvas.toDataURL('image/png');
  tintedCache.set(key, url);
  return url;
}

export function clearTintCache() {
  tintedCache.clear();
}
