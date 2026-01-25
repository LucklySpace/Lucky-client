import { ref, reactive, computed, onMounted, onUnmounted, type Ref } from "vue";

// ==================== 类型定义 ====================

/** OCR 识别结果项 */
export interface OcrResultItem {
  text: string;
  box: [number, number][];  // [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
  confidence?: number;
}

/** 矩形区域 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 选区坐标 */
interface Selection {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** OCR 配置 */
export interface OcrConfig {
  /** 选区容差（像素） */
  tolerance?: number;
  /** 初始缩放级别 */
  initialZoom?: number;
  /** 缩放步长 */
  zoomStep?: number;
  /** 最小缩放 */
  minZoom?: number;
  /** 最大缩放 */
  maxZoom?: number;
  /** 选区填充色 */
  selectionFillColor?: string;
  /** OCR 框颜色 */
  boxStrokeColor?: string;
  /** OCR 框线宽 */
  boxLineWidth?: number;
  /** 自动适应屏幕 */
  autoFitScreen?: boolean;
}

/** OCR 提供者接口（扩展性） */
export interface OcrProvider {
  recognize(file: File): Promise<OcrResultItem[]>;
}

/** Hook 返回类型 */
export interface UseOcrReturn {
  // 状态
  canvasRef: Ref<HTMLCanvasElement | null>;
  zoom: Ref<number>;
  results: Ref<OcrResultItem[]>;
  selectedText: Ref<string>;
  showBoxes: Ref<boolean>;
  isRecognizing: Ref<boolean>;
  imageLoaded: Ref<boolean>;
  // 操作
  loadImage: (source: string | File) => Promise<void>;
  recognize: (file?: File) => Promise<OcrResultItem[]>;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (level: number) => void;
  resetZoom: () => void;
  toggleBoxes: () => void;
  crop: () => Promise<File | null>;
  copyText: () => Promise<boolean>;
  clear: () => void;
  // 事件处理
  onMouseDown: (e: MouseEvent) => void;
  onMouseMove: (e: MouseEvent) => void;
  onMouseUp: (e: MouseEvent) => void;
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: Required<OcrConfig> = {
  tolerance: 2,
  initialZoom: 1,
  zoomStep: 0.1,
  minZoom: 0.1,
  maxZoom: 5,
  selectionFillColor: "rgba(64, 158, 255, 0.3)",
  boxStrokeColor: "#f56c6c",
  boxLineWidth: 2,
  autoFitScreen: true,
};

// ==================== 工具函数 ====================

/** 计算适应屏幕的缩放比例 */
const calcFitZoom = (imgW: number, imgH: number): number => {
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const ratio = Math.min(screenW / imgW, screenH / imgH);
  return ratio > 1 ? 1 : ratio;
};

/** 获取矩形边界 */
const getBounds = (sel: Selection): Rect => {
  const x = Math.min(sel.startX, sel.endX);
  const y = Math.min(sel.startY, sel.endY);
  return {
    x,
    y,
    width: Math.abs(sel.endX - sel.startX),
    height: Math.abs(sel.endY - sel.startY),
  };
};

/** 判断两个矩形是否相交 */
const isIntersect = (r1: Rect, r2: Rect, tolerance: number): boolean => {
  return (
    Math.max(r1.x, r2.x) - Math.min(r1.x + r1.width, r2.x + r2.width) <= tolerance &&
    Math.max(r1.y, r2.y) - Math.min(r1.y + r1.height, r2.y + r2.height) <= tolerance
  );
};

/** Box 转 Rect */
const boxToRect = (box: [number, number][]): Rect => {
  const [p1, , p3] = box;
  return {
    x: p1[0],
    y: p1[1],
    width: p3[0] - p1[0],
    height: p3[1] - p1[1],
  };
};

/** DataURL 转 File */
const dataUrlToFile = (dataUrl: string, filename: string): File => {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
};

// ==================== 默认 OCR 提供者 ====================

/** 创建 HTTP OCR 提供者 */
export const createHttpOcrProvider = (url: string): OcrProvider => ({
  async recognize(file: File): Promise<OcrResultItem[]> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(url, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`OCR request failed: ${res.status}`);
    return res.json();
  },
});

// ==================== 主 Hook ====================

export function useOcr(
  provider: OcrProvider,
  config: OcrConfig = {}
): UseOcrReturn {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // ==================== 状态 ====================
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const zoom = ref(cfg.initialZoom);
  const results = ref<OcrResultItem[]>([]);
  const selectedText = ref("");
  const showBoxes = ref(false);
  const isRecognizing = ref(false);
  const imageLoaded = ref(false);

  // 内部状态
  const image = ref<HTMLImageElement | null>(null);
  const currentFile = ref<File | null>(null);
  const selection = reactive<Selection>({ startX: 0, startY: 0, endX: 0, endY: 0 });
  const isDrawing = ref(false);

  // ==================== Canvas 操作 ====================
  const getCtx = () => canvasRef.value?.getContext("2d") ?? null;

  const draw = () => {
    const ctx = getCtx();
    const img = image.value;
    const canvas = canvasRef.value;
    if (!ctx || !img || !canvas) return;

    const w = img.width * zoom.value;
    const h = img.height * zoom.value;
    canvas.width = w;
    canvas.height = h;

    // 高质量渲染
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);

    // 绘制 OCR 框
    if (showBoxes.value && results.value.length) {
      ctx.strokeStyle = cfg.boxStrokeColor;
      ctx.lineWidth = cfg.boxLineWidth;
      results.value.forEach(({ box }) => {
        const [x1, y1] = box[0];
        const [x2, y2] = box[2];
        ctx.strokeRect(
          x1 * zoom.value,
          y1 * zoom.value,
          (x2 - x1) * zoom.value,
          (y2 - y1) * zoom.value
        );
      });
    }
  };

  const drawSelection = (endX: number, endY: number) => {
    draw();
    const ctx = getCtx();
    if (!ctx) return;

    ctx.fillStyle = cfg.selectionFillColor;
    ctx.fillRect(
      selection.startX * zoom.value,
      selection.startY * zoom.value,
      (endX - selection.startX) * zoom.value,
      (endY - selection.startY) * zoom.value
    );
  };

  // ==================== 图片加载 ====================
  const loadImage = async (source: string | File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        image.value = img;
        imageLoaded.value = true;

        if (cfg.autoFitScreen) {
          zoom.value = calcFitZoom(img.width, img.height);
        }

        draw();
        resolve();
      };

      img.onerror = () => reject(new Error("Failed to load image"));

      if (typeof source === "string") {
        img.src = source;
      } else {
        currentFile.value = source;
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target?.result as string; };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(source);
      }
    });
  };

  // ==================== OCR 识别 ====================
  const recognize = async (file?: File): Promise<OcrResultItem[]> => {
    const targetFile = file || currentFile.value;
    if (!targetFile) throw new Error("No file to recognize");

    isRecognizing.value = true;
    try {
      const res = await provider.recognize(targetFile);
      results.value = res;

      // 如果提供了新文件，加载它
      if (file && file !== currentFile.value) {
        await loadImage(file);
      }

      return res;
    } finally {
      isRecognizing.value = false;
    }
  };

  // ==================== 缩放控制 ====================
  const zoomIn = () => setZoom(zoom.value + cfg.zoomStep);
  const zoomOut = () => setZoom(zoom.value - cfg.zoomStep);

  const setZoom = (level: number) => {
    zoom.value = Math.max(cfg.minZoom, Math.min(cfg.maxZoom, level));
    draw();
  };

  const resetZoom = () => {
    if (image.value && cfg.autoFitScreen) {
      zoom.value = calcFitZoom(image.value.width, image.value.height);
    } else {
      zoom.value = cfg.initialZoom;
    }
    draw();
  };

  // ==================== 功能操作 ====================
  const toggleBoxes = () => {
    showBoxes.value = !showBoxes.value;
    draw();
  };

  const crop = async (): Promise<File | null> => {
    const ctx = getCtx();
    const canvas = canvasRef.value;
    if (!ctx || !canvas) return null;

    const bounds = getBounds(selection);
    if (bounds.width < 1 || bounds.height < 1) return null;

    // 重绘（移除选区）
    isDrawing.value = false;
    draw();

    // 获取裁剪数据
    const imgData = ctx.getImageData(
      bounds.x * zoom.value,
      bounds.y * zoom.value,
      bounds.width * zoom.value,
      bounds.height * zoom.value
    );

    // 创建新 canvas
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = bounds.width * zoom.value;
    tempCanvas.height = bounds.height * zoom.value;
    tempCanvas.getContext("2d")?.putImageData(imgData, 0, 0);

    // 更新图片
    const dataUrl = tempCanvas.toDataURL("image/png");
    const file = dataUrlToFile(dataUrl, "cropped.png");
    currentFile.value = file;
    await loadImage(dataUrl);

    return file;
  };

  const copyText = async (): Promise<boolean> => {
    const text = selectedText.value.trim();
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    }
  };

  const clear = () => {
    results.value = [];
    selectedText.value = "";
    image.value = null;
    currentFile.value = null;
    imageLoaded.value = false;

    const ctx = getCtx();
    const canvas = canvasRef.value;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // ==================== 鼠标事件 ====================
  const onMouseDown = (e: MouseEvent) => {
    selection.startX = e.offsetX / zoom.value;
    selection.startY = e.offsetY / zoom.value;
    isDrawing.value = true;
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDrawing.value) return;
    const x = e.offsetX / zoom.value;
    const y = e.offsetY / zoom.value;
    drawSelection(x, y);
  };

  const onMouseUp = (e: MouseEvent) => {
    if (!isDrawing.value) return;

    selection.endX = e.offsetX / zoom.value;
    selection.endY = e.offsetY / zoom.value;
    isDrawing.value = false;

    // 计算选中的文本
    const bounds = getBounds(selection);
    const selRect: Rect = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };

    const lines = results.value
      .filter(({ box }) => isIntersect(boxToRect(box), selRect, cfg.tolerance))
      .map(({ text }) => text);

    selectedText.value = lines.join("\n");
  };

  // ==================== 键盘快捷键 ====================
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      copyText();
    }
  };

  onMounted(() => window.addEventListener("keydown", handleKeyDown));
  onUnmounted(() => window.removeEventListener("keydown", handleKeyDown));

  // ==================== 返回 ====================
  return {
    // 状态
    canvasRef,
    zoom,
    results,
    selectedText,
    showBoxes,
    isRecognizing,
    imageLoaded,
    // 操作
    loadImage,
    recognize,
    zoomIn,
    zoomOut,
    setZoom,
    resetZoom,
    toggleBoxes,
    crop,
    copyText,
    clear,
    // 事件
    onMouseDown,
    onMouseMove,
    onMouseUp,
  };
}

// ==================== 扩展：拖拽面板 Hook ====================

export interface UseDraggablePanelReturn {
  panelRef: Ref<HTMLElement | null>;
  isDragging: Ref<boolean>;
  onDragStart: (e: MouseEvent) => void;
}

export function useDraggablePanel(): UseDraggablePanelReturn {
  const panelRef = ref<HTMLElement | null>(null);
  const isDragging = ref(false);

  let startX = 0;
  let startY = 0;
  let panelStartX = 0;
  let panelStartY = 0;

  const onDragStart = (e: MouseEvent) => {
    if (!panelRef.value) return;
    isDragging.value = true;
    startX = e.clientX;
    startY = e.clientY;
    panelStartX = panelRef.value.offsetLeft;
    panelStartY = panelRef.value.offsetTop;
  };

  const onDragMove = (e: MouseEvent) => {
    if (!isDragging.value || !panelRef.value) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const panel = panelRef.value;

    let newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, panelStartX + dx));
    let newTop = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, panelStartY + dy));

    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
  };

  const onDragEnd = () => {
    isDragging.value = false;
  };

  onMounted(() => {
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
  });

  onUnmounted(() => {
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
  });

  return { panelRef, isDragging, onDragStart };
}

// ==================== 扩展：自动折叠 Hook ====================

export function useAutoCollapse(delay = 2500) {
  const isCollapsed = ref(true);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const toggle = () => { isCollapsed.value = !isCollapsed.value; };
  const expand = () => { isCollapsed.value = false; };
  const collapse = () => { isCollapsed.value = true; };

  const startTimer = () => {
    timer = setTimeout(collapse, delay);
  };

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  onUnmounted(clearTimer);

  return { isCollapsed, toggle, expand, collapse, startTimer, clearTimer };
}

export default useOcr;

