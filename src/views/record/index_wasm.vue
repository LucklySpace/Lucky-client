<template>
  <div ref="overlayRef" aria-hidden="false" class="overlay">
    <!-- canvas 用于绘制四角指示器（pointer-events: none）-->
    <canvas ref="canvasRef" class="corner-canvas"></canvas>

    <!-- 左上计时 （pointer-events: none）-->
    <div v-show="isRecording" class="time-badge">
      <svg class="dot" height="12" viewBox="0 0 24 24" width="12">
        <circle cx="12" cy="12" fill="#ff4d4f" r="6" />
      </svg>
      <span class="time">{{ formattedTime }}</span>
    </div>

    <!-- 右下控制面板（可交互）-->
    <div ref="controlsRef" class="control-panel" @mousedown="startDrag" @click.stop>
      <button :disabled="isRecording || loading" class="btn start" @click="handleStart">
        <span v-if="!loading">{{ $t("chat.toolbar.recorder.start") }}</span>
        <span v-else>{{ $t("chat.toolbar.recorder.recording") }}</span>
      </button>
      <button :disabled="!isRecording" class="btn stop" @click="handleStop">
        {{ $t("chat.toolbar.recorder.stop") }}
      </button>
      <button class="btn cancel" @click="handleCancel">{{ $t("chat.toolbar.recorder.cancel") }}</button>

      <button :disabled="!downloadUrl" class="btn download" @click="handleDownload">
        {{ $t("chat.toolbar.recorder.save") }}
      </button>
    </div>

    <!-- 通知（短信息） -->
    <div v-show="showError" class="toast error" @click="showError = false">{{ errorMessage }}</div>
    <div v-show="showStatus" class="toast status">{{ statusMessage }}</div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
  import { useFFmpeg } from "@/hooks/useFFmpeg_wasm"; // 假设你的 hook 保持原接口
  import { CloseRecordWindow } from "@/windows/record";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, UnlistenFn } from "@tauri-apps/api/event";
  import { useI18n } from "vue-i18n";

  const { startScreenRecord, stopScreenRecord, cancelScreenRecord, isRecording } = useFFmpeg({ log: false });

  // refs
  const overlayRef = ref<HTMLElement | null>(null);
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const controlsRef = ref<HTMLElement | null>(null);

  // 当前窗口
  const appWindow = getCurrentWindow();

  const { t } = useI18n();

  // 鼠标监听
  let unlistenMouse: UnlistenFn | null;

  // UI 状态
  const loading = ref(false);
  const errorMessage = ref("");
  const statusMessage = ref("");
  const showError = ref(false);
  const showStatus = ref(false);
  const isPointButton = ref(false);

  // 下载
  const downloadUrl = ref<string | null>(null);
  const downloadName = ref("record.mp4");

  // 计时器（ms）
  const elapsed = ref(0);
  let startTs = 0;
  let tickTimer: number | null = null;

  // canvas 绘制 RAF id
  let rafId: number | null = null;
  let lastDraw = 0;

  // 拖动状态
  const isDragging = ref(false);
  let initialMouseX = 0;
  let initialMouseY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  // 格式化时间 hh:mm:ss
  const formattedTime = computed(() => {
    const ms = elapsed.value || 0;
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  });

  // 简单 show helper
  function showErrorMessage(msg: string, ttl = 4000) {
    errorMessage.value = msg;
    showError.value = true;
    setTimeout(() => (showError.value = false), ttl);
  }

  function showStatusMsg(msg: string, ttl = 2000) {
    statusMessage.value = msg;
    showStatus.value = true;
    setTimeout(() => (showStatus.value = false), ttl);
  }

  // 绘制四角（轻量）—— 每次 requestAnimationFrame 验证节奏
  function drawCorners() {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const color = isRecording.value ? "#ff4d4f" : "#0fd27a";
    const len = Math.max(12, Math.min(48, Math.floor(Math.min(w, h) * 0.05)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    // 4 corners
    ctx.beginPath();
    ctx.moveTo(8, len);
    ctx.lineTo(8, 8);
    ctx.lineTo(len, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 8, len);
    ctx.lineTo(w - 8, 8);
    ctx.lineTo(w - len, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, h - len);
    ctx.lineTo(8, h - 8);
    ctx.lineTo(len, h - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 8, h - len);
    ctx.lineTo(w - 8, h - 8);
    ctx.lineTo(w - len, h - 8);
    ctx.stroke();

    ctx.restore();
  }

  // 控制绘制节奏：录制时更频繁，否则慢速
  function scheduleDraw() {
    const now = Date.now();
    const interval = isRecording.value ? 200 : 1000;
    if (now - lastDraw < interval) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      drawCorners();
      lastDraw = Date.now();
      rafId = null;
    });
  }

  // 计时器 start/stop helpers
  function startTimer() {
    startTs = Date.now();
    tickTimer = window.setInterval(() => {
      elapsed.value = Date.now() - startTs;
    }, 200);
  }

  function stopTimer() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    elapsed.value = 0;
  }

  // 启动录制
  async function handleStart() {
    if (isRecording.value) return;
    loading.value = true;
    showStatusMsg(t("chat.toolbar.recorder.status.request_permission"));
    try {
      await startScreenRecord({ mimeType: "video/mp4;codecs=vp9", bitsPerSecond: 2_500_000, includeAudio: false });
      // hook 的 isRecording 应该切换为 true，watch 将启动 timer
      showStatusMsg(t("chat.toolbar.recorder.status.started"));
      startMousePoller();
    } catch (e: any) {
      showErrorMessage(e?.message || t("chat.toolbar.recorder.errors.start_failed"));
    } finally {
      loading.value = false;
    }
  }

  // 停止录制
  async function handleStop() {
    if (!isRecording.value) return;
    showStatusMsg(t("chat.toolbar.recorder.status.stopping"));
    try {
      const res = await stopScreenRecord({
        transcodeToMp4: false, ffmpegProgressCb: () => {
        }
      });
      // res 里应包含 webmBlob 或 mp4Blob（由 hook 提供）
      const blob = (res && (res.webmBlob || res.mp4Blob)) ?? null;
      if (blob) {
        if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value);
        downloadUrl.value = URL.createObjectURL(blob);
        downloadName.value = `screen_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "")}.mp4`;
        showStatusMsg(t("chat.toolbar.recorder.status.completed"));
      } else {
        showErrorMessage(t("chat.toolbar.recorder.errors.not_generated"));
      }
      stopMousePoller();
    } catch (e: any) {
      showErrorMessage(e?.message || t("chat.toolbar.recorder.errors.stop_failed"));
    }
  }

  // 取消录制
  function handleCancel() {
    try {
      cancelScreenRecord();
      if (downloadUrl.value) {
        URL.revokeObjectURL(downloadUrl.value);
        downloadUrl.value = null;
      }
      showStatusMsg(t("chat.toolbar.recorder.status.canceled"));
      stopTimer();
      stopMousePoller();
      CloseRecordWindow();
    } catch (e) {
      showErrorMessage(t("chat.toolbar.recorder.errors.cancel_failed"));
    }
  }

  // 点击下载后清理 URL（避免泄漏）
  function handleDownload() {
    setTimeout(() => {
      if (downloadUrl.value) {
        URL.revokeObjectURL(downloadUrl.value);
        downloadUrl.value = null;
      }
      showStatusMsg(t("chat.toolbar.recorder.status.download_done"));
    }, 500);
  }

  // 键盘快捷（Escape / Space / Ctrl+R）
  function onKeydown(e: KeyboardEvent) {
    if (e.code === "Escape") {
      if (isRecording.value) handleCancel();
      else window.close?.();
    } else if (e.code === "Space") {
      e.preventDefault();
      if (isRecording.value) handleStop();
      else handleStart();
    } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyR") {
      e.preventDefault();
      if (!isRecording.value) handleStart();
    }
  }

  /**
   * isPointInElement
   * - 判断（clientX, clientY）是否落在元素的 bounding rect 内（包含 margin）
   */
  function isPointInElement(x: number, y: number, el: HTMLElement | null) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /**
   * mousemove 处理器（节流 via rAF）
   * - 只在位置变化跨越边界（进入/离开按钮区域）时调用 setIgnoreCursorEventsHelper 切换
   */
  function startMousePoller() {
    requestAnimationFrame(async () => {
      await invoke("control_mouse_poller", {
        start: true,
        interval_ms: 80,
        windowLabel: null,
        minMove: 2,
        throttleMs: 100
      });
      const unlisten = await listen("mouse:position", (e: any) => {
        const p = e.payload;
        console.log("screen pos", p);
        if (p.x && p.y) {
          console.log(`mouse move  x:${p.x} y:${p.y}`);
          // 判断鼠标是否在 control-panel 内
          const inside = isPointInElement(p.x, p.y, controlsRef.value);
          if (inside !== isPointButton.value) {
            isPointButton.value = inside;
            // 如果在按钮内 -> 禁止窗口忽略鼠标（允许事件），否则开启忽略（穿透）
            setIgnoreCursorEventsHelper(!inside).catch(() => {
            });
          }
        }
        // optionally convert to client using outerPosition
      });
      unlistenMouse = unlisten;
      await appWindow.setDecorations(false);
    });
  }

  async function stopMousePoller() {
    if (unlistenMouse) {
      unlistenMouse();
      unlistenMouse = null;
    }
    await invoke("control_mouse_poller", { start: false });
    setIgnoreCursorEventsHelper(false);
  }

  /**
   * setIgnoreCursorEventsHelper
   * - 安全调用 Tauri 的 setIgnoreCursorEvents
   * - 避免重复调用（只有状态变化才调用）
   */
  async function setIgnoreCursorEventsHelper(ignore: boolean) {
    return appWindow.setIgnoreCursorEvents(ignore);
  }

  // 拖动功能
  function startDrag(e: MouseEvent) {
    // 如果点击在按钮上，不触发拖动
    if (e.target && (e.target as HTMLElement).tagName === "BUTTON") {
      return;
    }
    isDragging.value = true;
    initialMouseX = e.clientX;
    initialMouseY = e.clientY;
    const rect = controlsRef.value!.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    e.preventDefault();
  }

  function onDrag(e: MouseEvent) {
    if (!isDragging.value || !controlsRef.value) return;
    const deltaX = e.clientX - initialMouseX;
    const deltaY = e.clientY - initialMouseY;
    // 边界限制：不超出屏幕
    const newLeft = Math.max(0, Math.min(window.innerWidth - controlsRef.value.offsetWidth, initialLeft + deltaX));
    const newTop = Math.max(0, Math.min(window.innerHeight - controlsRef.value.offsetHeight, initialTop + deltaY));
    controlsRef.value.style.left = `${newLeft}px`;
    controlsRef.value.style.top = `${newTop}px`;
    controlsRef.value.style.right = "auto";
    controlsRef.value.style.bottom = "auto";
  }

  function stopDrag() {
    isDragging.value = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
  }

  // 监听录制状态，启动/停止定时与绘制
  watch(isRecording, val => {
    if (val) {
      startTimer();
    } else {
      stopTimer();
    }
  });

  // 主挂载/卸载
  onMounted(async () => {
    // 设置初始位置（从 right/bottom 转换为 left/top）
    await nextTick();
    const el = controlsRef.value;
    if (el) {
      const rect = el.getBoundingClientRect();
      el.style.left = `${window.innerWidth - rect.width - 16}px`;
      el.style.top = `${window.innerHeight - rect.height - 16}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
    }

    // 初次绘制并注册事件
    scheduleDraw();
    window.addEventListener("resize", scheduleDraw);
    window.addEventListener("keydown", onKeydown);

    // 周期性绘制（轻量），可以替换为 requestAnimationFrame + smarter throttling
    const tick = () => {
      scheduleDraw();
      setTimeout(tick, 500);
    };
    tick();
  });

  onBeforeUnmount(() => {
    // 清理：停止录制（若需要）、清理定时器、移除监听、释放 url 与 RAF
    try {
      cancelScreenRecord();
    } catch {
    }
    stopTimer();
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener("resize", scheduleDraw);
    window.removeEventListener("keydown", onKeydown);
    if (downloadUrl.value) {
      URL.revokeObjectURL(downloadUrl.value);
      downloadUrl.value = null;
    }
    stopMousePoller();
    // 清理拖动监听（如果存在）
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
  });
</script>

<style lang="scss" scoped>
  /* 基本布局：overlay 本身不可交互，交互元素设 pointer-events: auto */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none; /* 透明部分穿透鼠标 */
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
  }

  /* canvas: 覆盖全屏但不拦截事件 */
  .corner-canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 9999;
  }

  /* 左上计时：不可交互 */
  .time-badge {
    position: fixed;
    left: 16px;
    top: 16px;
    z-index: 10001;
    pointer-events: none;
    display: flex;
    gap: 8px;
    align-items: center;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    padding: 8px 12px;
    border-radius: 10px;
    font-weight: 600;
  }

  /* 右下控制面板：可交互 */
  .control-panel {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 10002;
    pointer-events: auto; /* 使按钮可点击 */
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    padding: 8px;
    border-radius: 8px;

    &:hover {
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
      background: linear-gradient(180deg, rgba(18, 18, 20, 0.85), rgba(12, 12, 14, 0.7));
      cursor: move;
    }
  }

  /* 按钮样式精简 */
  .btn {
    border: none;
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    min-width: 96px;
    backdrop-filter: blur(6px);
    font-weight: 600;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.start {
    background: linear-gradient(135deg, #10b981, #059669);
    color: #fff;
  }

  .btn.stop {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: #fff;
  }

  .btn.cancel {
    background: linear-gradient(135deg, #6b7280, #4b5563);
    color: #fff;
  }

  /* 下载链接 */
  .download {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: #fff;
  }

  /* 通知（简短） */
  .toast {
    position: fixed;
    right: 16px;
    top: 16px;
    z-index: 10003;
    pointer-events: auto;
    color: #fff;
    padding: 10px 14px;
    border-radius: 10px;
    font-weight: 600;
    backdrop-filter: blur(8px);
  }

  .toast.error {
    background: linear-gradient(135deg, #ef4444, #dc2626);
  }

  .toast.status {
    background: linear-gradient(135deg, #10b981, #059669);
  }

  /* 响应式小屏调整 */
  @media (max-width: 480px) {
    .control-panel {
      right: 12px;
      bottom: 12px;
    }
    .btn {
      min-width: 84px;
      padding: 8px 10px;
      font-size: 14px;
    }
    .time-badge {
      left: 12px;
      top: 12px;
      padding: 6px 10px;
      font-size: 13px;
    }
  }
</style>
