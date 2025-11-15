<template>
  <div v-if="isCapturing" class="screenshot-mask" @mousedown="startCapture" @mousemove="onMouseMove"
       @mouseup="endCapture">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script lang="ts" setup>
  import { Image } from "@tauri-apps/api/image";
  import { invoke } from "@tauri-apps/api/core";
  import { writeImage } from "@tauri-apps/plugin-clipboard-manager";

  defineProps({
    isCapturing: {
      type: Boolean,
      default: false
    }
  });

  // const isCapturing = ref(false);
  const canvas = ref<HTMLCanvasElement | null>(null);
  const context = ref<CanvasRenderingContext2D | null>(null);
  const captureArea = shallowReactive({
    startX: 0,
    startY: 0,
    width: 0,
    height: 0,
    isDrawing: false
  });

  onMounted(() => {
    if (canvas.value) {
      context.value = canvas.value.getContext("2d");
      //resizeCanvas();
    }
  });


  function startCapture(event: MouseEvent) {
    captureArea.startX = event.clientX;
    captureArea.startY = event.clientY;
    captureArea.isDrawing = true;
  }

  function onMouseMove(event: MouseEvent) {
    if (!captureArea.isDrawing || !context.value) return;

    captureArea.width = event.clientX - captureArea.startX;
    captureArea.height = event.clientY - captureArea.startY;

    context.value.clearRect(0, 0, canvas.value!.width, canvas.value!.height);
    drawOverlay();
    drawCaptureArea();
  }

  function endCapture() {
    captureArea.isDrawing = false;
  }

  async function resizeCanvas() {

    const response = await invoke("screenshot", {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight
    });
    Image.fromBytes(base64ToArrayBuffer(response as string)).then((res: any) => {
      writeImage(res);
    });


    // if (!canvas.value || !context.value) return;

    // canvas.value.width = window.innerWidth;
    // canvas.value.height = window.innerHeight;
    // drawOverlay();
  }

  function drawOverlay() {
    if (!context.value) return;

    context.value.fillStyle = "rgba(0, 0, 0, 0.5)";
    context.value.fillRect(0, 0, canvas.value!.width, canvas.value!.height);
  }

  function drawCaptureArea() {
    if (!context.value) return;

    context.value.clearRect(captureArea.startX, captureArea.startY, captureArea.width, captureArea.height);
    context.value.strokeStyle = "red";
    context.value.strokeRect(captureArea.startX, captureArea.startY, captureArea.width, captureArea.height);
  }

  function base64ToArrayBuffer(base64: string) {
    const binaryString = atob(base64);
    const arrayBuffer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      arrayBuffer[i] = binaryString.charCodeAt(i);
    }
    return arrayBuffer.buffer;
  }

</script>

<style scoped>
  .screenshot-mask {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    background-color: rgba(0, 0, 0, 0.3);
    z-index: 9999;
  }

  canvas {
    width: 100%;
    height: 100%;
  }
</style>