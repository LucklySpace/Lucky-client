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

      <button v-show="recordedPath" class="btn download" @click="handleSave">
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
  import { useFFmpeg } from "@/hooks/useFFmpeg";
  import { CloseRecordWindow } from "@/windows/record";
  import { useI18n } from "vue-i18n";
  import { save } from "@tauri-apps/plugin-dialog";
  import { copyFile, remove } from "@tauri-apps/plugin-fs";
  import { useDraggable } from "@/hooks/useDraggable";
  import { useMousePoller } from "@/hooks/useMousePoller";

  const { startScreenRecord, stopScreenRecord, cancelScreenRecord, isRecording } = useFFmpeg({ log: false });

  // refs
  const overlayRef = ref<HTMLElement | null>(null);
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const controlsRef = ref<HTMLElement | null>(null);

  // Hooks
  const { startDrag, isDragging } = useDraggable(controlsRef);
  const { startMousePoller, stopMousePoller, isPointButton } = useMousePoller(controlsRef);

  const { t } = useI18n();

  // UI 状态
  const loading = ref(false);
  const errorMessage = ref("");
  const statusMessage = ref("");
  const showError = ref(false);
  const showStatus = ref(false);

  // 下载/保存
  const downloadName = ref("record.mp4");
  const recordedPath = ref<string | null>(null);

  // 计时器（ms）
  const elapsed = ref(0);
  let startTs = 0;
  let tickTimer: number | null = null;

  // canvas 绘制 RAF id
  let rafId: number | null = null;
  let lastDraw = 0;

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
      await startScreenRecord();
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
      const res = await stopScreenRecord();
      if (res && res.path) {
        recordedPath.value = res.path;
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
  async function handleCancel() {
    try {
      await cancelScreenRecord();
      if (recordedPath.value) {
        await remove(recordedPath.value).catch(() => {});
        recordedPath.value = null;
      }
      showStatusMsg(t("chat.toolbar.recorder.status.canceled"));
      stopTimer();
      stopMousePoller();
      CloseRecordWindow();
    } catch (e) {
      showErrorMessage(t("chat.toolbar.recorder.errors.cancel_failed"));
    }
  }

  // 保存录制文件
  async function handleSave() {
    if (!recordedPath.value) return;
    try {
      const path = await save({
        defaultPath: downloadName.value,
        filters: [{
          name: 'Video',
          extensions: ['mp4']
        }]
      });

      if (path) {
        await copyFile(recordedPath.value, path);
        showStatusMsg(t("chat.toolbar.recorder.status.download_done"));

        // 清理并关闭
        await remove(recordedPath.value).catch(() => {});
        recordedPath.value = null;
        
        // 延迟关闭窗口，让用户看到成功消息
        setTimeout(() => {
            CloseRecordWindow();
        }, 1000);
      }
    } catch (e: any) {
      showErrorMessage(e?.message || "Save failed");
    }
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

  onBeforeUnmount(async () => {
    // 清理：停止录制（若需要）、清理定时器、移除监听、释放 url 与 RAF
    try {
      await cancelScreenRecord();
    } catch {
    }
    stopTimer();
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener("resize", scheduleDraw);
    window.removeEventListener("keydown", onKeydown);
    
    if (recordedPath.value) {
      await remove(recordedPath.value).catch(() => {});
      recordedPath.value = null;
    }
    stopMousePoller();
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
