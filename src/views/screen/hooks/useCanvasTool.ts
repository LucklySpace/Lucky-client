// src/hooks/useCanvasTool.ts
import { ref } from "vue";
import type { ColorType, ToolType } from "./types";
import { COLOR_MAP } from "./types";

type RectShape = {
  id: number;
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  size: number;
};

type CircleShape = {
  id: number;
  type: "circle";
  cx: number;
  cy: number;
  r: number;
  color: string;
  size: number;
};

type LineShape = {
  id: number;
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
};

type ArrowShape = {
  id: number;
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
};

type PenShape = {
  id: number;
  type: "pen";
  points: Array<[number, number]>;
  color: string;
  size: number;
};

type MosaicBlock = {
  data: ImageData;
  x: number;
  y: number;
  size: number;
};

type MosaicShape = {
  id: number;
  type: "mosaic";
  blocks: MosaicBlock[];
};

type TextShape = {
  id: number;
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  font: string;
  width: number;
  height: number;
};

type Shape = RectShape | CircleShape | LineShape | ArrowShape | PenShape | MosaicShape | TextShape;

type DragContext = {
  startX: number;
  startY: number;
  mode: "move" | "draw";
};

const DRAGGABLE_TYPES = new Set<Shape["type"]>(["rect", "circle", "line", "arrow", "text", "pen", "mosaic"]);

function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function cloneShape(shape: Shape): Shape {
  switch (shape.type) {
    case "rect":
      return { ...shape };
    case "circle":
      return { ...shape };
    case "line":
    case "arrow":
      return { ...shape };
    case "pen":
      return { ...shape, points: shape.points.map(point => [...point] as [number, number]) };
    case "mosaic":
      return {
        ...shape,
        blocks: shape.blocks.map(block => ({
          data: cloneImageData(block.data),
          x: block.x,
          y: block.y,
          size: block.size
        }))
      };
    case "text":
      return { ...shape };
  }
}

function cloneShapes(list: Shape[]): Shape[] {
  return list.map(item => cloneShape(item));
}

function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export function createUseCanvasTool(
  getCanvas: () => HTMLCanvasElement | null,
  getDrawCtx: () => CanvasRenderingContext2D | null,
  getImgCtx: () => CanvasRenderingContext2D | null,
  screenConfig: any
) {
  const tool = ref<ToolType | "">("");
  const isDrawing = ref(false);

  let shapes: Shape[] = [];
  let activeShape: Shape | null = null;
  let dragContext: DragContext | null = null;
  let shapeId = 0;

  const history: Shape[][] = [[]];
  const redoStack: Shape[][] = [];

  const textState = {
    inputEl: null as HTMLInputElement | null,
    editing: false,
    cssX: 0,
    cssY: 0
  };

  let styleConfig: { color: ColorType | string; size: number } = {
    color: "red",
    size: 2
  };

  const resolveColor = (c: ColorType | string) => (COLOR_MAP as any)[c] || c;

  function pushHistory(data?: Shape[]) {
    const snapshot = cloneShapes(data ?? shapes);
    history.push(snapshot);
    redoStack.length = 0;
  }

  function renderAllShapes(preview?: Shape | null) {
    const canvas = getCanvas();
    const ctx = getDrawCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawShape = (shape: Shape) => {
      switch (shape.type) {
        case "rect":
          ctx.strokeStyle = shape.color;
          ctx.lineWidth = shape.size;
          ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
          break;
        case "circle":
          ctx.strokeStyle = shape.color;
          ctx.lineWidth = shape.size;
          ctx.beginPath();
          ctx.arc(shape.cx, shape.cy, Math.max(0, shape.r), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "line":
          ctx.strokeStyle = shape.color;
          ctx.lineWidth = shape.size;
          ctx.beginPath();
          ctx.moveTo(shape.x1, shape.y1);
          ctx.lineTo(shape.x2, shape.y2);
          ctx.stroke();
          break;
        case "arrow": {
          const headLength = 15;
          const tailWidth = shape.size / 1.5;
          const headWidth = shape.size * 1.5;
          const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
          const totalLength = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
          const shaftLength = Math.max(0, totalLength - headLength);

          ctx.beginPath();
          ctx.fillStyle = shape.color;
          ctx.strokeStyle = shape.color;
          ctx.lineWidth = shape.size;
          ctx.moveTo(shape.x1 - (tailWidth / 2) * Math.sin(angle), shape.y1 + (tailWidth / 2) * Math.cos(angle));
          ctx.lineTo(
            shape.x1 + shaftLength * Math.cos(angle) - (headWidth / 2) * Math.sin(angle),
            shape.y1 + shaftLength * Math.sin(angle) + (headWidth / 2) * Math.cos(angle)
          );
          ctx.lineTo(
            shape.x2 - headLength * Math.cos(angle - Math.PI / 6),
            shape.y2 - headLength * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(shape.x2, shape.y2);
          ctx.lineTo(
            shape.x2 - headLength * Math.cos(angle + Math.PI / 6),
            shape.y2 - headLength * Math.sin(angle + Math.PI / 6)
          );
          ctx.lineTo(
            shape.x1 + shaftLength * Math.cos(angle) + (headWidth / 2) * Math.sin(angle),
            shape.y1 + shaftLength * Math.sin(angle) - (headWidth / 2) * Math.cos(angle)
          );
          ctx.lineTo(shape.x1 + (tailWidth / 2) * Math.sin(angle), shape.y1 - (tailWidth / 2) * Math.cos(angle));
          ctx.closePath();
          ctx.fill();
          break;
        }
        case "pen": {
          ctx.strokeStyle = shape.color;
          ctx.lineWidth = shape.size;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          shape.points.forEach(([x, y], index) => {
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.stroke();
          break;
        }
        case "mosaic":
          shape.blocks.forEach(block => {
            ctx.putImageData(block.data, block.x - block.size, block.y - block.size);
          });
          break;
        case "text":
          ctx.font = shape.font;
          ctx.fillStyle = shape.color;
          ctx.textBaseline = "top";
          ctx.textAlign = "left";
          ctx.fillText(shape.text, shape.x, shape.y);
          break;
      }
    };

    shapes.forEach(shape => drawShape(shape));
    if (preview) drawShape(preview);
  }

  function getPointerPosition(e: MouseEvent) {
    const scale = screenConfig.scaleX || 1;
    const x = Math.min(Math.max(e.offsetX * scale, screenConfig.startX), screenConfig.endX);
    const y = Math.min(Math.max(e.offsetY * scale, screenConfig.startY), screenConfig.endY);
    return { x, y };
  }

  function isShapeDraggable(shape: Shape | null): shape is Shape {
    return !!shape && DRAGGABLE_TYPES.has(shape.type);
  }

  function findShapeAt(x: number, y: number): Shape | null {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const shape = shapes[i];
      if (!isShapeDraggable(shape)) continue;
      switch (shape.type) {
        case "rect":
          if (x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h) return shape;
          break;
        case "circle": {
          const dist = Math.hypot(x - shape.cx, y - shape.cy);
          if (dist <= shape.r + shape.size) return shape;
          break;
        }
        case "line":
        case "arrow": {
          const dist = pointToSegmentDistance(x, y, shape.x1, shape.y1, shape.x2, shape.y2);
          if (dist <= shape.size + 4) return shape;
          break;
        }
        case "pen":
          for (let i = 1; i < shape.points.length; i++) {
            const [sx, sy] = shape.points[i - 1];
            const [ex, ey] = shape.points[i];
            if (pointToSegmentDistance(x, y, sx, sy, ex, ey) <= shape.size + 4) return shape;
          }
          break;
        case "mosaic": {
          if (!shape.blocks.length) break;
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          shape.blocks.forEach(block => {
            const left = block.x - block.size;
            const right = block.x + block.size;
            const top = block.y - block.size;
            const bottom = block.y + block.size;
            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, right);
            maxY = Math.max(maxY, bottom);
          });
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) return shape;
          break;
        }
        case "text":
          if (x >= shape.x && x <= shape.x + shape.width && y >= shape.y && y <= shape.y + shape.height) return shape;
          break;
      }
    }
    return null;
  }

  function updateShapeGeometry(shape: Shape, startX: number, startY: number, endX: number, endY: number) {
    switch (shape.type) {
      case "rect":
        shape.x = Math.min(startX, endX);
        shape.y = Math.min(startY, endY);
        shape.w = Math.abs(endX - startX);
        shape.h = Math.abs(endY - startY);
        break;
      case "circle": {
        const limitedEndX = Math.min(Math.max(endX, screenConfig.startX), screenConfig.endX);
        const limitedEndY = Math.min(Math.max(endY, screenConfig.startY), screenConfig.endY);
        const deltaX = limitedEndX - startX;
        const deltaY = limitedEndY - startY;
        const maxRadiusX = Math.min(startX - screenConfig.startX, screenConfig.endX - startX);
        const maxRadiusY = Math.min(startY - screenConfig.startY, screenConfig.endY - startY);
        const maxRadius = Math.min(maxRadiusX, maxRadiusY);
        shape.r = Math.min(Math.sqrt(deltaX * deltaX + deltaY * deltaY), Math.max(0, maxRadius));
        break;
      }
      case "line":
      case "arrow":
        shape.x1 = startX;
        shape.y1 = startY;
        shape.x2 = endX;
        shape.y2 = endY;
        break;
      case "pen":
        shape.points.push([endX, endY]);
        break;
      case "mosaic":
        addMosaicBlock(shape, endX, endY);
        break;
    }
  }

  function moveShape(shape: Shape, dx: number, dy: number) {
    switch (shape.type) {
      case "rect":
        shape.x += dx;
        shape.y += dy;
        break;
      case "circle":
        shape.cx += dx;
        shape.cy += dy;
        break;
      case "line":
      case "arrow":
        shape.x1 += dx;
        shape.y1 += dy;
        shape.x2 += dx;
        shape.y2 += dy;
        break;
      case "text":
        shape.x += dx;
        shape.y += dy;
        break;
      case "pen":
        shape.points = shape.points.map(([px, py]) => [px + dx, py + dy]);
        break;
      case "mosaic":
        shape.blocks.forEach(block => {
          block.x += dx;
          block.y += dy;
        });
        break;
    }
  }

  function addMosaicBlock(shape: MosaicShape, x: number, y: number, blockSize = 20) {
    const imgCtx = getImgCtx();
    const ctx = getDrawCtx();
    if (!imgCtx || !ctx) return;
    try {
      const data = imgCtx.getImageData(x - blockSize, y - blockSize, blockSize, blockSize);
      const blurred = blurImageData(data, blockSize);
      shape.blocks.push({
        data: cloneImageData(blurred),
        x,
        y,
        size: blockSize
      });
    } catch (error) {
      console.warn("[mosaic] capture block failed", error);
    }
  }

  function blurImageData(imageData: ImageData, size: number): ImageData {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const radius = size / 2;
    const tempData = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
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
  }

  function mountTextInput(cssX: number, cssY: number) {
    const canvas = getCanvas();
    if (!canvas || textState.editing) return;
    const host = canvas.parentElement || document.body;
    const input = document.createElement("input");
    input.type = "text";
    input.value = "";
    input.placeholder = "";
    input.style.position = "absolute";
    input.style.left = `${cssX}px`;
    input.style.top = `${cssY}px`;
    input.style.zIndex = "10000";
    input.style.border = "1px dashed #bfbfbf";
    input.style.padding = "2px 4px";
    input.style.background = "transparent";
    input.style.color = resolveColor(styleConfig.color);
    input.style.font = getTextFontPx();
    input.style.lineHeight = "1.2";
    input.style.minWidth = "40px";
    input.style.outline = "none";
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        confirmTextInput();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        cancelTextInput();
      }
    };
    const onBlur = () => confirmTextInput();
    input.addEventListener("keydown", onKey);
    input.addEventListener("blur", onBlur);
    host.appendChild(input);
    (input as any)._cleanup = () => {
      input.removeEventListener("keydown", onKey);
      input.removeEventListener("blur", onBlur);
    };
    textState.inputEl = input;
    textState.editing = true;
    textState.cssX = cssX;
    textState.cssY = cssY;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        input.focus();
        input.addEventListener("blur", onBlur);
      });
    });
  }

  function unmountTextInput() {
    const el = textState.inputEl;
    if (!el) return;
    try {
      (el as any)._cleanup?.();
    } catch {}
    el.remove();
    textState.inputEl = null;
    textState.editing = false;
  }

  function cancelTextInput() {
    unmountTextInput();
  }

  function getFontStack(): string {
    try {
      const root = getComputedStyle(document.documentElement);
      const value = root.getPropertyValue("--font-family");
      return (value && value.trim()) || "system-ui, Arial, sans-serif";
    } catch {
      return "system-ui, Arial, sans-serif";
    }
  }

  function getTextFontPx(): string {
    const px = Math.max(12, Math.min(64, styleConfig.size * 2 + 10));
    return `${px}px ${getFontStack()}`;
  }

  function confirmTextInput() {
    const el = textState.inputEl;
    const text = (el?.value || "").trim();
    unmountTextInput();
    if (!text) return;
    const ctx = getDrawCtx();
    const canvas = getCanvas();
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.font = getTextFontPx();
    const pxX = Math.round(textState.cssX * (screenConfig.scaleX || 1));
    const pxY = Math.round(textState.cssY * (screenConfig.scaleY || 1));
    const metrics = ctx.measureText(text);
    const fontSize = parseInt(getTextFontPx(), 10);
    const textShape: TextShape = {
      id: ++shapeId,
      type: "text",
      x: pxX,
      y: pxY,
      text,
      color: resolveColor(styleConfig.color),
      font: getTextFontPx(),
      width: metrics.width,
      height: fontSize || styleConfig.size * 2
    };
    shapes.push(textShape);
    pushHistory();
    renderAllShapes();
    ctx.restore();
  }

  function setCanvasCursor(cursor: string) {
    const canvas = getCanvas();
    if (canvas) canvas.style.cursor = cursor;
  }

  function handleMouseDown(e: MouseEvent) {
    const canvas = getCanvas();
    const ctx = getDrawCtx();
    if (!canvas || !ctx) return;

    const { x, y } = getPointerPosition(e);
    const hit = findShapeAt(x, y);
    if (hit && isShapeDraggable(hit)) {
      activeShape = hit;
      dragContext = { startX: x, startY: y, mode: "move" };
      isDrawing.value = true;
      setCanvasCursor("move");
      return;
    }

    if (!tool.value) return;

    if (tool.value === "text") {
      const scale = screenConfig.scaleX || 1;
      const minX = Math.min(screenConfig.startX, screenConfig.endX);
      const minY = Math.min(screenConfig.startY, screenConfig.endY);
      const maxX = Math.max(screenConfig.startX, screenConfig.endX);
      const maxY = Math.max(screenConfig.startY, screenConfig.endY);
      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
      const cssX = Math.round(clamp(e.offsetX, minX / scale, maxX / scale));
      const cssY = Math.round(clamp(e.offsetY, minY / scale, maxY / scale));
      if (textState.editing) confirmTextInput();
      mountTextInput(cssX, cssY);
      return;
    }

    dragContext = { startX: x, startY: y, mode: "draw" };
    isDrawing.value = true;

    switch (tool.value) {
      case "rect":
        activeShape = {
          id: ++shapeId,
          type: "rect",
          x,
          y,
          w: 0,
          h: 0,
          color: resolveColor(styleConfig.color),
          size: styleConfig.size
        };
        break;
      case "circle":
        activeShape = {
          id: ++shapeId,
          type: "circle",
          cx: x,
          cy: y,
          r: 0,
          color: resolveColor(styleConfig.color),
          size: styleConfig.size
        };
        break;
      case "line":
        activeShape = {
          id: ++shapeId,
          type: "line",
          x1: x,
          y1: y,
          x2: x,
          y2: y,
          color: resolveColor(styleConfig.color),
          size: styleConfig.size
        };
        break;
      case "arrow":
        activeShape = {
          id: ++shapeId,
          type: "arrow",
          x1: x,
          y1: y,
          x2: x,
          y2: y,
          color: resolveColor(styleConfig.color),
          size: styleConfig.size
        };
        break;
      case "pen":
        activeShape = {
          id: ++shapeId,
          type: "pen",
          points: [[x, y]],
          color: resolveColor(styleConfig.color),
          size: styleConfig.size
        };
        break;
      case "mosaic":
        activeShape = { id: ++shapeId, type: "mosaic", blocks: [] };
        addMosaicBlock(activeShape, x, y);
        break;
      default:
        activeShape = null;
    }

    renderAllShapes(activeShape);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDrawing.value || !dragContext) return;
    const { x, y } = getPointerPosition(e);

    if (dragContext.mode === "move" && activeShape && isShapeDraggable(activeShape)) {
      const dx = x - dragContext.startX;
      const dy = y - dragContext.startY;
      moveShape(activeShape, dx, dy);
      dragContext.startX = x;
      dragContext.startY = y;
      renderAllShapes();
      return;
    }

    if (!activeShape) return;
    updateShapeGeometry(activeShape, dragContext.startX, dragContext.startY, x, y);
    renderAllShapes(activeShape);
  }

  function handleMouseUp() {
    if (!isDrawing.value) return;
    isDrawing.value = false;

    if (dragContext?.mode === "move" && activeShape) {
      pushHistory();
      activeShape = null;
      dragContext = null;
      setCanvasCursor("default");
      return;
    }

    if (activeShape && dragContext?.mode === "draw") {
      shapes.push(activeShape);
      pushHistory();
    }

    activeShape = null;
    dragContext = null;
    renderAllShapes();
    setCanvasCursor("default");
  }

  function enableDrawLayerDirectly() {
    const canvas = getCanvas();
    if (canvas) canvas.style.pointerEvents = "auto";
  }

  function disableDrawLayerDirectly() {
    const canvas = getCanvas();
    if (canvas) canvas.style.pointerEvents = "none";
  }

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
    setCanvasCursor("default");
  }

  function setTool(t: ToolType) {
    tool.value = t;
    if (textState.editing) cancelTextInput();
    startListen();
  }

  function undo() {
    if (history.length <= 1) return;
    const current = history.pop();
    if (current) redoStack.push(current);
    shapes = cloneShapes(history[history.length - 1]);
    renderAllShapes();
  }

  function redo() {
    const snapshot = redoStack.pop();
    if (!snapshot) return;
    const cloned = cloneShapes(snapshot);
    history.push(cloned);
    shapes = cloneShapes(cloned);
    renderAllShapes();
  }

  function setPenOptions({ color, size }: { color?: ColorType | string; size?: number }) {
    if (color !== undefined) {
      styleConfig.color = color;
    }
    if (size !== undefined) {
      const newSize = Math.max(1, Math.min(50, Math.floor(size)));
      styleConfig.size = newSize;
    }
    if (textState.editing && textState.inputEl) {
      textState.inputEl.style.color = resolveColor(styleConfig.color);
      textState.inputEl.style.font = getTextFontPx();
    }
  }

  return {
    resolveColor,
    startListen,
    stopListen,
    setTool,
    undo,
    redo,
    setPenOptions,
    isDrawing: () => isDrawing.value,
    commit: () => pushHistory()
  };
}
