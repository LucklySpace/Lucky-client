<template>
  <div class="meeting-root" role="application">
    <transition name="fade-up">
      <div
        :style="{ backgroundColor: showControls ? '#eee' : 'transparent' }"
        class="video-call-header"
        data-tauri-drag-region
        role="region"
      >
        <el-row style="height: 30px">
          <el-col :span="20" data-tauri-drag-region></el-col>
          <el-col :span="4">
            <System v-show="showControls" :maxVisible="false" about-visible @handleClose="handUp" />
          </el-col>
        </el-row>
      </div>
    </transition>

    <el-container class="meeting-page" @mouseenter="onUserEnter" @mouseleave="onUserLeave" @mousemove="onUserActivity">
      <!-- 视频区 -->
      <el-main class="video-section">
        <VideoGrid :id="userStore.userId" :participants="participantsMap" :set-ref="setRef" />
      </el-main>

      <!-- 小屏遮罩（仅在移动/窄屏且侧栏展开时显示） -->
      <div
        v-if="isMobile"
        :class="['chat-backdrop', { 'is-open': !isChatCollapsed }]"
        aria-hidden="true"
        @click="toggleChat && toggleChat()"
      ></div>

      <!-- 聊天侧栏（响应式：大屏是常规 aside；小屏是抽屉） -->
      <el-aside
        :class="['chat-section', { 'chat-drawer': isMobile, open: !isChatCollapsed }]"
        :style="{ display: isChatCollapsed && !isMobile ? 'none' : '' }"
      >
        <ChatPanel
          v-model:newMessage="newMessage"
          :messages="messages"
          :participants="participantsMap"
          :user-id="userStore.userId"
          @send-message="sendMessage"
        />
      </el-aside>

      <!-- 底部控制栏 -->
      <transition name="fade-up">
        <ControlsBar
          v-show="showControls"
          :is-chat-collapsed="isChatCollapsed"
          :is-muted="isMuted"
          :is-video-off="isVideoOff"
          @toggle-mute="toggleMute"
          @toggle-video="toggleVideo"
          @hang-up="handUp"
          @toggle-chat="toggleChat"
          @mouseenter.native="onControlsEnter"
          @mouseleave.native="onControlsLeave"
        />
      </transition>
    </el-container>
  </div>
</template>

<script lang="ts" setup>
  import { onBeforeUnmount, onMounted, ref } from "vue";
  import { useCallStore } from "@/store/modules/call";
  import { useUserStore } from "@/store/modules/user";
  import System from "@/components/System/index.vue";
  import VideoGrid from "./components/VideoGrid.vue";
  import ChatPanel from "./components/ChatPanel.vue";
  import ControlsBar from "./components/ControlsBar.vue";
  import useMeeting from "./services/useMeeting";

  const callStore = useCallStore();
  const userStore = useUserStore();

  const meeting = useMeeting({ callStore, userStore });

  const {
    setRef,
    messages,
    newMessage,
    participantsMap,
    isChatCollapsed,
    showControls,
    isMuted,
    isVideoOff,
    onUserActivity,
    onUserEnter,
    onUserLeave,
    onControlsEnter,
    onControlsLeave,
    toggleMute,
    toggleVideo,
    toggleChat,
    sendMessage,
    handUp
  } = meeting;

  /**
   * 响应式判断是否为移动/窄屏（阈值可调）
   * - isMobile: true 时侧栏变成抽屉覆盖模式
   */
  const mobileBreakpoint = 900; // px，按需调整
  const isMobile = ref(window.innerWidth <= mobileBreakpoint);

  const onResize = () => {
    isMobile.value = window.innerWidth <= mobileBreakpoint;
  };

  onMounted(() => {
    window.addEventListener("resize", onResize, { passive: true });
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", onResize);
  });
</script>

<style lang="scss" scoped>
  /* 保留你原有的变量与样式，上面略去未改动的部分 */
  $header-height: 36px;
  $video-bg: #111217;
  $video-card-bg: #22242a;
  $chat-bg: #2a2a2c;
  $primary-color: #1677ff;
  $danger-color: #e05b5b;
  $btn-size: 56px;
  $btn-bg: rgba(255, 255, 255, 0.06);
  $btn-shadow: 0 6px 18px rgba(3, 8, 15, 0.45);
  $control-z: 1200;

  /* 根容器，确保全屏高度 */
  .meeting-root {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: $video-bg;
    color: #fff;
    box-sizing: border-box;
  }

  /* 侧栏：响应式宽度与抽屉样式 */
  .chat-section {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding: 12px;
    gap: 12px;

    /* 动态宽度：最小 260px，首选 28vw，最大 420px */
    width: clamp(260px, 28vw, 420px);
    min-width: 260px;
    max-width: 420px;

    background: $chat-bg;
    border-left: 1px solid rgba(0, 0, 0, 0.06);
    min-height: 0; /* 允许内部滚动 */

    /* 内部滚动容器（ChatPanel 内部也应使用 overflow-y:auto） */
    & > * {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
    }
  }

  /* 小屏时改为抽屉（覆盖在右侧） */
  .chat-drawer {
    position: fixed;
    top: $header-height;
    right: 0;
    height: calc(100vh - #{$header-height});
    width: min(86vw, 420px); /* 小屏抽屉占屏宽比 */
    max-width: 420px;
    min-width: 260px;

    transform: translateX(100%);
    transition: transform 240ms ease, box-shadow 200ms ease;
    z-index: 1300;
    box-shadow: -8px 0 24px rgba(2, 6, 23, 0.6);
    border-left: none;
    background: $chat-bg;
    padding: 12px;

    /* 当 open 时滑入 */
    &.open {
      transform: translateX(0);
    }

    /* 确保内部可滚动 */
    & > * {
      height: 100%;
      overflow-y: auto;
    }
  }

  /* 半透明遮罩（仅在移动/窄屏且侧栏打开时显示） */
  .chat-backdrop {
    position: fixed;
    inset: $header-height 0 0 0; /* 从 header 下方开始覆盖 */
    background: rgba(0, 0, 0, 0);
    z-index: 1200;
    pointer-events: none;
    transition: background 240ms ease;

    &.is-open {
      background: rgba(0, 0, 0, 0.36);
      pointer-events: auto;
    }
  }

  /* 在中等屏上强制最小宽度，避免内容挤压 */
  @media (max-width: 1200px) {
    .chat-section {
      width: clamp(260px, 34vw, 380px);
    }
  }

  /* 更窄屏幕时隐藏为抽屉（已通过 isMobile 控制类，不全依赖 CSS） */
  @media (max-width: 900px) {
    .chat-section {
      /* 在窄屏时，默认用抽屉样式（class .chat-drawer 将生效） */
      display: block;
    }
  }

  /* 一些小优化：确保 video-section 在有侧栏时不会被压扁太小 */
  .video-section {
    min-width: 300px;
  }
</style>
