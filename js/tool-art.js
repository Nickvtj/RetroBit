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

function parseColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(r, g, b) {
  return (r + g + b) / 3;
}

function isOutline(lum, theme) {
  return theme === 'dark' ? lum > 195 : lum < 48;
}

function isFill(lum, theme) {
  return theme === 'dark' ? lum < 105 : lum > 188;
}

function shouldPaint(r, g, b, a, kind, theme) {
  if (a < 8) return false;
  const lum = luminance(r, g, b);
  if (kind === 'any') {
    if (theme === 'dark') return lum < 155 || lum > 165;
    return lum < 115 || lum > 165;
  }
  if (kind === 'lead') {
    return theme === 'dark' ? lum > 215 : lum < 42;
  }
  if (kind === 'ink') {
    return theme === 'dark' ? lum > 175 : lum < 90;
  }
  // kind 'light' — só o miolo (preenchimento), preservando as linhas/contorno.
  // No tema escuro o preenchimento branco vira preto após a inversão (lum baixo),
  // e as linhas viram brancas (lum alto) — por isso não pintamos lum alto aqui.
  if (theme === 'dark') return lum < 110;
  return lum > 185;
}

function paintRegion(ctx, region, color, w, h, theme) {
  const [r, g, b] = parseColor(color);
  const rx = Math.floor(region.x * w);
  const ry = Math.floor(region.y * h);
  const rw = Math.max(1, Math.ceil(region.w * w));
  const rh = Math.max(1, Math.ceil(region.h * h));
  const data = ctx.getImageData(rx, ry, rw, rh);

  for (let i = 0; i < data.data.length; i += 4) {
    const pr = data.data[i];
    const pg = data.data[i + 1];
    const pb = data.data[i + 2];
    const pa = data.data[i + 3];
    if (shouldPaint(pr, pg, pb, pa, region.kind, theme)) {
      data.data[i] = r;
      data.data[i + 1] = g;
      data.data[i + 2] = b;
      data.data[i + 3] = 255;
    }
  }

  ctx.putImageData(data, rx, ry);
}

/** Degradê suave na madeira afiada — cor mais forte na ponta, some em direção ao corpo. */
function paintWashRegion(ctx, region, color, w, h, theme) {
  const [cr, cg, cb] = parseColor(color);
  const strength = region.strength ?? 0.38;
  const rx = Math.floor(region.x * w);
  const ry = Math.floor(region.y * h);
  const rw = Math.max(1, Math.ceil(region.w * w));
  const rh = Math.max(1, Math.ceil(region.h * h));
  const data = ctx.getImageData(rx, ry, rw, rh);

  for (let ly = 0; ly < rh; ly++) {
    for (let lx = 0; lx < rw; lx++) {
      const i = (ly * rw + lx) * 4;
      const pr = data.data[i];
      const pg = data.data[i + 1];
      const pb = data.data[i + 2];
      const pa = data.data[i + 3];
      if (pa < 8) continue;

      const lum = luminance(pr, pg, pb);
      if (!isFill(lum, theme) || isOutline(lum, theme)) continue;

      const nx = lx / rw;
      const ny = ly / rh;
      const dist = Math.hypot(nx * 1.15, (ny - 0.5) * 0.55);
      const fade = Math.pow(Math.max(0, 1 - dist), 1.7) * strength;
      if (fade < 0.015) continue;

      data.data[i] = Math.round(pr * (1 - fade) + cr * fade);
      data.data[i + 1] = Math.round(pg * (1 - fade) + cg * fade);
      data.data[i + 2] = Math.round(pb * (1 - fade) + cb * fade);
    }
  }

  ctx.putImageData(data, rx, ry);
}

function invertImage(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < data.data.length; i += 4) {
    if (data.data[i + 3] === 0) continue;
    data.data[i] = 255 - data.data[i];
    data.data[i + 1] = 255 - data.data[i + 1];
    data.data[i + 2] = 255 - data.data[i + 2];
  }
  ctx.putImageData(data, 0, 0);
}

function applyTips(ctx, tool, color, w, h, theme) {
  for (const region of tool.tips) {
    if (region.kind === 'wash') {
      paintWashRegion(ctx, region, color, w, h, theme);
    } else {
      paintRegion(ctx, region, color, w, h, theme);
    }
  }
}

/** Pinta pontas/grafite com a cor escolhida. */
export async function getTintedToolUrl(tool, color, theme = 'light') {
  if (!tool.tips?.length || tool.tool === 'eraser') return tool.img;

  const key = `${tool.key}:${color}:${theme}`;
  if (tintedCache.has(key)) return tintedCache.get(key);

  const img = await loadImage(tool.img);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  if (theme === 'dark') {
    invertImage(ctx, canvas.width, canvas.height);
    applyTips(ctx, tool, color, canvas.width, canvas.height, 'dark');
  } else {
    applyTips(ctx, tool, color, canvas.width, canvas.height, 'light');
  }

  const url = canvas.toDataURL('image/png');
  tintedCache.set(key, url);
  return url;
}

export function clearTintCache() {
  tintedCache.clear();
}
