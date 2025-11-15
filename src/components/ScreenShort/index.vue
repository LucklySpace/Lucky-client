<template>
  <div class="screen-container">
    <canvas ref="canvas"></canvas>
    <div v-if="showButtons" :style="{ top: `${endY / scaleX}px`, left: `${endX / scaleX}px` }" class="action-buttons">
      <!-- <button @click="canvasTool.create('rectangle')">绘制矩形</button>
      <button @click="canvasTool.create('circle')">绘制圆形</button>
      <button @click="canvasTool.create('arrow')">绘制箭头</button>
      <button @click="applyMosaic()">添加马赛克</button>
      <button @click="addText">添加文字</button>
      <button @click="canvasTool.redo">撤销</button>
      <button @click="canvasTool.undo">重做</button>
      <button @click="clearCanvas">清空画布</button> -->
      <button @click="confirmSelection">确定</button>
      <button @click="cancelSelection">取消</button>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { invoke } from "@tauri-apps/api/core";
  import { ref, watch } from "vue";
  import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
  // import { useCanvasTool } from '@/hooks/useCanvasTool';


  //let canvasTool: any;

  const props = defineProps({
    isCapturing: {
      type: Boolean,
      default: false
    }
  });

  watch(() => props.isCapturing, (newValue) => {
    if (newValue) {
      initCanvas();
    }
  });

  const canvas = ref<HTMLCanvasElement | null>(null);
  const context = ref<CanvasRenderingContext2D | null>(null);
  const showButtons = ref(false);

  const isDrawing = ref(false);
  const isMoving = ref(false);
  const startX = ref(0);
  const startY = ref(0);
  const endX = ref(0);
  const endY = ref(0);

  const offsetX = ref(0);
  const offsetY = ref(0);
  const initialRect = { x: 0, y: 0, width: 0, height: 0 };

  const scaleX = ref(1);
  const scaleY = ref(1);

  const cornerRadius = ref(3);
  const screenFillStyle = ref("green");


  let screenshotImage: HTMLImageElement;

  async function initCanvas() {

    const position = await invoke<string>("get_mouse_position");

    //const allScreens = await invoke<string>('get_all_screens');

    const config = {
      x: `${position[0]}`,
      y: `${position[1]}`,
      width: `${screen.width * window.devicePixelRatio}`,
      height: `${screen.height * window.devicePixelRatio}`
    };

    //console.log(allScreens);


    const screenshotData = await invoke<any>("screenshot", config);

    if (canvas.value) {
      const { clientWidth: containerWidth, clientHeight: containerHeight } = canvas.value;
      scaleX.value = (screen.width * window.devicePixelRatio) / containerWidth;
      scaleY.value = (screen.height * window.devicePixelRatio) / containerHeight;

      canvas.value.width = screen.width * window.devicePixelRatio;
      canvas.value.height = screen.height * window.devicePixelRatio;
      context.value = canvas.value.getContext("2d");
      screenshotImage = new Image();
      screenshotImage.src = `data:image/jpeg;base64,${screenshotData}`;
      screenshotImage.onload = () => {
        if (context.value) {
          context.value.drawImage(screenshotImage, 0, 0, (canvas.value as any).width, (canvas.value as any).height);
          drawMask();
        }
      };

      //canvasTool = useCanvasTool(canvas.value, context.value as any, screenshotImage)

      // 事件监听器移入 initCanvas
      canvas.value.addEventListener("mousedown", handleMouseDown);
      canvas.value.addEventListener("mousemove", handleMouseMove);
      canvas.value.addEventListener("mouseup", handleMouseUp);
    }
  }

  function drawMask() {
    if (context.value && canvas.value) {
      context.value.fillStyle = "rgba(0, 0, 0, 0.4)";
      context.value.fillRect(0, 0, canvas.value.width, canvas.value.height);
    }
  }

  function drawSelectionRect(x: number, y: number, width: number, height: number) {
    if (context.value) {
      context.value.drawImage(screenshotImage, 0, 0, (canvas.value as any).width, (canvas.value as any).height);
      drawMask();
      context.value.clearRect(x, y, width, height);
      context.value.drawImage(screenshotImage, x, y, width, height, x, y, width, height);
      context.value.strokeStyle = screenFillStyle.value;
      context.value.lineWidth = 1;
      context.value.strokeRect(x, y, width, height);
      drawCornersAndMidpoints(x, y, width, height);

      // 绘制矩形大小文本
      drawSizeText(x, y, width, height);
    }
  }


  function drawSizeText(x: number, y: number, width: number, height: number) {
    if (context.value) {
      // 对宽度和高度进行取整
      const roundedWidth = Math.round(Math.abs(width));
      const roundedHeight = Math.round(Math.abs(height));
      const sizeText = `${roundedWidth} x ${roundedHeight}`;

      // 确保文本始终显示在矩形的左上角
      const textX = width >= 0 ? x : x + width;
      const textY = height >= 0 ? y : y + height;

      // 设置字体和样式
      context.value.font = "14px Arial";
      context.value.fillStyle = "white";
      // 设置图像插值质量
      context.value.imageSmoothingEnabled = true;
      context.value.imageSmoothingQuality = "high";
      context.value.fillText(sizeText, textX + 5, textY - 10); // 在矩形左上角并稍微偏移的位置绘制文本
    }
  }


  function handleMouseDown(event: MouseEvent) {
    const { offsetX: canvasOffsetX, offsetY: canvasOffsetY } = event;
    const x = canvasOffsetX * scaleX.value;
    const y = canvasOffsetY * scaleY.value;

    if (isPointInRectangle(x, y)) {
      isMoving.value = true;
      offsetX.value = x - startX.value;
      offsetY.value = y - startY.value;
      initialRect.x = startX.value;
      initialRect.y = startY.value;
      initialRect.width = endX.value - startX.value;
      initialRect.height = endY.value - startY.value;
    } else {
      isDrawing.value = true;
      startX.value = x;
      startY.value = y;
      showButtons.value = false;
    }
  }

  function handleMouseMove(event: MouseEvent) {
    const { offsetX: canvasOffsetX, offsetY: canvasOffsetY } = event;
    const x = canvasOffsetX * scaleX.value;
    const y = canvasOffsetY * scaleY.value;

    // 判断鼠标是否在矩形区域内
    if (x >= startX.value && x <= endX.value && y >= startY.value && y <= endY.value) {
      // if (canvas.value) {
      //   canvas.value.style.cursor = 'move';
      // }
    } else {
      if (canvas.value) {
        canvas.value.style.cursor = "default";
      }
    }

    if (isDrawing.value) {
      drawSelectionRect(
        startX.value,
        startY.value,
        x - startX.value,
        y - startY.value
      );
    }

    // else if (isMoving.value) {
    //   const newStartX = x - offsetX.value;
    //   const newStartY = y - offsetY.value;
    //   startX.value = newStartX;
    //   startY.value = newStartY;
    //   endX.value = newStartX + initialRect.width;
    //   endY.value = newStartY + initialRect.height;
    //   drawSelectionRect(startX.value, startY.value, initialRect.width, initialRect.height);
    // }

  }

  function handleMouseUp(event: MouseEvent) {
    if (isDrawing.value) {
      endX.value = startX.value + (event.offsetX * scaleX.value) - startX.value;
      endY.value = startY.value + (event.offsetY * scaleY.value) - startY.value;
      isDrawing.value = false;
      showButtons.value = true;
    } else if (isMoving.value) {
      isMoving.value = false;
    }
  }

  function isPointInRectangle(x: number, y: number) {
    return (
      x > startX.value &&
      x < endX.value &&
      y > startY.value &&
      y < endY.value
    );
  }

  function drawCornersAndMidpoints(x: number, y: number, width: number, height: number) {
    if (context.value) {
      context.value.fillStyle = screenFillStyle.value;

      const points = [
        { x, y },
        { x: x + width, y },
        { x, y: y + height },
        { x: x + width, y: y + height },
        { x: x + width / 2, y },
        { x: x + width / 2, y: y + height },
        { x, y: y + height / 2 },
        { x: x + width, y: y + height / 2 }
      ];

      points.forEach(({ x, y }) => {
        context.value!.beginPath();
        context.value!.arc(x, y, cornerRadius.value, 0, 2 * Math.PI);
        context.value!.fill();
      });
    }
  }

  function confirmSelection() {
    if (context.value && canvas.value) {
      const width = endX.value - startX.value;
      const height = endY.value - startY.value;

      // 获取选区图像数据
      const imageData = context.value.getImageData(startX.value, startY.value, width, height);

      // 创建一个离屏 canvas 用于导出选区图像
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = width;
      offscreenCanvas.height = height;
      const offscreenContext = offscreenCanvas.getContext("2d");

      if (offscreenContext) {
        offscreenContext.putImageData(imageData, 0, 0);
        offscreenCanvas.toBlob(async (blob) => {
          if (blob) {
            const arrayBuffer = await blob.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);
            // todo: 截取到的图片不完整
            writeImage(buffer).then(() => {
              //cancelSelection()
            });
          }
        }, "image/png");
      }
    }
  }

  function cancelSelection() {
    if (context.value && canvas.value) {
      context.value.clearRect(0, 0, canvas.value.width, canvas.value.height);

      context.value = null;
      canvas.value = null;
      showButtons.value = false;
      isDrawing.value = false;
      isMoving.value = false;
      startX.value = 0;
      startY.value = 0;
      endX.value = 0;
      endY.value = 0;
      offsetX.value = 0;
      offsetY.value = 0;
    }
  }

  onUnmounted(() => {
    if (canvas.value) {
      canvas.value.removeEventListener("mousedown", handleMouseDown);
      canvas.value.removeEventListener("mousemove", handleMouseMove);
      canvas.value.removeEventListener("mouseup", handleMouseUp);
    }
  });

</script>

<style scoped>
  .screen-container {
    width: 100vw;
    height: 100vh;
    position: relative;
  }

  canvas {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .action-buttons {
    position: absolute;
    display: flex;
    gap: 10px;
    height: 35px;
    transform: translate(-50%, 0);
    background: white;
    border: 1px solid #ccc;
    border-radius: 5px;
    padding: 5px;
  }

  .action-buttons button {
    padding: 5px 10px;
    font-size: 14px;
    cursor: pointer;
  }
</style>
