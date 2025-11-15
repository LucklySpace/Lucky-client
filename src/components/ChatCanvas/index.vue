<template>
  <div ref="containerRef" class="chat-canvas-container">
    <canvas ref="canvasRef" @click="handleClick" @mousemove="handleMouseMove"></canvas>
  </div>
</template>

<script setup>
  import { onMounted, onUnmounted, ref } from "vue";

  const props = defineProps({
    chatList: {
      type: Array,
      default: () => []
    }
  });

  const containerRef = ref(null);
  const canvasRef = ref(null);
  let ctx = null;
  let animationFrameId = null;

  // 画布配置
  const config = {
    itemHeight: 70,
    padding: 10,
    avatarSize: 40,
    nameFont: "14px Arial",
    messageFont: "12px Arial",
    timeFont: "12px Arial",
    nameColor: "#333",
    messageColor: "#666",
    timeColor: "#999",
    hoverColor: "#f5f5f5"
  };

  // 鼠标位置
  const mousePos = ref({
    x: 0,
    y: 0
  });

  const init = () => {
    const canvas = canvasRef.value;
    const container = containerRef.value;
    ctx = canvas.getContext("2d");

    // 设置canvas尺寸
    const setCanvasSize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };

    setCanvasSize();
    window.addEventListener("resize", setCanvasSize);

    // 开始动画循环
    const animate = () => {
      draw();
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  };

  const draw = () => {
    if (!ctx) return;

    // 清空画布
    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);

    props.chatList.forEach((chat, index) => {
      const y = index * config.itemHeight;
      const isHover = mousePos.value.y > y && mousePos.value.y < y + config.itemHeight;

      // 绘制hover背景
      if (isHover) {
        ctx.fillStyle = config.hoverColor;
        ctx.fillRect(0, y, canvasRef.value.width, config.itemHeight);
      }

      // 绘制头像
      ctx.beginPath();
      ctx.arc(config.padding + config.avatarSize / 2, y + config.itemHeight / 2, config.avatarSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#e1e1e1";
      ctx.fill();

      // 绘制名称
      ctx.font = config.nameFont;
      ctx.fillStyle = config.nameColor;
      ctx.fillText(chat.name, config.padding * 2 + config.avatarSize, y + config.padding + 14);

      // 绘制最后消息
      ctx.font = config.messageFont;
      ctx.fillStyle = config.messageColor;
      ctx.fillText(
        chat.lastMessage,
        config.padding * 2 + config.avatarSize,
        y + config.itemHeight - config.padding - 2
      );

      // 绘制时间
      ctx.font = config.timeFont;
      ctx.fillStyle = config.timeColor;
      const timeWidth = ctx.measureText(chat.time).width;
      ctx.fillText(chat.time, canvasRef.value.width - timeWidth - config.padding, y + config.padding + 14);
    });
  };

  const handleMouseMove = e => {
    const rect = canvasRef.value.getBoundingClientRect();
    mousePos.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleClick = e => {
    const index = Math.floor(mousePos.value.y / config.itemHeight);
    if (index < props.chatList.length) {
      emit("select", props.chatList[index]);
    }
  };

  // 生命周期钩子
  onMounted(() => {
    init();
  });

  onUnmounted(() => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
  });

  const emit = defineEmits(["select"]);

  // 监听列表变化
  watchEffect(
    () => props.chatList,
    () => {
      draw();
    },
    { deep: true }
  );
</script>

<style scoped>
  .chat-canvas-container {
    width: 100%;
    height: 100%;
  }

  canvas {
    width: 100%;
    height: 100%;
  }
</style>
