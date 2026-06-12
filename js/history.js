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
    this.redoStack.push(ctx.getImageData(0, 0, w, h));
    ctx.putImageData(this.undoStack.pop(), 0, 0);
    return true;
  }

  redo(ctx) {
    if (!this.redoStack.length) return false;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    this.undoStack.push(ctx.getImageData(0, 0, w, h));
    ctx.putImageData(this.redoStack.pop(), 0, 0);
    return true;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
