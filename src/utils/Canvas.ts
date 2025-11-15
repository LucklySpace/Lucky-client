class CanvasTool {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private history: any[] = []; // 用于存储历史记录，以便回撤

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  // 绘制矩形
  drawRect(x: number, y: number, width: number, height: number) {
    this.ctx.beginPath();
    this.ctx.rect(x, y, width, height);
    this.ctx.strokeStyle = "#FF0000"; // 红色
    this.ctx.lineWidth = 2; // 2px 宽度
    this.ctx.stroke(); // 只绘制边框
    //this.saveHistory();
  }

  // 绘制圆形
  drawCircle(x: number, y: number, radius: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
    this.ctx.strokeStyle = "#FF0000"; // 红色
    this.ctx.lineWidth = 2; // 2px 宽度
    this.ctx.stroke(); // 只绘制边框
    this.saveHistory();
  }

  // 绘制箭头
  // 绘制箭头
  drawArrow(fromX: number, fromY: number, toX: number, toY: number, size: number) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const headlen = size || 15; // 增加箭头长度
    const headWidth = headlen * 0.8; // 增加箭头宽度

    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.strokeStyle = "#FF0000"; // 红色
    this.ctx.lineWidth = 2; // 2px 宽度
    this.ctx.stroke();

    // 绘制箭头的三角形部分
    this.ctx.beginPath();
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    this.ctx.lineTo(toX - headWidth * Math.cos(angle + Math.PI / 6), toY - headWidth * Math.sin(angle + Math.PI / 6));
    this.ctx.lineTo(toX, toY);
    this.ctx.closePath();
    this.ctx.fillStyle = "#FF0000"; // 红色
    this.ctx.fill();
    this.saveHistory();
  }

  // 回撤操作
  redo() {
    if (this.history.length > 0) {
      const imageData = this.history.pop();
      this.ctx.putImageData(imageData as ImageData, 0, 0);
    }
  }

  // 清空画布
  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.history = []; // 清空历史记录
  }

  // 保存当前画布状态到历史记录
  private saveHistory() {
    this.history.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
    if (this.history.length > 20) { // 限制历史记录的长度
      this.history.shift();
    }
  }
}

export default CanvasTool;