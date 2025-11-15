<template>
  <div
    :class="{ mac: isMac }"
    :style="containerStyle"
    aria-label="window controls"
    class="control-button"
    role="toolbar"
  >
    <template v-if="isMac">
      <!-- Mac buttons: close, min, max (reverse order) -->
      <el-button
        v-for="(btn, index) in controlButtonsMac"
        :key="index"
        :class="`${btn.css} btn-m-${index}`"
        :disabled="btn.disabled"
        :style="btn.style"
        :title="btn.title"
        @click="btn.handle"
        @mouseenter="onButtonEnter(index)"
        @mouseleave="onButtonLeave(index)"
      >
        <svg aria-hidden="true" class="btn-icon">
          <use :xlink:href="btn.icon" />
        </svg>
      </el-button>
    </template>

    <template v-else>
      <!-- Windows buttons: min, max, close -->
      <el-button
        v-for="(btn, index) in controlButtonsWindows"
        :key="index"
        :class="`${btn.css} btn-w-${index}`"
        :disabled="btn.disabled"
        :title="btn.title"
        @click="btn.handle"
      >
        <i :class="btn.icon" class="iconfont"></i>
      </el-button>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { useSystemClose } from "@/hooks/useSystem";

  const emit = defineEmits(["handleClose"]);

  const appWindow = getCurrentWindow();

  const { currPlatform, close } = useSystemClose(() => {
    emit("handleClose");
    console.log("call window close requested — run cleanup now");
  });

  // Props for visibility control
  const props = defineProps({
    maxVisible: { type: Boolean, default: true },
    minVisible: { type: Boolean, default: true },
    closeVisible: { type: Boolean, default: true }
  });

  const { maxVisible, minVisible, closeVisible } = toRefs(props);

  const isMaximized = ref(false);
  const isMac = ref(false);

  // Hover states for Mac buttons
  const maxHover = ref(false);
  const minHover = ref(false);
  const closeHover = ref(false);

  const controlButtonsMac = computed(() => [
    {
      title: "关闭",
      icon: closeHover.value ? "#icon-mac_top_rhover" : "#icon-mac_top_red",
      style: { opacity: closeVisible.value ? 1 : 0.5 },
      disabled: !closeVisible.value,
      css: "control-el-button",
      handle: closeHandle
    },
    {
      title: "最小化",
      icon: minHover.value ? "#icon-mac_top_yhover" : "#icon-mac_top_yellow",
      style: { opacity: minVisible.value ? 1 : 0.5 },
      disabled: !minVisible.value,
      css: "control-el-button",
      handle: minHandle
    },
    {
      title: isMaximized.value ? "还原" : "最大化",
      icon: maxHover.value ? "#icon-mac_top_ghover" : "#icon-mac_top_green",
      style: { opacity: maxVisible.value ? 1 : 0.5 },
      disabled: !maxVisible.value,
      css: "control-el-button",
      handle: maxHandle
    }
  ]);

  const controlButtonsWindows = computed(() => [
    {
      title: "最小化",
      icon: "icon-zuixiaohua",
      style: { opacity: minVisible.value ? 1 : 0.5 },
      disabled: !minVisible.value,
      css: "control-el-button",
      handle: minHandle
    },
    {
      title: isMaximized.value ? "还原" : "最大化",
      icon: "icon-zuidahua-da",
      style: { opacity: maxVisible.value ? 1 : 0.5 },
      disabled: !maxVisible.value,
      css: "control-el-button",
      handle: maxHandle
    },
    {
      title: "关闭",
      icon: "icon-guanbi",
      style: { opacity: closeVisible.value ? 1 : 0.5 },
      disabled: !closeVisible.value,
      css: "control-el-button close",
      handle: closeHandle
    }
  ]);

  const onButtonEnter = (index: number) => {
    if (isMac.value) {
      if (index === 0) closeHover.value = true;
      if (index === 1) minHover.value = true;
      if (index === 2) maxHover.value = true;
    }
  };

  const onButtonLeave = (index: number) => {
    if (isMac.value) {
      if (index === 0) closeHover.value = false;
      if (index === 1) minHover.value = false;
      if (index === 2) maxHover.value = false;
    }
  };

  const minHandle = async () => {
    await appWindow.minimize();
  };

  const maxHandle = async () => {
    await appWindow.toggleMaximize();
    isMaximized.value = await appWindow.isMaximized();
  };

  const closeHandle = async () => {
    await close();
  };

  // Listen for resize events
  // listen("tauri://resize", async () => {
  //   isMaximized.value = await appWindow.isMaximized();
  // });

  // Set platform and initialize
  onMounted(async () => {
    isMac.value = currPlatform === "macos" || currPlatform === "ios";
    isMaximized.value = await appWindow.isMaximized();
  });

  // Container positioning
  const containerStyle = computed(() => ({
    position: "absolute",
    left: isMac.value ? "0px" : "auto",
    top: isMac.value ? "0px" : "auto",
    right: isMac.value ? "auto" : "-1px",
    zIndex: 2,
    pointerEvents: "auto"
  })) as any;
</script>

<style lang="scss" scoped>
  .control-button {
    position: absolute;
    height: 32px;
    z-index: 2;
    pointer-events: auto;
    box-sizing: border-box;

    .control-el-button {
      position: absolute;
      top: 0;
      margin: 0;
      padding: 0;
      background: transparent;
      border: none;
      cursor: pointer;
      text-align: center;
      transition: background-color 0.2s ease, color 0.2s ease;

      &:hover {
        background-color: rgba(130, 129, 129, 0.12);
      }
    }

    &.mac {
      width: 60px;

      .control-el-button {
        margin-top: 2px;
        width: 14px;
        height: 14px;

        .btn-icon {
          width: 12px;
          height: 12px;
          display: block;
          object-fit: contain;
        }
      }

      .btn-m-0 {
        left: 0;
      }

      .btn-m-1 {
        left: 20px;
      }

      .btn-m-2 {
        left: 40px;
      }
    }

    &:not(.mac) {
      width: 110px;

      .control-el-button {
        margin-top: -1px;

        .btn-icon,
        .iconfont {
          width: 100%;
          height: 100%;
        }

        &:hover {
          background-color: rgba(130, 129, 129, 0.12);
        }

        &.close:hover {
          background-color: #e8595b;
          color: #ffffff;
        }
      }

      .btn-w-0 {
        right: 72px;
        width: 35px;
        height: 35px;
      }

      .btn-w-1 {
        right: 36px;
        width: 35px;
        height: 35px;
      }

      .btn-w-2 {
        right: 0;
        width: 35px;
        height: 35px;
      }
    }

    @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
      .btn-icon {
        width: 28px;
        height: 28px;
      }
    }
  }
</style>
