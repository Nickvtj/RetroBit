function cloneImageData(imageData) {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

export class History {
  constructor(max = 40) {
    this.undoStack = [];
    this.redoStack = [];
    this.max = max;
  }

  push(imageData) {
    this.undoStack.push(cloneImageData(imageData));
    if (this.undoStack.length > this.max) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(ctx) {
    if (!this.undoStack.length) return false;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const current = ctx.getImageData(0, 0, w, h);
    this.redoStack.push(current);
    const prev = this.undoStack.pop();
    ctx.putImageData(prev, 0, 0);
    return true;
  }

  redo(ctx) {
    if (!this.redoStack.length) return false;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const current = ctx.getImageData(0, 0, w, h);
    this.undoStack.push(current);
    const next = this.redoStack.pop();
    ctx.putImageData(next, 0, 0);
    return true;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
