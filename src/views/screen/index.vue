<template>
  <div :ref="refs.canvasBox" class="canvasbox">
    <canvas :ref="refs.imgCanvas" class="img-canvas"></canvas>
    <canvas :ref="refs.maskCanvas" class="mask-canvas"></canvas>
    <canvas :ref="refs.drawCanvas" class="draw-canvas"></canvas>

    <div :ref="refs.magnifier" class="magnifier">
      <canvas :ref="refs.magnifierCanvas"></canvas>
    </div>

    <div v-show="state.showButtonGroup" :ref="refs.buttonGroup" :style="state.buttonStyle" class="button-group">
      <!-- 设置面板 -->
      <div v-if="showPenSettings" class="pen-settings-panel" :style="settingsPanelStyle" @mousedown.stop>
        <div class="sizes">
          <button v-for="s in sizes" :key="s" :class="['size-btn', { active: s === currentSize }]"
            @click="onSelectSize(s)">
            <span :style="{ width: s + 'px', height: s + 'px' }" class="dot"></span>
          </button>
        </div>

        <div class="divider"></div>

        <div class="colors">
          <button v-for="c in palette" :key="c" :aria-label="c"
            :class="['color-swatch', { active: c === currentColor }]" @click="onSelectColor(c)">
            <span :style="{ backgroundColor: c }" class="color-dot"></span>
          </button>

          <div class="custom-color-picker" title="自定义颜色">
            <input type="color" :value="currentColor" @input="onNativeColorChange" />
            <span class="color-dot rainbow"></span>
          </div>
        </div>
      </div>

      <!-- 画笔 -->
      <button :ref="el => setBtnRef('pen', el)" :class="{ active: state.currentTool === 'pen' }"
        :title="$t('components.screen.tools.pen')" @click="handleToolClick('pen')">
        <i class="iconfont icon-24"></i>
      </button>

      <div style="display: flex">
        <!-- 矩形 -->
        <button :ref="el => setBtnRef('rect', el)" :class="{ active: state.currentTool === 'rect' }"
          :title="$t('components.screen.tools.rect')" @click="handleToolClick('rect')">
          <i class="iconfont icon-xingzhuang-juxing"></i>
        </button>

        <!-- 圆形 -->
        <button :ref="el => setBtnRef('circle', el)" :class="{ active: state.currentTool === 'circle' }"
          :title="$t('components.screen.tools.circle')" @click="handleToolClick('circle')">
          <i class="iconfont icon-yuanxing"></i>
        </button>

        <!-- 箭头 -->
        <button :ref="el => setBtnRef('arrow', el)" :class="{ active: state.currentTool === 'arrow' }"
          :title="$t('components.screen.tools.arrow')" @click="handleToolClick('arrow')">
          <i class="iconfont icon-righttop"></i>
        </button>

        <!-- 直线 -->
        <button :ref="el => setBtnRef('line', el)" :class="{ active: state.currentTool === 'line' }"
          :title="$t('components.screen.tools.line')" @click="handleToolClick('line')">
          <i class="iconfont icon-jurassic_line"></i>
        </button>

        <!-- 文本 -->
        <button :ref="el => setBtnRef('text', el)" :class="{ active: state.currentTool === 'text' }"
          :title="$t('components.screen.tools.text')" @click="handleToolClick('text')">
          <i class="iconfont icon-wenben1"></i>
        </button>

        <!-- 马赛克 -->
        <button :ref="el => setBtnRef('mosaic', el)" :class="{ active: state.currentTool === 'mosaic' }"
          :title="$t('components.screen.tools.mosaic')" @click="handleToolClick('mosaic')">
          <i class="iconfont icon-masaike"></i>
        </button>

        <button :title="$t('components.screen.actions.undo')" @click="undo">
          <i class="iconfont icon-chexiao"></i>
        </button>
        <button :title="$t('components.screen.actions.redo')" @click="redo">
          <i class="iconfont icon-chexiao" style="transform: scaleX(-1)"></i>
        </button>
        <button :title="$t('common.actions.cancel')" @click="cancelSelection">
          <i style="color: #ff4d4f;" class="iconfont icon-quxiao"></i>
        </button>
        <button :title="$t('common.actions.complete')" @click="confirmSelection">
          <i  style="color: #67c23a;" class="iconfont icon-wanchengqueding"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useScreenshot } from "./hooks/useScreenshot";

  const { addShortcut } = useGlobalShortcut();
  const { refs, state, start, confirmSelection, cancelSelection, setTool, undo, redo, setPenOptions } = useScreenshot();

  const showPenSettings = ref(false);

  // 存储所有工具按钮的 DOM 引用
  const toolBtnRefs = ref<Record<string, HTMLElement>>({});

  // 收集 Ref 的辅助函数
  const setBtnRef = (toolName: string, el: any) => {
    if (el) toolBtnRefs.value[toolName] = el as HTMLElement;
  };

  // 面板位置样式
  const settingsPanelStyle = reactive({
    left: "0px",
    top: "100%",
    marginTop: "8px"
  });

  const palette = ref<string[]>(["#ff0000", "#ffff00", "#0000ff", "#ffffff", "#000000", "#00ff00"]);
  const sizes = ref<number[]>([4, 8, 12]);
  const currentColor = ref<string>("red");
  const currentSize = ref(8);

  let unlistenDispose: (() => void) | null = null;

  // 统一处理工具点击
  function handleToolClick(toolName: string) {
    if (state.currentTool === toolName) {
      // 如果点击的是当前已激活的工具，切换面板显隐
      showPenSettings.value = !showPenSettings.value;
    } else {
      // 如果点击的是新工具，激活它并强制显示面板
      setTool(toolName as any);
      showPenSettings.value = true;
    }
    // 计算位置
    updatePanelPosition(toolName);
  }

  // 5. 计算面板位置
  function updatePanelPosition(toolName: string) {
    nextTick(() => {
      const btn = toolBtnRefs.value[toolName];
      if (btn) {
        //动态计算面板位置
        const leftPos = btn.offsetLeft - 4;
        settingsPanelStyle.left = `${leftPos}px`;
      }
    });
  }

  // 监听工具变化
  watch(
    () => state.currentTool,
    newTool => {
      // 定义哪些工具需要显示配置面板
      const toolsWithSettings = ["pen", "rect", "circle", "arrow", "line", "text", "mosaic"];

      if (toolsWithSettings.includes(newTool)) {
        //只要切换到这些工具，就更新位置
        updatePanelPosition(newTool);
      } else {
        // 切换到非绘图工具（如无操作状态）时关闭面板
        showPenSettings.value = false;
      }
    }
  );

  function onSelectColor(c: string) {
    // 选中颜色时保持面板打开
    showPenSettings.value = true;
    setPenOptions({ color: c });
    currentColor.value = c;
  }

  function onNativeColorChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = target.value;
    currentColor.value = val;
    setPenOptions({ color: val });
  }

  function onSelectSize(s: number) {
    setPenOptions?.({ size: s } as any);
    if (currentSize) currentSize.value = s;
  }

  onMounted(async () => {
    await start();

    // 初始化位置（假设默认为 pen）
    if (state.currentTool === "pen") {
      updatePanelPosition("pen");
    }

    addShortcut({
      name: "esc",
      combination: "Esc",
      handler: () => {
        getCurrentWindow().close();
      }
    });
  });

  onMounted(async () => {
    unlistenDispose = await listen("screen:dispose", async () => {
      try {
        await getCurrentWebviewWindow().close();
      } catch {}
    });
  });

  onBeforeUnmount(() => {
    try {
      unlistenDispose?.();
    } catch {}
  });
</script>

<style lang="scss" scoped>
body .canvasbox {
  width: 100vw;
  height: 100vh;
  position: relative;
  background-color: transparent !important;
}

canvas {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

.img-canvas {
  z-index: 0;
}

.mask-canvas {
  z-index: 1;
}

.draw-canvas {
  z-index: 1;
  pointer-events: none;
}

.magnifier {
  position: absolute;
  pointer-events: none;
  width: 150px;
  height: 150px;
  border: 2px solid #ccc;
  border-radius: 50%;
  overflow: hidden;
  display: none;
  z-index: 999;
}

.magnifier canvas {
  display: block;
  z-index: 2;
}

/* 工具栏样式 */
.button-group {
  position: absolute;
  display: flex;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 6px;
  padding: 8px;
  z-index: 9999;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(8px);

  button {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 4px;
    color: #555;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: rgba(0, 0, 0, 0.06);
      color: #0078d4;
    }

    &.active {
      background: #e1f0fa;
      color: #0078d4;
    }

    .iconfont {
      font-size: 22px;
    }
  }
}

/* 设置面板样式 */
.pen-settings-panel {
  position: absolute;
  top: 100%;
  /* left 由 JS 动态控制 */

  margin-top: 8px;
  background: white;
  padding: 8px 12px;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;

  transition: left 0.2s cubic-bezier(0.2, 0, 0.2, 1), opacity 0.2s;

  /* 小箭头 */
  &::after {
    content: "";
    position: absolute;
    top: -6px;
    left: 20px;
    width: 10px;
    height: 10px;
    background: white;
    transform: rotate(-45deg);
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    border-right: 1px solid rgba(0, 0, 0, 0.05);
  }

  .divider {
    width: 1px;
    height: 20px;
    background: #eee;
  }

  .sizes,
  .colors {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .size-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    /* 增加圆角 */
    display: flex;
    /* 确保点居中 */
    align-items: center;
    justify-content: center;

    &:hover {
      background: #f0f0f0;
    }

    &.active {
      background: #e1f0fa;
      border-color: #b3d7f3;
    }

    .dot {
      background: #333;
      border-radius: 50%;
      display: block;
    }
  }

  .color-swatch {
    width: 24px;
    height: 24px;
    padding: 2px;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 4px;

    .color-dot {
      width: 100%;
      height: 100%;
      border-radius: 2px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      display: block;
      /* 修复显示 */
    }

    &:hover {
      transform: scale(1.1);
    }

    &.active {
      border-color: #0078d4;
      background: #fff;
      transform: scale(1.1);
    }
  }

  .custom-color-picker {
    position: relative;
    width: 24px;
    height: 24px;
    overflow: hidden;
    border-radius: 4px;
    cursor: pointer;
    transition: transform 0.2s;
    border: 1px solid rgba(0, 0, 0, 0.1);

    &:hover {
      transform: scale(1.1);
    }

    .rainbow {
      width: 100%;
      height: 100%;
      display: block;
      background: linear-gradient(135deg, red, orange, yellow, green, blue, purple);
    }

    input[type="color"] {
      position: absolute;
      top: 0;
      left: 0;
      width: 200%;
      height: 200%;
      padding: 0;
      margin: 0;
      opacity: 0;
      cursor: pointer;
      transform: translate(-25%, -25%);
    }
  }
}
</style>
