import { onBeforeUnmount, ref, shallowReactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import ClipboardManager from "@/utils/Clipboard"; // 你已有的剪贴板管理器
import type { ScreenshotAPI, ScreenshotPlugin, ToolType } from "./types";
import { createUseCanvasTool } from "./useCanvasTool"; // 我会在下一节给出文件

/**
 * useScreenshot - 主 Hook：负责截屏流程、画布初始化、选区、放大镜、按钮组、插件管理
 *
 * 说明：
 * - 这个 Hook 负责管理三个 canvas 层（img/mask/draw）以及放大镜 canvas
 * - 提供对外 API：start / confirm / cancel / setTool / undo / redo / registerPlugin
 * - 通过插件接口允许扩展（插件可订阅生命周期事件或添加工具）
 *
 * 使用：在组件 onMounted 中调用 start() 即可初始化并截图
 */

export function useScreenshot() {
  // DOM refs（组件层需要将 DOM ref 传入或直接在组件使用这些 ref）
  const canvasBox = ref<HTMLElement | null>(null);
  const imgCanvas = ref<HTMLCanvasElement | null>(null);
  const maskCanvas = ref<HTMLCanvasElement | null>(null);
  const drawCanvas = ref<HTMLCanvasElement | null>(null);
  const magnifier = ref<HTMLElement | null>(null);
  const magnifierCanvas = ref<HTMLCanvasElement | null>(null);
  const buttonGroup = ref<HTMLElement | null>(null);

  // canvas context
  const imgCtx = ref<CanvasRenderingContext2D | null>(null);
  const maskCtx = ref<CanvasRenderingContext2D | null>(null);
  const drawCtx = ref<CanvasRenderingContext2D | null>(null);
  const magnifierCtx = ref<CanvasRenderingContext2D | null>(null);

  // 状态与配置
  const state = shallowReactive({
    // 选区信息（以屏幕像素为单位，注意 scaleFactor）
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    width: 0,
    height: 0,
    isDrawing: false,
    isMoving: false,
    hasMoved: false,
    scaleX: 1, // scaleFactor
    scaleY: 1,
    showButtonGroup: false,
    buttonStyle: { width: 700, height: 40 },
    currentTool: "",

    // 用于移动选区时记录鼠标相对于选区左上角的偏移
    moveOffsetX: 0,
    moveOffsetY: 0
  });

  // 放大镜配置
  const magnifierConfig = {
    size: 150,
    zoom: 3
  };

  // 截图原图（Image 元素）
  let screenshotImage: HTMLImageElement | null = null;
  // 图像数据缓存（如果需要快速导出）
  let screenshotBlobBuffer: Uint8Array | null = null;

  // 插件系统
  const plugins: ScreenshotPlugin[] = [];

  // 绘图工具 Hook（在下面会引入 createUseCanvasTool）
  const canvasTool = createUseCanvasTool(
    () => drawCanvas.value,
    () => drawCtx.value,
    () => imgCtx.value,
    state
  );

  // --- 辅助方法：触发插件钩子 ---
  function emitPluginEvent<K extends keyof ScreenshotPlugin>(hook: K, ...args: any[]) {
    for (const p of plugins) {
      const fn = (p as any)[hook];
      if (typeof fn === "function") {
        try {
          fn(...args);
        } catch (e) {
          // 插件运行错误不要影响主流程
          console.error("[screenshot][plugin error]", e);
        }
      }
    }
  }

  // --- 初始化画布尺寸与上下文 ---
  async function initCanvases() {
    if (!imgCanvas.value || !maskCanvas.value || !drawCanvas.value || !magnifierCanvas.value) return;

    // 使用屏幕尺寸 * devicePixelRatio 保证在高 DPI 下清晰
    const factor = window.devicePixelRatio || 1 || (await getCurrentWebviewWindow().scaleFactor());
    state.scaleX = factor;
    state.scaleY = factor;

    const canvasW = Math.round(screen.width * factor);
    const canvasH = Math.round(screen.height * factor);

    // 设置画布 size（像素大小）并使用 css 100% 来适配屏幕显示
    imgCanvas.value.width = canvasW;
    imgCanvas.value.height = canvasH;
    maskCanvas.value.width = canvasW;
    maskCanvas.value.height = canvasH;
    drawCanvas.value.width = canvasW;
    drawCanvas.value.height = canvasH;

    // contexts
    imgCtx.value = imgCanvas.value.getContext("2d");
    maskCtx.value = maskCanvas.value.getContext("2d");
    drawCtx.value = drawCanvas.value.getContext("2d", { willReadFrequently: true });
    magnifierCtx.value = magnifierCanvas.value.getContext("2d", { willReadFrequently: true });

    // 初始化放大镜尺寸
    magnifierCanvas.value.width = magnifierConfig.size;
    magnifierCanvas.value.height = magnifierConfig.size;
  }

  // --- 发起本地截屏（依赖 Tauri 的 screenshot 命令） ---
  async function captureFullScreen() {
    const pos: any = await invoke("get_mouse_position"); // 你现有的 native 调用
    const factor = state.scaleX || (await getCurrentWebviewWindow().scaleFactor());
    const canvasW = Math.round(screen.width * factor);
    const canvasH = Math.round(screen.height * factor);

    const config = {
      x: `${pos[0]}`,
      y: `${pos[1]}`,
      width: `${canvasW}`,
      height: `${canvasH}`
    };
    const base64 = await invoke<string>("screenshot", config);

    // 将 base64 转成 Image
    screenshotImage = new Image();
    screenshotImage.src = `data:image/png;base64,${base64}`;
    screenshotImage.onload = () => {
      imgCtx.value?.drawImage(screenshotImage as any, 0, 0, canvasW, canvasH);

      // 默认绘制全屏蒙版
      drawMask();

      // 绘制全屏绿色边框
      drawRectangle(0, 0, canvasW, canvasH, 1);

      emitPluginEvent("onCapture", { width: canvasW, height: canvasH, image: screenshotImage });
    };
    // 可把二进制 buffer 缓存起来（用于导出）
    try {
      const binary: Uint8Array = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); // 浏览器端转换
      screenshotBlobBuffer = binary;
    } catch (e) {
      screenshotBlobBuffer = null;
    }
  }

  // --- 绘制蒙版（遮罩层） ---
  function drawMask() {
    if (!maskCtx.value || !maskCanvas.value) return;
    maskCtx.value.clearRect(0, 0, maskCanvas.value.width, maskCanvas.value.height);
    maskCtx.value.fillStyle = "rgba(0,0,0,0.4)";
    maskCtx.value.fillRect(0, 0, maskCanvas.value.width, maskCanvas.value.height);
  }

  /**
   * 绘制矩形
   */
  function drawRectangle(x: number, y: number, width: number, height: number, lineWidth = 1) {
    if (!maskCtx.value) return;
    maskCtx.value.strokeStyle = "#00FF00";
    maskCtx.value.lineWidth = lineWidth;
    maskCtx.value.strokeRect(x, y, width, height);
  }

  // --- 选区绘制与尺寸文本 ---
  function drawSelectionRect(x: number, y: number, w: number, h: number, lineWidth = 1) {
    if (!maskCtx.value) return;
    maskCtx.value.strokeStyle = "#00FF00";
    maskCtx.value.lineWidth = lineWidth;
    maskCtx.value.strokeRect(x, y, w, h);
    // 选区尺寸
    drawSizeText(x, y, w, h);
  }

  /**
   * 绘制矩形尺寸文本
   */
  function drawSizeText(x: number, y: number, w: number, h: number) {
    if (!maskCtx.value) return;
    // 尺寸文本
    const roundedW = Math.round(Math.abs(w));
    const roundedH = Math.round(Math.abs(h));
    const sizeText = `${roundedW} x ${roundedH}`;
    maskCtx.value.font = "14px Arial";
    maskCtx.value.fillStyle = "white";
    maskCtx.value.imageSmoothingEnabled = true;
    maskCtx.value.imageSmoothingQuality = "high";
    const textX = w >= 0 ? x : x + w;
    const textY = h >= 0 ? y : y + h;
    maskCtx.value.fillText(sizeText, textX + 5, Math.max(16, textY - 8)); // 在矩形左上角并稍微偏移的位置绘制文本
  }

  // --- 放大镜绘制（在 mousemove 中调用） ---
  function drawMagnifier(mouseX: number, mouseY: number) {
    if (!magnifierCtx.value || !imgCanvas.value) return;

    // const canvasW = imgCanvas.value.width;
    // const canvasH = imgCanvas.value.height;

    // 以 devicePixelRatio 为基础计算放大区域
    const factor = state.scaleX || window.devicePixelRatio || 1;
    const magSize = magnifierConfig.size;
    const zoom = magnifierConfig.zoom;

    const sx = Math.max(0, mouseX * factor - magSize / (2 * zoom));
    const sy = Math.max(0, mouseY * factor - magSize / (2 * zoom));
    const sWidth = Math.min(imgCanvas.value.width - sx, magSize / zoom);
    const sHeight = Math.min(imgCanvas.value.height - sy, magSize / zoom);

    magnifierCtx.value.clearRect(0, 0, magSize, magSize);
    magnifierCtx.value.drawImage(imgCanvas.value, sx, sy, sWidth, sHeight, 0, 0, magSize, magSize);
  }

  // --- 事件处理：mask canvas 鼠标事件（选区绘制/移动/完成） ---
  function handleMaskMouseDown(e: MouseEvent) {
    // 如果绘图工具处于绘制状态则让绘图 hook 处理
    if (canvasTool.isDrawing()) return;

    // 鼠标位置（像素级，考虑 scale）
    const offsetX = e.offsetX * state.scaleX;
    const offsetY = e.offsetY * state.scaleY;

    // 判断是否在已经选好的矩形内 => 进入移动
    if (isInSelection(offsetX, offsetY)) {
      state.isMoving = true;
      state.showButtonGroup = false;

      // 记录鼠标相对于选区左上角的偏移，避免跳动（选区可能是任意方向绘制）
      const minX = Math.min(state.startX, state.endX);
      const minY = Math.min(state.startY, state.endY);

      state.moveOffsetX = offsetX - minX;
      state.moveOffsetY = offsetY - minY;

      // 设置鼠标样式为移动（抓手）
      if (maskCanvas?.value) (maskCanvas.value as HTMLCanvasElement).style.cursor = "grab";

      emitPluginEvent("onStartMove", state);
      return;
    }

    // 否则开始新的绘制
    if (state.hasMoved) {
      // 如果已经平移过，不允许再次重新绘制（和你原逻辑一致）
      return;
    }

    state.startX = offsetX;
    state.startY = offsetY;
    state.isDrawing = true;
    emitPluginEvent("onStartDraw", state);
  }

  function handleMaskMouseMove(e: MouseEvent) {
    // 如果绘图工具在绘制阶段则绘图 hook 处理
    if (canvasTool.isDrawing()) return;

    // 放大镜跟随（保持原逻辑）
    handleMagnifierMove(e);

    const offsetX = e.offsetX * state.scaleX;
    const offsetY = e.offsetY * state.scaleY;

    // 绘制新选区（正在拖框）
    if (state.isDrawing) {
      const w = offsetX - state.startX;
      const h = offsetY - state.startY;
      drawMask();
      maskCtx.value!.clearRect(state.startX, state.startY, w, h);
      drawSelectionRect(state.startX, state.startY, w, h);
    }

    // 更新鼠标样式：如果在选区内显示 move，否则默认
    if (isInSelection(offsetX, offsetY)) {
      if (maskCanvas?.value) (maskCanvas.value as HTMLCanvasElement).style.cursor = "move";
    } else {
      if (maskCanvas?.value) (maskCanvas.value as HTMLCanvasElement).style.cursor = "default";
    }

    // 选区移动：使用鼠标偏移量控制选区左上角，避免飘移
    if (state.isMoving) {
      const canvasW = (maskCanvas.value as HTMLCanvasElement).width;
      const canvasH = (maskCanvas.value as HTMLCanvasElement).height;

      // 当前选区宽高（使用已记录的 width/height，若为0可从 start/end 计算）
      const selW = state.width || Math.abs(state.endX - state.startX);
      const selH = state.height || Math.abs(state.endY - state.startY);

      // 计算新的左上角：mouse - moveOffset
      let newStartX = offsetX - state.moveOffsetX;
      let newStartY = offsetY - state.moveOffsetY;

      // 边界约束，避免选区超出画布边界
      newStartX = clamp(newStartX, 0, Math.max(0, canvasW - selW));
      newStartY = clamp(newStartY, 0, Math.max(0, canvasH - selH));

      const newEndX = newStartX + selW;
      const newEndY = newStartY + selH;

      // 标记为已移动，减少不必要重绘
      state.hasMoved = true;

      // 只在位置变化时重绘
      if (newStartX !== state.startX || newStartY !== state.startY) {
        drawMask();
        maskCtx.value!.clearRect(newStartX, newStartY, selW, selH);
        drawSelectionRect(newStartX, newStartY, selW, selH);
      }

      // 更新状态（注意：这里我们用 startX/startY 表示左上角）
      state.startX = newStartX;
      state.startY = newStartY;
      state.endX = newEndX;
      state.endY = newEndY;

      emitPluginEvent("onMove", state);

      // 更新按钮组位置（可以适当节流，如果频繁调用你可以改为 requestAnimationFrame）
      updateButtonGroupPosition();
    }
  }

  // 鼠标抬起：结束绘制或移动
  function handleMaskMouseUp(e: MouseEvent) {
    if (state.isDrawing) {
      state.endX = e.offsetX * state.scaleX;
      state.endY = e.offsetY * state.scaleY;
      state.isDrawing = false;

      state.width = Math.abs(state.endX - state.startX);
      state.height = Math.abs(state.endY - state.startY);

      if (state.width > 5 && state.height > 5) {
        updateButtonGroupPosition();
        state.showButtonGroup = true;
      }

      emitPluginEvent("onEndDraw", state);
    }

    if (state.isMoving) {
      state.isMoving = false;
      // 清理偏移（可选）
      state.moveOffsetX = 0;
      state.moveOffsetY = 0;

      updateButtonGroupPosition();
      state.showButtonGroup = true;
      emitPluginEvent("onEndMove", state);
    }

    if (maskCanvas?.value) (maskCanvas.value as HTMLCanvasElement).style.cursor = "default";
  }

  // 辅助：clamp 函数（可放到模块顶部复用）
  function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v));
  }

  // --- 判断点是否在选区内（传入屏幕像素） ---
  function isInSelection(x: number, y: number) {
    const minX = Math.min(state.startX, state.endX);
    const maxX = Math.max(state.startX, state.endX);
    const minY = Math.min(state.startY, state.endY);
    const maxY = Math.max(state.startY, state.endY);
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  // --- 计算按钮组位置（以 CSS px 单位：把内部坐标除以 scale） ---
  function updateButtonGroupPosition() {
    if (!buttonGroup.value) return;
    const { scaleX, scaleY, startX, startY, endX, endY } = state;
    const minX = Math.min(startX, endX) / scaleX;
    const minY = Math.min(startY, endY) / scaleY;
    const maxX = Math.max(startX, endX) / scaleX;
    const maxY = Math.max(startY, endY) / scaleY;

    const groupH = state.buttonStyle.height;
    const groupW = state.buttonStyle.width;
    const availableH = window.innerHeight;
    const availableW = window.innerWidth;

    let topPos = maxY + 10 + groupH > availableH ? minY - 10 - groupH : maxY + 10;
    let leftPos = maxX + groupW > availableW ? maxX - groupW : minX;

    if (Math.abs(maxY - minY) + groupH + 10 > window.innerHeight) {
      topPos = window.innerHeight - groupH - 10;
    }

    buttonGroup.value.style.top = `${Math.max(0, topPos)}px`;
    buttonGroup.value.style.left = `${Math.max(0, leftPos)}px`;
  }

  // --- 放大镜位置更新 ---
  function handleMagnifierMove(e: MouseEvent) {
    const offsetX = e.offsetX;
    const offsetY = e.offsetY;
    if (!magnifier.value) return;

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    let left = offsetX + 20;
    let top = offsetY + 20;
    if (left + magnifierConfig.size > winW) left = winW - magnifierConfig.size;
    if (top + magnifierConfig.size > winH) top = winH - magnifierConfig.size;

    magnifier.value.style.left = `${left}px`;
    magnifier.value.style.top = `${top}px`;

    // 如果按钮组显示 或 绘图正在进行 => 隐藏放大镜
    const shouldHideMagnifier = state.showButtonGroup || canvasTool.isDrawing();
    const desiredDisplay = shouldHideMagnifier ? "none" : "block";

    // 仅在显示状态发生变化时修改 DOM，减少重绘
    if ((magnifier.value as HTMLElement).style.display !== desiredDisplay) {
      (magnifier.value as HTMLElement).style.display = desiredDisplay;
    }

    // 如果不隐藏则绘制放大镜内容
    if (!shouldHideMagnifier) {
      drawMagnifier(offsetX, offsetY);
    }
  }

  // --- 确认选区：裁剪并复制到剪贴板（或触发插件保存） ---
  async function confirmSelection() {
    // 计算裁剪区域
    const rectX = Math.min(state.startX, state.endX);
    const rectY = Math.min(state.startY, state.endY);
    const w = Math.abs(state.endX - state.startX);
    const h = Math.abs(state.endY - state.startY);
    if (!imgCtx.value) return;

    // 先把 drawCanvas 绘制到 imgCanvas（包含标注）
    imgCtx.value.save();
    imgCtx.value.scale(1, 1); // 已经在像素级别
    imgCtx.value.drawImage(drawCanvas.value as HTMLCanvasElement, 0, 0);
    imgCtx.value.restore();

    // 临时 canvas 裁剪输出
    const offCanvas = document.createElement("canvas");
    offCanvas.width = w;
    offCanvas.height = h;
    const offCtx = offCanvas.getContext("2d");
    if (!offCtx) return;

    // 注意：state 内部是“像素级”，所以直接用 rectX/rectY/w/h
    offCtx.drawImage(imgCanvas.value as HTMLCanvasElement, rectX, rectY, w, h, 0, 0, w, h);

    offCanvas.toBlob(async blob => {
      if (!blob) return;
      const array = await blob.arrayBuffer();
      const uint8 = new Uint8Array(array);

      // 可通过插件拦截保存行为
      const pluginHandled = await Promise.all(
        plugins.map(p => (p.onExport ? p.onExport({ blob, uint8, width: w, height: h }) : Promise.resolve(false)))
      );
      const handled = pluginHandled.some(Boolean);

      // 如果插件没有处理，则默认复制到剪贴板并关闭截图
      if (!handled) {
        await ClipboardManager.writeImage(uint8);
        cancelSelection();
      }
    }, "image/png");
  }

  // --- 取消选区：清理并关闭窗口 ---
  function cancelSelection() {
    // 清空 canvas 引用（释放资源）
    drawCtx.value?.clearRect(0, 0, drawCanvas.value!.width, drawCanvas.value!.height);
    maskCtx.value?.clearRect(0, 0, maskCanvas.value!.width, maskCanvas.value!.height);
    imgCtx.value?.clearRect(0, 0, imgCanvas.value!.width, imgCanvas.value!.height);

    screenshotImage = null;
    screenshotBlobBuffer = null;

    // 隐藏放大镜 & 按钮
    if (magnifier.value) magnifier.value.style.display = "none";
    state.showButtonGroup = false;

    emitPluginEvent("onCancel", state);

    // 关闭窗口（Tauri）
    try {
      const w = getCurrentWebviewWindow();
      w.close();
    } catch (e) {
      // ignore
      console.log("close window failed", e);
    }
  }

  // --- 外部 API：设置当前绘图工具 / 撤销 / 重做 / 注册插件 / 启动截屏 ---
  function setTool(tool: ToolType) {
    maskCanvas.value?.removeEventListener("mousedown", handleMaskMouseDown);
    maskCanvas.value?.removeEventListener("mousemove", handleMaskMouseMove);
    maskCanvas.value?.removeEventListener("mouseup", handleMaskMouseUp);
    state.currentTool = tool;
    canvasTool.setTool(tool);
  }

  function undo() {
    state.currentTool = "";
    canvasTool.undo();
  }

  function redo() {
    state.currentTool = "";
    canvasTool.redo();
  }

  function registerPlugin(plugin: ScreenshotPlugin) {
    plugins.push(plugin);
    // 如果插件有 onRegister，调用之
    if (plugin.onRegister) {
      try {
        plugin.onRegister({ api: publicAPI });
      } catch (e) {
        console.warn("[screenshot] plugin onRegister fail", e);
      }
    }
  }

  // 启动截屏（初始化 + 进行截图）
  async function start() {
    await initCanvases();
    await captureFullScreen();

    // 挂载事件监听（mask canvas 上）
    maskCanvas.value?.addEventListener("mousedown", handleMaskMouseDown);
    maskCanvas.value?.addEventListener("mousemove", handleMaskMouseMove);
    maskCanvas.value?.addEventListener("mouseup", handleMaskMouseUp);

    // 注册键盘快捷（esc 关闭等）可以在插件中注册或在组件里使用 useGlobalShortcut
    emitPluginEvent("onStart", state);
  }

  // 清理
  function destroy() {
    // 移除事件
    maskCanvas.value?.removeEventListener("mousedown", handleMaskMouseDown);
    maskCanvas.value?.removeEventListener("mousemove", handleMaskMouseMove);
    maskCanvas.value?.removeEventListener("mouseup", handleMaskMouseUp);
    canvasTool.stopListen();
    emitPluginEvent("onDestroy", state);
  }

  onBeforeUnmount(() => {
    destroy();
  });

  // 对外暴露接口与 refs
  const publicAPI: ScreenshotAPI = {
    refs: {
      canvasBox,
      imgCanvas,
      maskCanvas,
      drawCanvas,
      magnifier,
      magnifierCanvas,
      buttonGroup
    },
    state,
    start,
    confirmSelection,
    cancelSelection,
    setTool,
    undo,
    redo,
    registerPlugin,
    setPenOptions: canvasTool.setPenOptions
  };

  return publicAPI;
}
