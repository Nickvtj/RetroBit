/**
 * Histórico baseado em PATHS (não em ImageData).
 *
 * Cada entrada é um snapshot: { layers, activeLayerId, w, h }
 * (projetos antigos podem ter só { paths, w, h }).
 */
export class History {
  constructor(max = 80) {
    this.undoStack = [];
    this.redoStack = [];
    this.max = max;
  }

  /** Regista o estado ANTES de uma alteração. Limpa o stack de redo. */
  record(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.max) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Devolve a entrada a restaurar (ou null). `current` vai para o redo. */
  undo(current) {
    if (!this.undoStack.length) return null;
    this.redoStack.push(current);
    return this.undoStack.pop();
  }

  /** Devolve a entrada a restaurar (ou null). `current` volta para o undo. */
  redo(current) {
    if (!this.redoStack.length) return null;
    this.undoStack.push(current);
    return this.redoStack.pop();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Remove a última entrada de undo (traço descartado, ex. borracha em branco). */
  discardLast() {
    if (this.undoStack.length) this.undoStack.pop();
  }
}
