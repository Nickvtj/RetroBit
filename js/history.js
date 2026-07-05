/**
 * Histórico baseado em PATHS (não em ImageData).
 *
 * Cada entrada é um "snapshot" leve: uma cópia rasa do array de paths
 * (os objetos-path são partilhados por referência — cópia barata) mais as
 * dimensões do canvas nesse momento (para o crop poder ser desfeito).
 *
 * O formato de entrada é: { paths: Path[], w: number, h: number }
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
}
