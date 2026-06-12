const A = 'assets/tools';

export const TOOLS = [
  {
    key: 'pen', tool: 'pen', label: 'caneta', img: `${A}/pen.png`,
    tips: [{ x: 0, y: 0.18, w: 0.1, h: 0.64, kind: 'light' }],
  },
  {
    key: 'fineliner', tool: 'penFine', label: 'caneta fina', img: `${A}/fineliner.png`,
    tips: [
      { x: 0, y: 0.36, w: 0.055, h: 0.28, kind: 'light' },
      { x: 0, y: 0.44, w: 0.028, h: 0.14, kind: 'ink' },
    ],
  },
  {
    key: 'pencil', tool: 'pen', label: 'lápis', img: `${A}/pencil.png`,
    tips: [
      { x: 0, y: 0.3, w: 0.075, h: 0.4, kind: 'lead' },
    ],
  },
  {
    key: 'brush', tool: 'brush', label: 'pincel', img: `${A}/brush.png`,
    tips: [{ x: 0, y: 0.02, w: 0.28, h: 0.96, kind: 'light' }],
  },
  {
    key: 'marker', tool: 'marker', label: 'marcador', img: `${A}/marker.png`,
    tips: [{ x: 0, y: 0.26, w: 0.1, h: 0.52, kind: 'ink' }],
  },
  {
    key: 'spray', tool: 'spray', label: 'spray', img: `${A}/spray.png`,
    tips: [
      { x: 0, y: 0, w: 0.2, h: 1, kind: 'ink' },
      { x: 0.18, y: 0.24, w: 0.11, h: 0.5, kind: 'light' },
    ],
  },
  { key: 'eraser', tool: 'eraser', label: 'borracha', img: `${A}/eraser.png` },
];

export const BRUSH_SIZES = [1, 3, 6, 10, 16];

export const state = {
  theme: 'light',
  tool: 'pen',
  activeKey: 'pen',
  color: '#000000',
  brushSize: 3,
  brushSizeIndex: 1,
  isDrawing: false,
  lastX: 0,
  lastY: 0,
  wiggleSeed: 0,
  canvasWidth: 1024,
  canvasHeight: 768,
  cropRect: null,
  isCropping: false,
  cropStart: null,
};

export function resetDrawing() {
  state.isDrawing = false;
  state.wiggleSeed = 0;
}

export function calcCanvasSize() {
  const railW = 224;
  const menubarH = 30;
  const dockH = 116;
  const pad = 16;
  const maxW = window.innerWidth - railW - pad * 2;
  const maxH = window.innerHeight - menubarH - dockH - pad * 2;
  let w = maxW;
  let h = Math.floor(w * 0.75);
  if (h > maxH) {
    h = maxH;
    w = Math.floor(h / 0.75);
  }
  return {
    w: Math.max(640, Math.floor(w)),
    h: Math.max(480, Math.floor(h)),
  };
}
