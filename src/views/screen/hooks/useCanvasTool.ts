// src/hooks/useCanvasTool.ts
import { ref } from "vue";
import type { ColorType, PenConfig, ToolType } from "./types";
import { COLOR_MAP } from "./types";

/**
 * createUseCanvasTool - 绘图工具工厂
 * 说明：
 * - 这个函数返回一个对象，包含 init / destroy / setTool / undo / redo / isDrawing 等方法
 * - 采用闭包方式持有对 canvas 元素与上下文的惰性访问（通过 getter 注入）
 *
 * 参数：
 * - getCanvas: () => HTMLCanvasElement | null
 * - getDrawCtx: () => CanvasRenderingContext2D | null
 * - getImgCtx: () => CanvasRenderingContext2D | null
 * - screenConfig: 截图选区与 scale 信息（传入 useScreenshot 的 state）
 */

export function createUseCanvasTool(
  getCanvas: () => HTMLCanvasElement | null,
  getDrawCtx: () => CanvasRenderingContext2D | null,
  getImgCtx: () => CanvasRenderingContext2D | null,
  screenConfig: any
) {
  const tool = ref<ToolType | "">("");
  const isDrawing = ref(false);

  // 历史栈：保存 ImageData（整个 drawCanvas 的快照），可以按需优化为增量
  const actions: ImageData[] = [];
  const undoStack: ImageData[] = [];

  // 临时快照：开始绘制前保存一份，用于交互式预览
  let tempSnapshot: ImageData | null = null;

  // ---- pen 状态（封装） ----

  let penConfig: PenConfig = {
    lastX: null,
    lastY: null,
    color: "red",
    size: 2
  };

  // 事件处理函数引用（便于 removeEventListener）
  function handleMouseDown(e: MouseEvent) {
    const drawCanvas = getCanvas();
    const ctx = getDrawCtx();
    if (!drawCanvas || !ctx) return;

    // 仅允许在选区内部绘制（把 offset * scale 限制）
    const scale = screenConfig.scaleX || 1;
    const offsetX = Math.min(Math.max(e.offsetX * scale, screenConfig.startX), screenConfig.endX);
    const offsetY = Math.min(Math.max(e.offsetY * scale, screenConfig.startY), screenConfig.endY);

    isDrawing.value = true;
    // 保存临时画布快照（用于重绘）
    tempSnapshot = ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);

    // 把起点存到 screenConfig 暂用（也可以在闭包保存）
    (screenConfig as any)._drawStartX = offsetX;
    (screenConfig as any)._drawStartY = offsetY;

    // pen 开始
    if (tool.value === "pen") {
      beginPen(offsetX, offsetY, ctx);
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDrawing.value) return;
    const drawCanvas = getCanvas();
    const ctx = getDrawCtx();
    if (!drawCanvas || !ctx || !tempSnapshot) return;

    const scale = screenConfig.scaleX || 1;
    const offsetX = Math.min(Math.max(e.offsetX * scale, screenConfig.startX), screenConfig.endX);
    const offsetY = Math.min(Math.max(e.offsetY * scale, screenConfig.startY), screenConfig.endY);

    // // 先还原到临时快照
    // ctx.putImageData(tempSnapshot, 0, 0);

    // 清除非马赛克的情况下重新绘制
    // 非 pen/mosaic 的工具需要恢复历史并绘制临时预览
    if (tool.value !== "mosaic" && tool.value !== "pen") {
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      actions.forEach(action => ctx.putImageData(action, 0, 0));
    }

    const sx = (screenConfig as any)._drawStartX;
    const sy = (screenConfig as any)._drawStartY;

    switch (tool.value) {
      case "rect":
        drawRect(ctx, sx, sy, offsetX, offsetY);
        break;
      case "circle":
        drawCircle(ctx, sx, sy, offsetX, offsetY);
        break;
      case "line":
        drawLine(ctx, sx, sy, offsetX, offsetY);
        break;
      case "arrow":
        drawArrow(ctx, sx, sy, offsetX, offsetY);
        break;
      case "mosaic":
        // 马赛克即时涂抹（以方块为单位）
        drawMosaic(ctx, offsetX, offsetY, 20);
        break;
      case "pen":
        // 调用抽离的 pen 绘制
        strokePen(offsetX, offsetY, ctx);
    }
  }

  function handleMouseUp() {
    if (!isDrawing.value) return;
    isDrawing.value = false;
    // 将 drawCanvas 的当前像素合并（已经画在 drawCanvas 上）
    // 保存历史快照
    const drawCanvas = getCanvas();
    const ctx = getDrawCtx();
    if (!drawCanvas || !ctx) return;

    //ctx.drawImage(drawCanvas!, 0, 0, drawCanvas.width, drawCanvas.height);

    if (tool.value === "pen") {
      endPen(ctx);
    }

    saveAction();

    tempSnapshot = null;
  }

  // 绘图实现函数（注意：传入的坐标均为屏幕像素级）
  function drawRect(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  }

  const drawCircle = (ctx: CanvasRenderingContext2D, x1: any, y1: any, x2: any, y2: any) => {
    // 限制圆形的绘制范围在框选矩形区域内
    const limitedEndX = Math.min(Math.max(x2, screenConfig.startX), screenConfig.endX);
    const limitedEndY = Math.min(Math.max(y2, screenConfig.startY), screenConfig.endY);

    // 计算半径，保证半径不会超过限定矩形的边界
    const deltaX = limitedEndX - x1;
    const deltaY = limitedEndY - y1;

    // 检查圆形是否会超出矩形区域的边界
    const maxRadiusX = Math.min(x1 - screenConfig.startX, screenConfig.endX - x1);
    const maxRadiusY = Math.min(y1 - screenConfig.startY, screenConfig.endY - y1);
    const maxRadius = Math.min(maxRadiusX, maxRadiusY);

    // 使用 min 函数确保半径不会超过限定范围
    const radius = Math.min(Math.sqrt(deltaX * deltaX + deltaY * deltaY), maxRadius);

    // 绘制圆形
    ctx.strokeStyle = "red";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x1, y1, radius, 0, Math.PI * 2);
    ctx.stroke();
  };

  function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  const drawArrow = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    const headLength = 15; // 箭头长度
    const tailWidth = 1; // 尾部宽度
    const headWidth = 5; // 箭头根部宽度

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const totalLength = Math.hypot(x2 - x1, y2 - y1);
    const shaftLength = totalLength - headLength; // 箭杆长度

    ctx.beginPath();

    // 从尾部左侧开始
    ctx.moveTo(x1 - (tailWidth / 2) * Math.sin(angle), y1 + (tailWidth / 2) * Math.cos(angle));

    // 箭杆左侧到箭头根部
    ctx.lineTo(
      x1 + shaftLength * Math.cos(angle) - (headWidth / 2) * Math.sin(angle),
      y1 + shaftLength * Math.sin(angle) + (headWidth / 2) * Math.cos(angle)
    );

    // 箭头左侧
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));

    // 箭尖
    ctx.lineTo(x2, y2);

    // 箭头右侧
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));

    // 箭杆右侧到尾部
    ctx.lineTo(
      x1 + shaftLength * Math.cos(angle) + (headWidth / 2) * Math.sin(angle),
      y1 + shaftLength * Math.sin(angle) - (headWidth / 2) * Math.cos(angle)
    );

    ctx.lineTo(x1 + (tailWidth / 2) * Math.sin(angle), y1 - (tailWidth / 2) * Math.cos(angle));

    ctx.closePath();
    ctx.fillStyle = "red";
    ctx.fill();
  };

  // 实时马赛克涂抹
  const drawMosaic = (ctx: CanvasRenderingContext2D, x: number, y: number, blockSize = 16) => {
    const imgCtx = getImgCtx();
    if (!imgCtx) return;
    const imageData = imgCtx.getImageData(x - blockSize, y - blockSize, blockSize, blockSize);
    const blurredData = blurImageData(imageData, blockSize);
    ctx.putImageData(blurredData, x - blockSize, y - blockSize);
  };

  const blurImageData = (imageData: ImageData, size: any): ImageData => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    const radius = size / 2; // 模糊半径
    const tempData = new Uint8ClampedArray(data); // 用于保存原始图像数据

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;

        let r = 0,
          g = 0,
          b = 0,
          a = 0;
        let count = 0;

        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const newX = x + kx;
            const newY = y + ky;

            if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
              const newIndex = (newY * width + newX) * 4;
              r += tempData[newIndex];
              g += tempData[newIndex + 1];
              b += tempData[newIndex + 2];
              a += tempData[newIndex + 3];
              count++;
            }
          }
        }

        data[index] = r / count;
        data[index + 1] = g / count;
        data[index + 2] = b / count;
        data[index + 3] = a / count;
      }
    }

    return imageData;
  };

  /**
   * 透传
   */
  function enableDrawLayerDirectly() {
    const canvas = getCanvas();
    if (canvas) canvas.style.pointerEvents = "auto";
  }

  function disableDrawLayerDirectly() {
    const canvas = getCanvas();
    if (canvas) canvas.style.pointerEvents = "none";
  }

  // ========== 独立的 pen 方法 ==========
  function beginPen(x: number, y: number, ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = penConfig.color;
    ctx.lineWidth = penConfig.size;
    ctx.moveTo(x, y);
    penConfig.lastX = x;
    penConfig.lastY = y;
  }

  function strokePen(x: number, y: number, ctx: CanvasRenderingContext2D) {
    // 如果没有上一个点，则开始新路径
    if (penConfig.lastX === null || penConfig.lastY === null) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      penConfig.lastX = x;
      penConfig.lastY = y;
      return;
    }

    // 使用二次贝塞尔平滑：控制点为上一次点，终点为中点
    const midX = (penConfig.lastX + x) / 2;
    const midY = (penConfig.lastY + y) / 2;
    ctx.quadraticCurveTo(penConfig.lastX, penConfig.lastY, midX, midY);
    ctx.stroke();

    // 更新最后点为当前坐标（用于下一段）
    penConfig.lastX = x;
    penConfig.lastY = y;
  }

  function endPen(ctx: CanvasRenderingContext2D) {
    try {
      ctx.closePath();
    } catch {
    }
    penConfig.lastX = null;
    penConfig.lastY = null;
  }

  // 挂载与卸载事件
  function startListen() {
    enableDrawLayerDirectly();
    const canvas = getCanvas();
    if (!canvas) return;
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
  }

  function stopListen() {
    disableDrawLayerDirectly();
    const canvas = getCanvas();
    if (!canvas) return;
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("mousemove", handleMouseMove);
    canvas.removeEventListener("mouseup", handleMouseUp);
  }

  // 工具切换
  function setTool(t: ToolType) {
    tool.value = t;
    startListen();
  }

  const saveAction = () => {
    const ctx = getDrawCtx();
    const canvas = getCanvas();
    if (!ctx || !canvas) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    actions.push(imageData as never);
    undoStack.length = 0; // 清空撤销堆栈
  };

  // 撤销
  const undo = () => {
    stopListen();
    if (actions.length > 0) {
      const ctx = getDrawCtx();
      const canvas = getCanvas();
      if (!ctx || !canvas) return;
      undoStack.push(actions.pop() as never);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (actions.length > 0) {
        ctx.putImageData(actions[actions.length - 1], 0, 0);
      }
    }
  };

  // 重做
  function redo() {
    const ctx = getDrawCtx();
    if (!ctx) return;
    if (undoStack.length === 0) return;
    const img = undoStack.pop()!;
    actions.push(img);
    ctx.putImageData(img, 0, 0);
  }

  function setPenOptions({ color, size }: { color?: ColorType; size?: number }) {
    if (color !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(COLOR_MAP, color)) {
        console.warn(`[setPenOptions] unknown color "${color}", ignore.`);
      } else {
        penConfig.color = color;
      }
    }
    if (size !== undefined) {
      // 限定大小范围（比如 1 ~ 50）
      const newSize = Math.max(1, Math.min(50, Math.floor(size)));
      penConfig.size = newSize;
    }
  }

  return {
    startListen,
    stopListen,
    setTool,
    undo,
    redo,
    setPenOptions,
    isDrawing: () => isDrawing.value
  };
}
