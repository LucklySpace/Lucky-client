<template>
  <div v-if="chatMessageStore.currentChat" ref="containerRef" class="message-container">
    <!-- 消息转发对话框 -->
    <Teleport to="body">
      <Forward :visible="forwardDialogVisible" />
    </Teleport>
    <!-- 上半区：消息列表（EffectsManager 填满此区域） -->
    <div ref="topRef" class="message-content">
      <!-- 群公告横幅（限制在消息内容区域内渲染） -->
      <span class="group-notice">
        <GroupNoticeBanner />
      </span>
      <MessageView v-show="chatMessageStore.currentChat" :chat="chatMessageStore.currentChat"
        :count="chatMessageStore.remainingQuantity" :data="chatMessageStore.messageList" :rowHeight="64" />

      <!-- EffectsManager 填满 .message-content（absolute inset:0） -->
      <EffectsManager ref="effectsRef" :zIndex="999" style="height: 100%; width: 100%" />
    </div>

    <!-- 拖拽分隔条 -->
    <div class="drag-line" @mousedown.prevent="onDragStart" />

    <!-- 文件预览区域 -->
    <FilePreview v-if="inputRef?.pendingFiles?.length" :files="inputRef.pendingFiles" @remove="inputRef?.removeFile" />

    <!-- 下半区：输入框区域 -->
    <div ref="bottomRef" class="message-input">
      <InputView ref="inputRef" v-show="chatMessageStore.currentChat" @trigger="onTrigger" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import GroupNoticeBanner from "@/components/ChatDetail/GroupNoticeBanner.vue";
import EffectsManager from "@/components/EffectsManager/index.vue";
import FilePreview from "@/components/FilePreview/index.vue";
import Forward from '@/components/Forward/index.vue';
import { Events } from "@/constants";
import { globalEventBus } from "@/hooks/useEventBus";
import { useChatStore } from "@/store/modules/chat";
import { onBeforeUnmount, ref } from "vue";
import InputView from "./InputView/index.vue";
import MessageView from "./MessageView/index.vue";

// stores
const chatMessageStore = useChatStore();

// DOM refs
const containerRef = ref<HTMLElement | null>(null);
const topRef = ref<HTMLElement | null>(null);
const bottomRef = ref<HTMLElement | null>(null);
const inputRef = ref<InstanceType<typeof InputView> | null>(null);
const effectsRef = ref();

// 处理 trigger 事件（来自 InputView）
function onTrigger() {
  if (!effectsRef.value) {
    console.warn("EffectsManager 尚未就绪");
    return;
  }
  effectsRef.value?.play({
    keyword: "party",
    emojis: ["🎉"],
    count: 150,
    duration: 3000,
  });
}

/* ----- 转发逻辑 ----- */
let forwardDialogVisible = ref(false)

globalEventBus.on(Events.MESSAGE_FORWARD, (msg) => {
  forwardDialogVisible.value = true
  globalEventBus.emit(Events.MESSAGE_FORWARD_CONTENT, msg)
})

globalEventBus.on(Events.MESSAGE_FORWARD_CANCEL, () => {
  forwardDialogVisible.value = false
})
/* ----- 拖拽调整上下区域高度（带 RAF 节流，保持 EffectsManager 同步） ----- */
let startY = 0;
let startTopHeight = 0;
let startBotHeight = 0;

let resizeRaf: number | null = null;

function scheduleEffectsResize() {
  if (resizeRaf !== null) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    try {
      effectsRef.value?.updateSize?.();
    } catch { }
  });
}

function onDragStart(e: MouseEvent) {
  if (!containerRef.value || !topRef.value || !bottomRef.value) return;
  startY = e.clientY;
  startTopHeight = topRef.value.offsetHeight;
  startBotHeight = bottomRef.value.offsetHeight;

  document.addEventListener("mousemove", onDragging);
  document.addEventListener("mouseup", onDragEnd);
}

function onDragging(e: MouseEvent) {
  if (!topRef.value || !bottomRef.value) return;
  const delta = e.clientY - startY;
  const newTop = startTopHeight + delta;
  const newBot = startBotHeight - delta;

  const minTop = 50;
  const minBot = 180;

  if (newTop >= minTop && newBot >= minBot) {
    topRef.value.style.height = `${newTop}px`;
    bottomRef.value.style.height = `${newBot}px`;
    scheduleEffectsResize();
  }
}

function onDragEnd() {
  document.removeEventListener("mousemove", onDragging);
  document.removeEventListener("mouseup", onDragEnd);
  if (resizeRaf !== null) {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = null;
  }
  try {
    effectsRef.value?.updateSize?.();
  } catch { }
}

onBeforeUnmount(() => {
  document.removeEventListener("mousemove", onDragging);
  document.removeEventListener("mouseup", onDragEnd);
  if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
});
</script>

<style lang="scss" scoped>
.message-container {
  display: flex;
  flex-direction: column;
  height: 100%; // 父容器要有高度
  overflow: hidden;

  .message-content {
    position: relative;
    /* 初始占比：可在父级或 JS 中动态设置 */
    height: 70%;
    overflow: auto;

    .group-notice {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1;
    }
  }

  .drag-line {
    height: 1px;
    background-color: var(--content-drag-line-color);
    cursor: ns-resize;
    user-select: none;
    z-index: 10;
  }

  .message-input {
    height: 30%;
    overflow: auto;
  }
}

.empty-chat-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: 18px;

  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  .empty-text {
    font-size: 18px;
  }
}
</style>
