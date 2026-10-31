/**
 * Idiomas: português (original) e inglês.
 *
 * A chave de cada texto é o próprio texto em português: o HTML fica escrito
 * em português e translatePage() troca os textos e os atributos (title,
 * aria-label, alt, placeholder) que tiverem tradução. No JS, t('texto {x}', { x })
 * traduz e preenche as variáveis.
 *
 * Idioma: o escolhido no botão da splash, ou o do navegador (pt* → português,
 * o resto → inglês).
 */

const EN = {
  // ── Splash, galeria, geral ─────────────────────────────
  'uma ferramenta de desenho com traço tremido': 'a drawing tool with wiggly lines',
  'Vamos desenhar!': "Let's draw!",
  'desenvolvido por Nicolas Vieira': 'made by Nicolas Vieira',
  'Novo projeto': 'New project',
  'Abrir arquivo': 'Open file',
  'abrir um projeto .retrobit': 'open a .retrobit project',
  'renomear ou excluir': 'rename or delete',
  'Projeto {n}': 'Project {n}',
  'projeto importado': 'project imported',
  'esse arquivo não é um projeto do RetroBit': "that file isn't a RetroBit project",
  'Fechar': 'Close',
  'Cancelar': 'Cancel',
  'Salvar': 'Save',
  'Desenhe com canetas, pincéis e spray e veja cada traço tremer como num desenho animado antigo. Exporte como GIF animado.':
    'Draw with pens, brushes and spray paint and watch every line wiggle like an old cartoon. Export it as an animated GIF.',

  // ── Tela de desenho ────────────────────────────────────
  'voltar': 'back',
  'voltar à galeria': 'back to the gallery',
  'camadas': 'layers',
  'Camadas': 'Layers',
  'nova camada': 'new layer',
  'Ferramentas do quadro': 'Canvas tools',
  'zoom — clique para voltar a 100%': 'zoom — click to go back to 100%',
  'espelho horizontal': 'horizontal mirror',
  'espelho vertical': 'vertical mirror',
  'luva: selecionar, mover, esticar e girar': 'glove: select, move, stretch and rotate',
  'grade de pixel art: desligada · 8 · 16 · 32': 'pixel-art grid: off · 8 · 16 · 32',
  'grade de {n} px': '{n} px grid',
  'grade desligada': 'grid off',
  'Área de desenho': 'Drawing area',
  'Ferramentas': 'Tools',
  'obliterar camada': 'obliterate layer',
  'arraste para recortar · Esc cancela': 'drag to crop · Esc cancels',
  'toque numa cor da tela · Esc cancela': 'tap a color on the canvas · Esc cancels',
  'Exportar': 'Export',
  'Fundo': 'Background',
  'Referência': 'Reference',
  'Tela': 'Canvas',
  'Som': 'Sound',
  'Ajuda': 'Help',
  'salvar (Ctrl+S)': 'save (Ctrl+S)',
  'exportar GIF ou PNG': 'export GIF or PNG',
  'cor do fundo': 'background color',
  'imagem de referência para copiar por cima': 'reference image to trace over',
  'tamanho da tela e recorte': 'canvas size and crop',
  'ver o tutorial de novo': 'show the tutorial again',
  'desligar som': 'turn sound off',
  'ligar som': 'turn sound on',
  'desfazer (Ctrl+Z)': 'undo (Ctrl+Z)',
  'refazer (Ctrl+Y)': 'redo (Ctrl+Y)',
  'mais opções': 'more options',
  'Salvo!': 'Saved!',
  'Sem espaço para salvar!': 'Not enough space to save!',
  'cor {hex}': 'color {hex}',
  'código secreto!': 'secret code!',

  // ── Ferramentas, formas, tamanhos ──────────────────────
  'caneta': 'pen',
  'caneta fina': 'fineliner',
  'lápis': 'pencil',
  'pincel': 'brush',
  'marcador': 'marker',
  'spray': 'spray',
  'balde': 'bucket',
  'borracha': 'eraser',
  'retângulo': 'rectangle',
  'elipse': 'ellipse',
  'linha': 'line',
  'paisagem': 'landscape',
  'quadrado': 'square',
  'retrato': 'portrait',
  'wide': 'wide',
  'recortar área': 'crop area',
  'arrastar': 'drag',

  // ── Menu rápido ────────────────────────────────────────
  'segure um quadradinho para guardar a cor atual nele': 'hold a square to store the current color in it',
  'conta-gotas: pegar uma cor da tela': 'eyedropper: pick a color from the canvas',
  'mais cores': 'more colors',
  'tamanho': 'size',
  'opacidade': 'opacity',
  'código da cor': 'color code',
  '{hex} · segure para guardar a cor atual aqui': '{hex} · hold to store the current color here',
  'tamanho {n}': 'size {n}',

  // ── Camadas ────────────────────────────────────────────
  'Camada {n}': 'Layer {n}',
  '{name} cópia': '{name} copy',
  'camada': 'layer',
  'esconder': 'hide',
  'mostrar': 'show',
  'opções': 'options',
  'Renomear': 'Rename',
  'Duplicar': 'Duplicate',
  'Bloquear': 'Lock',
  'Desbloquear': 'Unlock',
  'Apagar camada': 'Delete layer',
  'renomear camada': 'rename layer',
  'nome da camada': 'layer name',
  'Menos': 'Less',
  'Mais': 'More',

  // ── Projetos ───────────────────────────────────────────
  'projeto': 'project',
  'Excluir': 'Delete',
  'renomear projeto': 'rename project',
  'nome do projeto': 'project name',
  'apagar projeto': 'delete project',
  'Apagar “': 'Delete “',
  '”?': '”?',
  'Isso não pode ser desfeito.': "This can't be undone.",
  'Apagar': 'Delete',
  'tamanho da tela': 'canvas size',
  'desenho': 'drawing',

  // ── Exportar ───────────────────────────────────────────
  'exportar': 'export',
  'GIF animado': 'Animated GIF',
  '— tremendo': '— wiggling',
  'GIF grande': 'Big GIF',
  '— tamanho original': '— original size',
  'Imagem PNG': 'PNG image',
  '— parada': '— still',
  'PNG sem fundo': 'Transparent PNG',
  '— transparente': '— no background',
  'Arquivo do projeto': 'Project file',
  '— backup (.retrobit)': '— backup (.retrobit)',

  // ── Sair / recuperar ───────────────────────────────────
  'sair do desenho': 'leave drawing',
  'Sair sem salvar?': 'Leave without saving?',
  'As alterações deste desenho vão se perder.': 'The changes to this drawing will be lost.',
  'Sair': 'Leave',
  'Salvar e sair': 'Save and leave',
  'desenho recuperado': 'drawing recovered',
  'Achamos um desenho que não foi salvo.': 'We found a drawing that was not saved.',
  'Achamos alterações não salvas em “{name}”.': 'We found unsaved changes in “{name}”.',
  'Quer continuar de onde parou?': 'Do you want to pick up where you left off?',
  'Descartar': 'Discard',
  'Recuperar': 'Recover',

  // ── Imagem de referência ───────────────────────────────
  'imagem de referência': 'reference image',
  'Coloque uma imagem na tela para desenhar por cima.': 'Put an image on the canvas to draw over it.',
  'Ela não aparece no GIF nem no PNG.': "It doesn't show up in the GIF or the PNG.",
  'Escolher imagem': 'Choose image',
  'ou arraste uma imagem para a tela, ou cole com Ctrl+V': 'or drag an image onto the canvas, or paste it with Ctrl+V',
  'imagem de referência atual': 'current reference image',
  'Mostrar': 'Show',
  'Por cima do desenho': 'Over the drawing',
  'Preto e branco': 'Black and white',
  'Mover / esticar': 'Move / stretch',
  'Ajustar à tela': 'Fit to canvas',
  'Trocar': 'Replace',
  'Remover': 'Remove',
  'Pronto': 'Done',
  'esticar': 'stretch',
  'imagem de referência colocada': 'reference image added',
  'não deu para abrir essa imagem': "couldn't open that image",

  // ── Luva ───────────────────────────────────────────────
  'modo da luva': 'glove mode',
  'luva: mover, esticar e girar': 'glove: move, stretch and rotate',
  'bomba: toque num traço para explodir': 'bomb: tap a stroke to blow it up',
  'girar': 'rotate',
  'explodir (Delete)': 'blow up (Delete)',
  'duplicar (Ctrl+D)': 'duplicate (Ctrl+D)',
  'espelhar': 'flip',

  // ── Sugestão de virar o celular ─────────────────────────
  'dica': 'tip',
  'Vire o celular de lado': 'Turn your phone sideways',
  'Na horizontal a tela de desenho fica maior e todas as canetas ficam à vista.':
    'In landscape the canvas is bigger and every pen is in view.',
  'Continuar em pé': 'Keep it upright',
  'Tela cheia deitada': 'Full screen, sideways',

  // ── Tutorial ───────────────────────────────────────────
  'Pular': 'Skip',
  'Próximo': 'Next',
  'Vamos lá!': "Let's go!",
  '{i} de {n}': '{i} of {n}',
  'Canetas': 'Pens',
  'Toque numa caneta para desenhar. Toque de novo na mesma caneta para trocar a cor, o tamanho e a opacidade.':
    'Tap a pen to draw. Tap the same pen again to change its color, size and opacity.',
  'Separe o desenho em camadas: crie, esconda, arraste para reordenar e use o ⋮ para mais opções.':
    'Split your drawing into layers: add, hide, drag to reorder and use ⋮ for more options.',
  'Quadro': 'Canvas tools',
  'Zoom, espelho, a luva (pegar e mover traços), a grade de pixel art e as formas.':
    'Zoom, mirror, the glove (grab and move strokes), the pixel-art grid and shapes.',
  'Ações': 'Actions',
  'Salve no navegador, exporte um GIF tremendo, mude o fundo, use uma imagem de referência e desfaça o que quiser.':
    'Save in your browser, export a wiggly GIF, change the background, use a reference image and undo anything.',
  'A dinamite explode a camada inteira. Sem medo: dá para desfazer.':
    'The dynamite blows up the whole layer. No worries: you can undo it.',
  'Gestos': 'Gestures',
  'Pinça para zoom, arraste com dois dedos para mover, toque com dois dedos para desfazer e com três para refazer.':
    'Pinch to zoom, drag with two fingers to move, tap with two fingers to undo and with three to redo.',
};

const KEY = 'retrobit-lang';

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'pt' || saved === 'en') return saved;
  } catch { /* sem storage */ }
  return (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export const lang = detect();

/** Texto traduzido, com {variáveis} preenchidas. */
export function t(text, vars) {
  let s = lang === 'en' ? (EN[text] ?? text) : text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}

const ATTRS = ['title', 'aria-label', 'alt', 'placeholder'];

/** Traduz os textos e atributos fixos da página (o HTML está em português). */
export function translatePage(root = document.body) {
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
  if (lang !== 'en') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const raw = n.nodeValue;
    const k = raw.trim();
    if (k && EN[k] !== undefined) n.nodeValue = raw.replace(k, EN[k]);
  }
  root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(',')).forEach((el) => {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && EN[v] !== undefined) el.setAttribute(a, EN[v]);
    }
  });
  const desc = document.querySelector('meta[name="description"]');
  if (desc && EN[desc.content]) desc.content = EN[desc.content];
}

/** Troca de idioma: guarda e recarrega (o rascunho automático protege o desenho aberto). */
export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch { /* sem storage */ }
  location.reload();
}
