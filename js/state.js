const A = 'assets/tools';

/**
 * Lista de ferramentas da barra lateral.
 * `key`   → identificador único (usado no ícone e no botão)
 * `tool`  → motor de desenho a usar (ver TOOL_DEFS)
 * `label` → nome apresentado
 * `img`   → sprite PNG (preto/branco) recolorido em tool-art.js
 */
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
    tips: [{ x: 0, y: 0.3, w: 0.075, h: 0.4, kind: 'lead' }],
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

/** Formas geométricas (barra acima do quadro). */
export const SHAPES = [
  { key: 'rect', tool: 'shapeRect', label: 'retângulo' },
  { key: 'ellipse', tool: 'shapeEllipse', label: 'elipse' },
  { key: 'line', tool: 'shapeLine', label: 'linha' },
];

/**
 * Física / comportamento de cada motor de desenho.
 * widthScale → multiplica o tamanho do traço escolhido
 * amp        → amplitude do tremor por frame (px), o "quão vivo"
 * alpha      → opacidade base
 * composite  → globalCompositeOperation
 * cap        → forma da ponta da linha
 * pressure   → se true, largura/opacidade reagem a e.pressure (PointerEvent)
 */
export const TOOL_DEFS = {
  pen:     { widthScale: 0.8, amp: 1.7, alpha: 1.0,  composite: 'source-over', cap: 'round',  pressure: false, hard: true },
  penFine: { widthScale: 0.4, amp: 1.4, alpha: 1.0,  composite: 'source-over', cap: 'round',  pressure: false, hard: true },
  brush:   { widthScale: 1.4, amp: 2.6, alpha: 0.95, composite: 'source-over', cap: 'round',  pressure: true },
  marker:  { widthScale: 2.6, amp: 2.0, alpha: 0.5,  composite: 'multiply',    cap: 'square', pressure: false, marker: true },
  spray:   { widthScale: 1.0, amp: 1.6, alpha: 0.85, composite: 'source-over', cap: 'round',  pressure: true, spray: true },
  eraser:  { widthScale: 2.8, amp: 0.9, alpha: 1.0,  composite: 'source-over', cap: 'round',  pressure: false, eraser: true },
  shapeRect:    { widthScale: 1, amp: 1.5, alpha: 1.0, composite: 'source-over', cap: 'round', pressure: false, shape: 'rect' },
  shapeEllipse: { widthScale: 1, amp: 1.5, alpha: 1.0, composite: 'source-over', cap: 'round', pressure: false, shape: 'ellipse' },
  shapeLine:    { widthScale: 1, amp: 1.5, alpha: 1.0, composite: 'source-over', cap: 'round', pressure: false, shape: 'line' },
};

export const BRUSH_SIZES = [1, 3, 6, 10, 16, 24];
export const OPACITIES = [0.25, 0.5, 0.75, 1];

/** Resoluções (tamanho da tela de desenho) disponíveis no "Crop". */
export const RESOLUTIONS = [
  { label: 'paisagem', w: 720, h: 540 },
  { label: 'quadrado', w: 620, h: 620 },
  { label: 'retrato', w: 540, h: 720 },
  { label: 'wide', w: 800, h: 450 },
];

export const state = {
  theme: 'light',
  tool: 'pen',
  activeKey: 'pen',
  color: '#000000',       // espelho da cor da ferramenta ativa
  opacity: 1,             // espelho da opacidade da ferramenta ativa
  bgColor: '#ffffff',     // cor de fundo da tela de desenho
  currentProjectId: null, // projeto aberto (null = ainda não guardado)
  toolColors: {},         // cor própria de cada ferramenta (por key)
  toolSizes: {},          // índice de tamanho por ferramenta
  toolOpacity: {},        // opacidade (0..1) por ferramenta
  brushSize: 3,
  brushSizeIndex: 1,

  // ── Camadas (cada uma com os seus traços) ──
  layers: [],
  activeLayerId: null,

  currentPath: null,  // path em curso (null quando não se desenha)

  isDrawing: false,
  lastX: 0,
  lastY: 0,

  canvasWidth: 720,
  canvasHeight: 540,

  cropRect: null,
  isCropping: false,
  cropStart: null,

  mirrorH: false,  // espelho horizontal (eixo vertical no centro)
  mirrorV: false,  // espelho vertical (eixo horizontal no centro)

  activeShapeKey: null,  // forma ativa (null = ferramenta de traço)
  shapeColors: {},
  shapeSizes: {},
  shapeOpacity: {},
  isShapeDrawing: false,
  shapeDraft: null,
};

/** Cores iniciais por ferramenta — mostram já a personalidade "1 cor por caneta". */
const DEFAULT_TOOL_COLORS = {
  pen: '#1f6feb',
  fineliner: '#16a34a',
  pencil: '#eab308',
  brush: '#db2777',
  marker: '#e400e4',
  spray: '#f97316',
  eraser: '#000000',
};
TOOLS.forEach((t) => {
  state.toolColors[t.key] = DEFAULT_TOOL_COLORS[t.key] || '#000000';
  state.toolSizes[t.key] = 1;
  state.toolOpacity[t.key] = 1;
});
SHAPES.forEach((s) => {
  state.shapeColors[s.key] = '#000000';
  state.shapeSizes[s.key] = 1;
  state.shapeOpacity[s.key] = 1;
});
state.color = state.toolColors[state.activeKey];

export function makeLayerId() {
  return 'ly_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/** Cria uma camada vazia (ou com paths já existentes). */
export function createLayer(name, paths = []) {
  return {
    id: makeLayerId(),
    name,
    paths,
    visible: true,
    opacity: 1,
    locked: false,
  };
}

export function getLayerById(id) {
  return state.layers.find((l) => l.id === id) || null;
}

export function getActiveLayer() {
  if (!state.layers.length) return null;
  let layer = getLayerById(state.activeLayerId);
  if (!layer) {
    state.activeLayerId = state.layers[state.layers.length - 1].id;
    layer = getLayerById(state.activeLayerId);
  }
  return layer;
}

/** Garante que existe pelo menos uma camada ativa válida. */
export function ensureLayers() {
  if (!state.layers.length) initLayers();
  else if (!getLayerById(state.activeLayerId)) {
    state.activeLayerId = state.layers[state.layers.length - 1].id;
  }
}

/** Inicializa o documento com uma camada (novo projeto ou migração). */
export function initLayers(paths = []) {
  const layer = createLayer('Camada 1', paths);
  state.layers = [layer];
  state.activeLayerId = layer.id;
}

/** Clona camadas para snapshot (histórico / undo). */
function cloneLayers(layers) {
  return layers.map((l) => ({
    ...l,
    paths: (l.paths || []).map((p) => ({
      ...p,
      points: (p.points || []).map((pt) => ({ ...pt })),
      particles: p.particles ? p.particles.map((q) => ({ ...q })) : null,
    })),
  }));
}

/** Snapshot para o histórico (camadas + dimensões). */
export function snapshotPaths() {
  return {
    layers: cloneLayers(state.layers),
    activeLayerId: state.activeLayerId,
    w: state.canvasWidth,
    h: state.canvasHeight,
  };
}

/** Migra projeto antigo (paths planos) → camadas. */
export function layersFromProject(project) {
  if (Array.isArray(project.layers) && project.layers.length) {
    state.layers = cloneLayers(project.layers).map((l) => ({
      ...l,
      visible: l.visible !== false,
      locked: Boolean(l.locked),
      opacity: typeof l.opacity === 'number' ? l.opacity : 1,
    }));
    state.activeLayerId = project.activeLayerId || state.layers[0].id;
    ensureLayers();
    return;
  }
  const paths = Array.isArray(project.paths) ? project.paths : [];
  initLayers(paths.map((p) => ({
    ...p,
    points: (p.points || []).map((pt) => ({ ...pt })),
    particles: p.particles ? p.particles.map((q) => ({ ...q })) : null,
  })));
}

export function resetDrawing() {
  state.isDrawing = false;
  state.isShapeDrawing = false;
  state.shapeDraft = null;
  state.currentPath = null;
}

export function calcCanvasSize() {
  const railW = 300;   // rail mais larga → canetas deslizam sem tocar no canvas
  const menubarH = 32;
  const pad = 22;      // folga à volta do canvas
  const maxW = window.innerWidth - railW - pad * 2;
  const maxH = window.innerHeight - menubarH - pad * 2;
  let w = maxW;
  let h = Math.floor(w * 0.75);
  if (h > maxH) {
    h = maxH;
    w = Math.floor(h / 0.75);
  }
  return {
    w: Math.max(560, Math.floor(w)),
    h: Math.max(440, Math.floor(h)),
  };
}
