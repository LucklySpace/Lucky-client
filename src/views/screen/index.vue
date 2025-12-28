<template>
  <div :ref="refs.canvasBox" class="canvasbox">
    <canvas :ref="refs.imgCanvas" class="img-canvas"></canvas>
    <canvas :ref="refs.maskCanvas" class="mask-canvas"></canvas>
    <canvas :ref="refs.drawCanvas" class="draw-canvas"></canvas>

    <div :ref="refs.magnifier" class="magnifier">
      <canvas :ref="refs.magnifierCanvas"></canvas>
    </div>

    <div v-show="state.showButtonGroup" :ref="refs.buttonGroup" :style="state.buttonStyle" class="button-group">
      <div v-if="showPenSettings" class="pen-settings-panel" @mousedown.stop>
        <div class="sizes">
          <button
            v-for="s in sizes"
            :key="s"
            :class="['size-btn', { active: s === currentSize }]"
            @click="onSelectSize(s)"
          >
            <span :style="{ width: s + 'px', height: s + 'px' }" class="dot"></span>
          </button>
        </div>

        <div class="divider"></div>

        <div class="colors">
          <button
            v-for="c in palette"
            :key="c"
            :aria-label="c"
            :class="['color-swatch', { active: c === currentColor }]"
            @click="onSelectColor(c)"
          >
            <span :style="{ backgroundColor: c }" class="color-dot"></span>
          </button>

          <div class="custom-color-picker" title="自定义颜色">
            <input type="color" :value="currentColor" @input="onNativeColorChange" />
            <span class="color-dot rainbow"></span>
          </div>
        </div>
      </div>

      <button :class="{ active: state.currentTool === 'pen' }" :title="$t('screen.pen')" @click="togglePenPanel">
        <i class="iconfont icon-24"></i>
      </button>

      <div style="display: flex">
        <button :class="{ active: state.currentTool === 'rect' }" :title="$t('screen.rect')" @click="setTool('rect')">
          <i class="iconfont icon-xingzhuang-juxing"></i>
        </button>

        <button
          :class="{ active: state.currentTool === 'circle' }"
          :title="$t('screen.circle')"
          @click="setTool('circle')"
        >
          <i class="iconfont icon-yuanxing"></i>
        </button>

        <button
          :class="{ active: state.currentTool === 'arrow' }"
          :title="$t('screen.arrow')"
          @click="setTool('arrow')"
        >
          <i class="iconfont icon-righttop"></i>
        </button>

        <button :class="{ active: state.currentTool === 'line' }" :title="$t('screen.line')" @click="setTool('line')">
          <i class="iconfont icon-jurassic_line"></i>
        </button>

        <button
          :class="{ active: state.currentTool === 'mosaic' }"
          :title="$t('screen.mosaic')"
          @click="setTool('mosaic')"
        >
          <i class="iconfont icon-masaike"></i>
        </button>
        <button :title="$t('screen.undo')" @click="undo">
          <i class="iconfont icon-chexiao"></i>
        </button>
        <button :title="$t('screen.redo')" @click="redo">
          <i class="iconfont icon-chexiao" style="transform: scaleX(-1)"></i>
        </button>
        <button :title="$t('actions.cancel')" @click="cancelSelection">
          <i class="iconfont icon-quxiao"></i>
        </button>
        <button :title="$t('actions.complete')" @click="confirmSelection">
          <i class="iconfont icon-wanchengqueding"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, onBeforeUnmount } from "vue";
  import { useScreenshot } from "./hooks/useScreenshot";
  import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

  const { addShortcut } = useGlobalShortcut();

  const { refs, state, start, confirmSelection, cancelSelection, setTool, undo, redo, setPenOptions } = useScreenshot();

  const showPenSettings = ref(false);

  // 可配置的调色板与尺寸（你可以把这两个放到外部 config）
  const palette = ref<string[]>(["#ff0000", "#ffff00", "#0000ff", "#ffffff", "#000000", "#00ff00"]);

  const sizes = ref<number[]>([4, 8, 12]); // 三档圆点

  // 当前显示状态（从 hook 或局部 state 获取均可）
  const currentColor = ref<string>("red");
  const currentSize = ref(8);

  let unlistenDispose: (() => void) | null = null;

  // 切换面板逻辑
  function togglePenPanel() {
    if (state.currentTool !== "pen") {
      // 如果当前不是画笔，先切到画笔，并打开面板
      setTool("pen");
      showPenSettings.value = true;
    } else {
      // 如果已经是画笔，则切换面板显隐
      showPenSettings.value = !showPenSettings.value;
    }
  }
  // 监听工具变化，如果用户点击了矩形、圆形等其他工具，自动关闭画笔面板
  watch(
    () => state.currentTool,
    newTool => {
      if (newTool !== "pen") {
        showPenSettings.value = false;
      }
    }
  );

  function onSelectColor(c: string) {
    showPenSettings.value = true;
    setPenOptions({ color: c });
    currentColor.value = c;
  }

  // 原生颜色选择器回调
  function onNativeColorChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = target.value;
    currentColor.value = val;
    setPenOptions({ color: val });
  }

  function onSelectSize(s: number) {
    setPenOptions?.({ size: s } as any);
    if (currentSize) currentSize.value = s;
    setTool?.("pen");
  }

  // 早期渲染时将组件 ref 绑定到 hook 的 refs 对象上
  onMounted(async () => {
    await start();
    addShortcut({
      name: "esc",
      combination: "Esc",
      handler: () => {
        if (useWindowFocus()) {
          getCurrentWindow().close();
          console.log("关闭预览弹窗");
        }
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
  /* 保持原有的 Canvas 样式不变 ... */
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

  /* 工具栏样式优化 */
  .button-group {
    position: absolute;
    display: flex;
    gap: 8px; /* 间距微调 */
    background: rgba(255, 255, 255, 0.95);
    border-radius: 6px;
    padding: 8px;
    z-index: 9999; /* 确保层级非常高 */
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
      color: #555;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: rgba(0, 0, 0, 0.06);
        color: #0078d4;
      }

      &.active {
        background: #e1f0fa; /* 这里的蓝色更柔和 */
        color: #0078d4;
      }

      .iconfont {
        font-size: 20px;
      }
    }
  }

  /* --- 新增：自定义设置面板样式 --- */
  .pen-settings-panel {
    position: absolute;
    top: 100%; /* 显示在工具栏上方 */
    left: 0;
    margin-top: 8px; /* 留一点间距 */
    background: white;
    padding: 8px 12px;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 12px;
    white-space: nowrap;

    // 如果你想让它显示在下方，把 bottom: 100% 改为 top: 100%，margin-bottom 改为 margin-top

    // 添加一个小箭头指向工具栏（可选）
    &::after {
      content: "";
      position: absolute;
      top: -6px;
      left: 20px; // 对齐画笔图标的位置
      width: 10px;
      height: 10px;
      background: white;
      transform: rotate(-45deg);
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

    /* 尺寸按钮 */
    .size-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      background: transparent;
      border: 1px solid transparent;
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

    /* 颜色块 */
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

    /* --- 自定义原生颜色选择器 --- */
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

      /* 彩虹背景作为图标 */
      .rainbow {
        width: 100%;
        height: 100%;
        display: block;
        background: linear-gradient(135deg, red, orange, yellow, green, blue, purple);
      }

      /* 真正的 input，完全透明并覆盖在上方 */
      input[type="color"] {
        position: absolute;
        top: 0;
        left: 0;
        width: 200%;
        height: 200%; /* 放大以确保点击区域覆盖 */
        padding: 0;
        margin: 0;
        opacity: 0; /* 隐身 */
        cursor: pointer;
        transform: translate(-25%, -25%); /* 修正位置 */
      }
    }
  }
</style>
