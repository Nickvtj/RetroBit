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

/**
 * Cinza-chave com tolerância: alguns browsers (Brave, Firefox anti-fingerprint)
 * somam um ruído mínimo aos pixels lidos do canvas — comparar valores exatos
 * deixaria pontinhos cinza soltos no corpo da ferramenta.
 */
function nearGray(r, g, b, v, tol = 10) {
  return Math.abs(r - v) <= tol && Math.abs(g - v) <= tol && Math.abs(b - v) <= tol
    && Math.abs(r - g) <= 12 && Math.abs(g - b) <= 12;
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
  const keyed = tool.img.includes('/pixel/'); // só os sprites pixel-art usam cinzas-chave
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

    // Cinzas-chave dos sprites pixel-art: brilho e sombra da cor escolhida.
    if (keyed && nearGray(r, g, b, 232)) {
      px[i] = cr + (255 - cr) * 0.45; px[i + 1] = cg + (255 - cg) * 0.45; px[i + 2] = cb + (255 - cb) * 0.45;
    } else if (keyed && nearGray(r, g, b, 162)) {
      px[i] = cr * 0.68; px[i + 1] = cg * 0.68; px[i + 2] = cb * 0.68;
    } else if (isWhite) {
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
