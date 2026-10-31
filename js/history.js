/**
 * Histórico baseado em PATHS (não em ImageData).
 *
 * Cada entrada é um snapshot: { layers, activeLayerId, w, h, bg }
 * (projetos antigos podem ter só { paths, w, h }).
 */
export class History {
  constructor(max = 80, onChange = null) {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingRedo = null; // redo apagado pelo último record — volta se ele for descartado
    this.max = max;
    this.onChange = onChange; // avisado a cada alteração do documento (ex.: marcar "não salvo")
  }

  /** Regista o estado ANTES de uma alteração. Limpa o stack de redo. */
  record(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.max) this.undoStack.shift();
    this.pendingRedo = this.redoStack;
    this.redoStack = [];
    this.onChange?.();
  }

  /** Devolve a entrada a restaurar (ou null). `current` vai para o redo. */
  undo(current) {
    if (!this.undoStack.length) return null;
    this.pendingRedo = null;
    this.redoStack.push(current);
    this.onChange?.();
    return this.undoStack.pop();
  }

  /** Devolve a entrada a restaurar (ou null). `current` volta para o undo. */
  redo(current) {
    if (!this.redoStack.length) return null;
    this.pendingRedo = null;
    this.undoStack.push(current);
    this.onChange?.();
    return this.redoStack.pop();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingRedo = null;
  }

  /**
   * Remove a última entrada de undo (traço descartado, ex. borracha em branco
   * ou o 1º dedo de um gesto) — como se nunca tivesse existido, o redo volta.
   */
  discardLast() {
    if (this.undoStack.length) this.undoStack.pop();
    if (this.pendingRedo) this.redoStack = this.pendingRedo;
    this.pendingRedo = null;
  }
}
