export const TOOLS = [
  { id: 'pencil', label: 'lápis', icon: 'pencil' },
  { id: 'brush', label: 'pincel', icon: 'brush' },
  { id: 'airbrush', label: 'spray', icon: 'spray' },
  { id: 'fill', label: 'balde', icon: 'fill' },
  { id: 'line', label: 'linha', icon: 'line' },
  { id: 'rect', label: 'retângulo', icon: 'rect' },
  { id: 'ellipse', label: 'círculo', icon: 'circle' },
  { id: 'eraser', label: 'borracha', icon: 'eraser' },
  { id: 'zoom', label: 'lupa', icon: 'zoom' },
  { id: 'picker', label: 'conta-gotas', icon: 'picker' },
];

/** Ícones de linha ultra-minimalistas */
export const TOOL_SVGS = {
  pencil: '<path d="M2.5 12.5L5.5 3.5l7-1.5-1.5 7-6.5 3.5z"/><line x1="5.5" y1="10" x2="7.5" y2="12"/>',
  brush: '<circle cx="8" cy="6.5" r="2.5"/><line x1="8" y1="9" x2="8" y2="13"/>',
  spray: '<circle cx="4" cy="5" r="0.7"/><circle cx="8" cy="4" r="0.7"/><circle cx="11" cy="7" r="0.7"/><circle cx="6" cy="9" r="0.7"/><circle cx="10" cy="11" r="0.7"/>',
  fill: '<rect x="3" y="3" width="10" height="10"/><path d="M5.5 10l2-3.5 1.5 2.5 2-3"/>',
  line: '<line x1="3" y1="13" x2="13" y2="3"/>',
  rect: '<rect x="3.5" y="4.5" width="9" height="8"/>',
  circle: '<ellipse cx="8" cy="8.5" rx="4.5" ry="4"/>',
  eraser: '<path d="M2.5 9.5l5-5 5.5 5.5-5 5z"/><line x1="7.5" y1="10" x2="13.5" y2="10"/>',
  zoom: '<circle cx="7" cy="7" r="3.5"/><line x1="9.5" y1="9.5" x2="13" y2="13"/>',
  picker: '<path d="M2 13l3.5-8.5 3.5 1 1 3.5z"/><circle cx="11.5" cy="4.5" r="1.2"/>',
};

export const DRAW_PALETTE = [
  '#000000', '#ffffff', '#888888', '#00ff66', '#00c8ff', '#ff003c',
  '#0080ff', '#ffff00', '#ff00ff', '#666666', '#ffb000', '#00aa44',
];

export const THEMES = {
  dark: {
    canvasBg: '#000000',
    defaultColor: '#ffffff',
    eraserColor: '#000000',
    gridColor: '#1a1a1a',
    gridColorZoom: '#1a1a1a',
    selectionStroke: '#f2f2f2',
    exportStamp: 'rgba(0, 255, 102, 0.55)',
  },
  light: {
    canvasBg: '#ffffff',
    defaultColor: '#000000',
    eraserColor: '#ffffff',
    gridColor: '#e0e0e0',
    gridColorZoom: '#e0e0e0',
    selectionStroke: '#0a0a0a',
    exportStamp: 'rgba(0, 170, 68, 0.55)',
  },
};

export const state = {
  theme: 'dark',
  tool: 'pencil',
  fgColor: '#ffffff',
  bgColor: '#000000',
  brushTip: 'round',
  brushSize: 3,
  shapeMode: 'outline',
  zoomLevel: 8,
  displayZoom: 1,
  showGrid: true,
  canvasWidth: 800,
  canvasHeight: 600,
  isDrawing: false,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  selection: null,
  clipboard: null,
  curvePhase: 0,
  curvePoints: [],
  polygonPoints: [],
  antsOffset: 0,
};

export function getThemeColors() {
  return THEMES[state.theme];
}

export function resetInteraction() {
  state.isDrawing = false;
  state.curvePhase = 0;
  state.curvePoints = [];
  state.polygonPoints = [];
}
