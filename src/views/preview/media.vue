<template>
  <div style="border: 1px solid #ddd">
    <div class="media-previewer-head" data-tauri-drag-region>
      <el-row style="height: 30px">
        <el-col :span="20" data-tauri-drag-region>
          <div v-show="!isVideo" :style="{ opacity: controlPanelOpacity }" class="control-panel" data-tauri-drag-region>
            <div @click="zoomIn">
              <i class="iconfont icon-fangda1"></i>
            </div>
            <div @click="zoomOut">
              <i class="iconfont icon-suoxiao"></i>
            </div>
            <div @click="centerImage">
              <i class="iconfont icon-juzhong"></i>
            </div>
            <div @click="rotateLeft">
              <i class="iconfont icon-zuoxuanzhuan"></i>
            </div>
            <div @click="rotateRight">
              <i class="iconfont icon-youxuanzhuan"></i>
            </div>
          </div>
        </el-col>
        <el-col :span="4">
          <System about-visible @handleClose="handleClose" />
        </el-col>
      </el-row>
    </div>
    <div class="media-previewer">
      <div ref="mediaContainer" class="media-container" @wheel="handleWheel">
        <video v-if="isVideo" ref="videoRef" :src="mediaUrl" controls />
        <img
          v-else
          ref="imageRef"
          :src="mediaUrl"
          :style="transformStyle"
          class="lazy-img"
          style="cursor: move"
          @mousedown="startDrag"
          @mousemove="moveImg"
          @mouseup="endDrag"
        />
        <!-- 缩放倍率指示器 -->
        <div v-if="showZoomIndicator" class="zoom-indicator">{{ (scale * 100).toFixed(0) }}%</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { onBeforeUnmount, onMounted, ref } from "vue";
  import System from "@/components/System/index.vue";
  import { emit, listen } from "@tauri-apps/api/event";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";

  const { addShortcut } = useGlobalShortcut();
  //import { StoresEnum } from "@/constants";

  const isVideo = ref(false);
  const videoRef = ref();
  const imageRef = ref();
  const controlPanelOpacity = ref(0.5);
  const mediaContainer = ref();
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  const mediaUrl = ref("");

  // 缩小
  const zoomInScale = ref<number>(Number(import.meta.env.VITE_APP_PREVIEW_IMAGE_ZOOMIN) || 0.5);
  // 放大
  const zoomOutScale = ref<number>(Number(import.meta.env.VITE_APP_PREVIEW_IMAGE_ZOOMOUT) || 5);
  // 步进
  const zoomStep = ref<number>(Number(import.meta.env.VITE_APP_PREVIEW_IMAGE_STEP) || 0.1);

  // 定义状态变量
  let scale = ref(1);
  let rotation = ref(0);

  // 是否显示缩放指示器及其定时器
  const showZoomIndicator = ref(false);
  let zoomIndicatorTimer: ReturnType<typeof setTimeout> | null = null;

  // 移动图片的函数
  const moveImg = (event: MouseEvent) => {
    if (!dragging) return;
    const img = imageRef.value;
    img.style.left = event.pageX - dragStartX + "px";
    img.style.top = event.pageY - dragStartY + "px";
  };

  // 开始拖动的函数
  const startDrag = (event: MouseEvent) => {
    event.preventDefault();
    if (event.button !== 0) return; // 鼠标左键
    dragging = true;
    const img = imageRef.value;
    dragStartX = event.pageX - img.offsetLeft;
    dragStartY = event.pageY - img.offsetTop;
  };

  // 结束拖动的函数
  const endDrag = () => {
    dragging = false;
  };

  // 计算 transform 样式
  const transformStyle = computed(() => ({
    transform: `scale(${scale.value}) rotate(${rotation.value}deg)`
  }));

  // 放大
  const zoomIn = () => {
    if (scale.value < zoomInScale.value) {
      scale.value += zoomStep.value;
      showZoomOverlay();
    }
  };

  // 缩小
  const zoomOut = () => {
    if (scale.value > zoomOutScale.value) {
      scale.value -= zoomStep.value;
      showZoomOverlay();
    }
  };

  // 显示指示器并在 800ms 后隐藏
  function showZoomOverlay() {
    showZoomIndicator.value = true;
    if (zoomIndicatorTimer) clearTimeout(zoomIndicatorTimer);
    zoomIndicatorTimer = setTimeout(() => {
      showZoomIndicator.value = false;
      zoomIndicatorTimer = null;
    }, 800);
  }

  // 旋转函数
  const rotate = (angle: number) => {
    rotation.value += angle;
    // showZoomOverlay();
  };

  // 左旋转
  const rotateLeft = () => {
    rotate(-90);
  };

  // 右旋转
  const rotateRight = () => {
    rotate(90);
  };

  // 居中图片并恢复到原始状态
  const centerImage = () => {
    scale.value = 1;
    rotation.value = 0;
    // showZoomOverlay();

    if (imageRef.value || videoRef.value) {
      const mediaRect: any = imageRef.value || videoRef.value;
      const mediaWidth = mediaRect.offsetWidth;
      const mediaHeight = mediaRect.offsetHeight;
      imageRef.value.style.left = `calc(50% - ${mediaWidth / 2}px)`;
      imageRef.value.style.top = `calc(50% - ${mediaHeight / 2}px)`;
    }
  };

  // 滚轮缩放
  const handleWheel = (event: WheelEvent) => {
    if (event.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  };

  // 更新媒体容器尺寸
  const updateMediaContainerSize = () => {
    if (mediaContainer.value) {
      mediaContainer.value.style.width = window.innerWidth + "px";
      mediaContainer.value.style.height = window.innerHeight - 35 + "px";
    }
  };

  const init = async () => {
    let unlisten = await listen("preview-media-load", (event: any) => {
      const { url } = event.payload;
      useLogger().prettyInfo("preview load", event.payload);
      mediaUrl.value = url;
      isVideo.value =
        mediaUrl.value.endsWith(".mp4") ||
        mediaUrl.value.endsWith(".avi") ||
        mediaUrl.value.endsWith(".mov") ||
        mediaUrl.value.endsWith(".wmv");

      if (isVideo.value) {
        videoRef.value.play();
      }
    });

    onBeforeUnmount(() => unlisten());
    // 确认页面创建完成
    emit("preview-media-create", {}); // 执行相应的操作
  };

  const handleClose = () => {
    if (isVideo.value) {
      videoRef.value.pause();
    }
  };

  onMounted(() => {
    init();
    updateMediaContainerSize();
    window.addEventListener("resize", updateMediaContainerSize);

    addShortcut({
      name: "esc",
      combination: "Esc",
      handler: () => {
        if (useWindowFocus()) {
          getCurrentWebviewWindow().hide();
          console.log("关闭预览弹窗");
        }
      }
    });
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", updateMediaContainerSize);
  });
</script>

<style lang="scss" scoped>
  .media-previewer-head {
    background-color: #f5f5f5;
  }

  .media-previewer {
    width: 100%;
    height: calc(100vh - 35px);
    background-color: #fff;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }

  .media-container {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .media-container video,
  .media-container img {
    position: absolute;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .control-panel {
    display: flex;
    line-height: 30px;
    justify-content: center;
  }

  .iconfont {
    color: #000;
    font-size: 18px;
    margin: 0 5px;
    cursor: pointer;
    font-weight: 500;
  }

  .iconfont:hover {
    color: rgb(14, 115, 204);
  }

  .control-panel div:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }

  .el-button {
    margin: 0 5px;
  }

  //全屏按钮
  video::-webkit-media-controls-fullscreen-button {
    display: none;
  }

  /* 缩放倍率指示器 */
  .zoom-indicator {
    position: absolute;
    top: 20px;
    left: 20px;
    background: rgba(255, 255, 255, 0.8);
    color: #666;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 25px;
    font-weight: bold;
    pointer-events: none;
    transition: opacity 0.2s;
  }
</style>
