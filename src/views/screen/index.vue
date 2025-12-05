<template>
  <div :ref="refs.canvasBox" class="canvasbox">
    <canvas :ref="refs.imgCanvas" class="img-canvas"></canvas>
    <canvas :ref="refs.maskCanvas" class="mask-canvas"></canvas>
    <canvas :ref="refs.drawCanvas" class="draw-canvas"></canvas>

    <div :ref="refs.magnifier" class="magnifier">
      <canvas :ref="refs.magnifierCanvas"></canvas>
    </div>

    <div v-show="state.showButtonGroup" :ref="refs.buttonGroup" :style="state.buttonStyle" class="button-group">
      <el-popover
        v-model:visible="showPenSettings"
        :teleported="true"
        placement="bottom-start"
        popper-class="pen-popover"
        width="365"
      >
        <!-- popover 内容：直接放 PenToolbar 组件 -->
        <template #default>
          <div class="pen-popover-inner">
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
              <!-- 全局颜色选择器 -->
              <el-color-picker
                class="color-picker"
                v-model="currentColor"
                @change="(v:any)=> onSelectColor(v)"
                :predefine="palette"
              />
            </div>
          </div>
        </template>

        <!-- reference slot 放按钮（Element 会自动定位 popover） -->
        <template #reference>
          <button :class="{ active: state.currentTool === 'pen' }" :title="$t('screen.pen')" @click="setTool('pen')">
            <i class="iconfont icon-24"></i>
          </button>
        </template>
      </el-popover>

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

      <button :class="{ active: state.currentTool === 'arrow' }" :title="$t('screen.arrow')" @click="setTool('arrow')">
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
      <button :title="$t('actions.complete')" @click="confirmSelection">
        <i class="iconfont icon-wanchengqueding"></i>
      </button>
      <button :title="$t('actions.cancel')" @click="cancelSelection">
        <i class="iconfont icon-quxiao"></i>
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted } from "vue";
  import { useScreenshot } from "./hooks/useScreenshot";
  import { ColorType } from "./hooks/types";
  import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { createUseCanvasTool } from "./hooks/useCanvasTool";

  const { addShortcut } = useGlobalShortcut();

  const { refs, state, start, confirmSelection, cancelSelection, setTool, undo, redo, setPenOptions } = useScreenshot();

  const showPenSettings = ref(false);

  // 可配置的调色板与尺寸（你可以把这两个放到外部 config）
  const palette = ref<string[]>(["red", "yellow", "blue", "white", "black", "green"]);

  const sizes = ref<number[]>([4, 8, 12]); // 三档圆点

  // 当前显示状态（从 hook 或局部 state 获取均可）
  const currentColor = ref<string>("red");
  const currentSize = ref(8);

  function onSelectColor(c: string) {
    showPenSettings.value = true;
    setPenOptions({ color: c });
    currentColor.value = c;
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

  .magnifier {
    position: absolute;
    pointer-events: none;
    width: 150px;
    height: 150px;
    border: 2px solid #ccc;
    border-radius: 50%;
    overflow: hidden;
    display: none;
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
    /* 确保事件穿透到下面的 canvas */
  }

  .magnifier canvas {
    display: block;
    z-index: 2;
  }

  .button-group {
    position: absolute;
    display: flex;
    gap: 10px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 5px;
    padding: 6px 8px;
    z-index: 3;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(8px); // 毛玻璃效果

    button {
      width: 36px;
      height: 36px;
      border: none;
      background: transparent;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 25px;
      color: #6b6666;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #0078d4; // 鼠标悬停变蓝
        //transform: scale(1.08);
      }

      &.active {
        background: rgba(0, 120, 212, 0.15);
        color: #0078d4;
        border-radius: 6px;
        //box-shadow: inset 0 0 0 2px #0078d4;
      }

      .iconfont {
        font-family: "iconfont" !important;
        font-size: 24px;
        font-style: normal;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      i {
        pointer-events: none; // 防止点击图标不触发按钮
      }
    }
  }

  :deep(.el-popover.el-popper) {
    padding: 6px;
  }

  .pen-popover-inner {
    display: flex;
    gap: 12px;
    align-items: center;
    //padding: 6px 8px;

    /* 左侧三档圆点 */
    .sizes {
      display: flex;
      gap: 8px;
      padding-right: 6px;
      border-right: 1px solid rgba(0, 0, 0, 0.06);
    }

    .size-btn {
      width: 24px;
      height: 24px;
      border-radius: 2px;
      border: none;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .size-btn .dot {
      background: #6d6b6b;
      border-radius: 50%;
      display: block;
    }

    .size-btn.active {
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.12);
      background-color: #69bdfe;
      //transform: translateY(-2px);
    }

    /* 颜色方块 */
    .colors {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .color-swatch {
      width: 28px;
      height: 28px;
      border-radius: 5px;
      border: 1px solid rgba(0, 0, 0, 0.06);
      background: transparent; // 不直接填充背景
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;

      .color-dot {
        width: 20px; /* 固定宽度 */
        aspect-ratio: 1 / 1; /* 保持正方形 */
        border-radius: 5px; /* 圆形 */
        background-color: var(--color, #000);
        box-sizing: border-box;
        flex-shrink: 0; /* 防止被拉伸 */
      }
    }

    .color-swatch.active {
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.12);
      background-color: #69bdfe;
    }

    .color-picker {
    }
  }
</style>
