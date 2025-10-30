<template>
  <el-card :body-style="{ height: '80%' }" class="chat-card" shadow="never">
    <!-- 聊天区头部 -->
    <div class="chat-header">
      <div class="title-group">
        <h3>聊天区</h3>
        <span class="subtitle">实时聊天 · 房间内消息</span>
      </div>
      <div class="meta">
        <span class="meta-count">{{ messages.length }} 条消息</span>
      </div>
    </div>

    <!-- 消息列表 -->
    <div ref="msgsRef" aria-live="polite" class="chat-messages" role="log" @scroll="onScroll">
      <template v-if="messages && messages.length">
        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          :aria-label="`消息 ${idx + 1}，来自 ${msg.userId ?? '系统'}`"
          :class="['msg', 'msg__row', { 'msg--system': msg.system, 'msg__row--owner': isMine(msg) }]"
        >
          <!-- 系统消息（居中） -->
          <template v-if="msg.system">
            <div class="msg__meta">
              <div class="msg__system-bubble">{{ formatMessage(msg) }}</div>
            </div>
          </template>

          <!-- 常规消息 -->
          <template v-else>
            <!-- 左侧（对方）头像 -->
            <div
              v-if="!isMine(msg)"
              :aria-label="`头像 ${msg.userId}`"
              :title="msg.userId"
              class="msg__avatar msg__avatar--left no-select"
              role="img"
            >
              <!-- 优先渲染 img（若存在 avatar 且未标记为加载失败） -->
              <template v-if="getAvatar(msg.userId) && !avatarLoadError[msg.userId ?? '']">
                <img
                  :alt="`头像 ${getName(msg.userId) ?? msg.userId ?? '用户'}`"
                  :src="getAvatar(msg.userId)"
                  class="avatar-img"
                  draggable="false"
                  @error="onAvatarError(msg.userId)"
                  @load="onAvatarLoad(msg.userId)"
                />
              </template>

              <!-- 回退到首字母 -->
              <template v-else>
                <span class="avatar-initial">{{ avatarInitial(msg.userId) }}</span>
              </template>
            </div>

            <!-- 内容容器 -->
            <div :class="['msg__content', { 'msg__content--owner': isMine(msg) }]">
              <div :class="['msg__author', { 'msg__author--owner': isMine(msg) }]">
                {{ getName(msg.userId) ?? "匿名" }}
                <!-- <span class="msg__time" v-if="msg.time">· {{ formatTime(msg.time) }}</span> -->
              </div>

              <div class="msg__bubble">
                <div class="bubble">
                  <div class="bubble-text">{{ msg.body }}</div>
                </div>
              </div>
            </div>

            <!-- 右侧（自己）头像 -->
            <div
              v-if="isMine(msg)"
              :aria-label="`我的头像 ${msg.userId}`"
              :title="msg.userId"
              class="msg__avatar msg__avatar--me msg__avatar--right no-select"
              role="img"
            >
              <template v-if="getAvatar(msg.userId) && !avatarLoadError[msg.userId ?? '']">
                <img
                  :alt="`我的头像 ${getName(msg.userId) ?? msg.userId ?? '我'}`"
                  :src="getAvatar(msg.userId)"
                  class="avatar-img"
                  draggable="false"
                  @error="onAvatarError(msg.userId)"
                  @load="onAvatarLoad(msg.userId)"
                />
              </template>
              <template v-else>
                <span class="avatar-initial">{{ avatarInitial(msg.userId) }}</span>
              </template>
            </div>
          </template>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-else aria-live="polite" class="chat-empty" role="status">
        <div class="empty-illustration">💬</div>
        <div class="empty-text">暂无消息，快来聊天吧！</div>
      </div>
    </div>

    <!-- 输入区 -->
    <div aria-label="消息输入区" class="chat-input" role="region">
      <div class="input-wrap">
        <textarea
          ref="textareaRef"
          v-model="localNewMessage"
          :placeholder="placeholderText"
          aria-label="输入消息内容"
          class="custom-textarea"
          rows="5"
          @input="onInput"
          @keydown="onKeydown"
        ></textarea>
      </div>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  /**
   * ChatPanel.vue - 使用 BEM 风格 `.msg` 样式的完整页面
   */

  import { Participant } from "@/types/env";
  import { computed, defineEmits, defineProps, nextTick, reactive, ref, watch } from "vue";

  /* ========== props / emits ========== */
  const props = defineProps<{
    participants: Map<string, Participant> | Participant[] | string[] | null | undefined;
    messages: { userId?: string; body: string; time?: string | number; system?: boolean }[];
    newMessage?: string;
    userId?: string;
  }>();

  const emits = defineEmits<{
    (e: "send-message"): void;
    (e: "update:newMessage", v: string): void;
  }>();

  /* ========== 本地 state ========== */
  const localNewMessage = ref(props.newMessage ?? "");

  watch(localNewMessage, v => {
    emits("update:newMessage", v);
  });

  /* textarea / messages DOM refs */
  const textareaRef = ref<HTMLTextAreaElement | null>(null);
  const msgsRef = ref<HTMLElement | null>(null);

  /* 自动滚动 / 用户手动滚动控制 */
  let isUserScrolling = false;
  let lastScrollTop = 0;

  /* 是否可发送 */
  const canSend = computed(() => (localNewMessage.value || "").trim().length > 0);

  /* placeholder */
  const placeholderText = "输入消息，按 Enter 发送（Shift+Enter 换行）";

  const avatarLoadError = reactive<Record<string, boolean>>({});

  function onAvatarError(userId?: string) {
    if (!userId) return;
    avatarLoadError[userId] = true;
    // 若需要强制重绘，可在此执行其它逻辑
  }

  function onAvatarLoad(userId?: string) {
    if (!userId) return;
    // 确保之前的错误记录被清除（如果缓存的 URL 恰好恢复）
    if (avatarLoadError[userId]) {
      delete avatarLoadError[userId];
    }
  }

  /* textarea input */
  function onInput() {
  }

  function getName(userId: string | undefined) {
    if (userId) {
      return getParticipant(userId)?.name;
    }
    return undefined;
  }

  function getAvatar(userId: string | undefined) {
    if (userId) {
      return getParticipant(userId)?.avatar;
    }
    return undefined;
  }

  /** 从 participants 获取 Participant 对象（防御型） */
  function getParticipant(userId: string): Participant | undefined {
    const p = props.participants as any;
    if (!p) return undefined;
    if (p instanceof Map) return p.get(userId);
    if (Array.isArray(p)) {
      if (typeof p[0] === "string") return undefined;
      return (p as Participant[]).find(item => (item.userId ?? "") === userId);
    }
    return undefined;
  }

  /* 键盘处理 */
  function onKeydown(e: KeyboardEvent) {
    const key = e.key;
    if (key === "Enter" || key === "NumpadEnter") {
      const isShift = e.shiftKey;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (!isShift) {
        e.preventDefault();
        if (canSend.value) doSend();
      }
      if (isCtrlOrCmd && canSend.value) {
        e.preventDefault();
        doSend();
      }
    }
  }

  /* 发送逻辑 */
  function doSend() {
    emits("send-message");
    localNewMessage.value = "";
    nextTick(() => {
      // adjustTextareaHeight();
      scrollToBottom(true);
    });
  }

  /* 头像首字母 */
  function avatarInitial(name?: string) {
    if (!name) return "U";
    return String(name).trim().charAt(0).toUpperCase();
  }

  /* 判断是否为自己消息 */
  function isMine(msg: { userId?: string }) {
    if (!props.userId) return false;
    return msg.userId === props.userId;
  }

  function formatMessage(message: any) {
    return message.body.trim() ?? "";
  }

  /* 平滑滚动到底部 */
  function scrollToBottom(force = false) {
    const el = msgsRef.value;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (!force && isUserScrolling && distanceToBottom > 200) return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
  }

  /* 监听 messages 变化滚动 */
  watch(
    () => props.messages.length,
    () => {
      setTimeout(() => {
        scrollToBottom();
      }, 80);
    }
  );

  /* 用户滚动行为 */
  function onScroll() {
    const el = msgsRef.value;
    if (!el) return;
    const st = el.scrollTop;
    if (Math.abs(st - lastScrollTop) > 5) {
      isUserScrolling = true;
      clearTimeout((onScroll as any)._timer);
      (onScroll as any)._timer = setTimeout(() => {
        isUserScrolling = false;
      }, 1000);
    }
    lastScrollTop = st;
  }
</script>

<style lang="scss" scoped>
  // 你提供的变量与 msg 风格（合并保留页面其它样式）
  $avatar-size: 40px;
  $avatar-size-sm: 36px;
  $gap: 12px;
  $meta-padding-x: 6px;
  $max-content-width: 70%;
  $transition-fast: 0.2s;

  .chat-card {
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    height: 100%;
    display: flex;
    flex-direction: column;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  }

  /* Header */
  .chat-header {
    padding: 16px 20px;
    border-bottom: 1px solid #f0f2f5;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(180deg, #fafafa, #ffffff);

    .title-group {
      display: flex;
      flex-direction: column;
      gap: 4px;

      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #1f2a44;
      }

      .subtitle {
        font-size: 12px;
        color: #6b7280;
      }
    }

    .meta-count {
      font-size: 12px;
      color: #6b7280;
      background: #f3f4f6;
      padding: 4px 8px;
      border-radius: 12px;
    }
  }

  /* Messages 主容器 */
  .chat-messages {
    flex: 1;
    padding: 10px;
    overflow-y: auto;
    background: #f9fafb;
    scroll-behavior: smooth;
    height: 90%;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    /* -------------- 你的 .msg 风格 -------------- */
    .msg {
      min-height: 0;
      margin: 6px 0;

      // 系统消息
      &--system {
        display: flex;
        justify-content: center;
        margin: 12px 0;

        .msg__system-bubble {
          font-size: 12px;
          padding: 8px 16px;
          max-width: 70%;
          text-align: center;
          line-height: 1.5;
          backdrop-filter: blur(6px);
        }
      }

      &__row {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        padding: 10px 5px 20px 5px;
        transition: background-color $transition-fast ease, transform $transition-fast ease;
        gap: $gap;

        &--owner {
          /* 用于修饰自己消息（配合子元素） */
        }

        & > .msg__meta {
          order: 0;
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          padding: 0 $meta-padding-x;
          display: grid;
          grid-template-rows: auto auto;
          row-gap: 8px;
          justify-items: center;
        }

        & > .msg__avatar {
          order: 1;
          width: $avatar-size;
          height: $avatar-size;
          flex: 0 0 $avatar-size;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform $transition-fast ease, box-shadow $transition-fast ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
          border: 2px solid transparent;

          &:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
            border-color: var(--content-active-color, #409eff);
          }

          &--me {
            background: #93c5fd; /* Distinct color for own avatar */
            color: #1e3a8a;
          }

          &--left {
            order: 1;
          }

          &--right {
            order: 2;
          }
        }

        .msg__content {
          order: 1;
          display: flex;
          flex-direction: column;
          // flex: 1 1 auto;
          min-width: 0;
          max-width: $max-content-width;

          &--owner {
            align-items: flex-end;
            margin-left: auto;
          }

          .msg__author {
            font-size: 12px;
            color: #374151;
            margin-bottom: 4px;
            font-weight: 500;
            opacity: 0.85;
            letter-spacing: 0.3px;

            &--owner {
              text-align: right;
            }
          }

          .msg__bubble {
            position: relative;
            word-break: break-word;
            overflow-wrap: anywhere;

            .bubble {
              background: #ffffff;
              border-radius: 12px;
              padding: 10px 14px;
              box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
            }

            .bubble-text {
              font-size: 14px;
              line-height: 1.5;
              word-break: break-word;
            }
          }
        }
      }

      @media (max-width: 640px) {
        .msg__row {
          padding: 10px;
          gap: 8px;

          > .msg__avatar {
            width: $avatar-size-sm;
            height: $avatar-size-sm;
            flex: 0 0 $avatar-size-sm;
            margin: 0 8px;
          }

          .msg__content {
            max-width: 100%;
          }
        }
      }

      .msg__more {
        margin: 0;
        padding: 8px;
        color: var(--content-active-color, #539df3);
        background-color: transparent;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        border: none;
        outline: none;
        user-select: none;
        transition: color 0.2s;
        transition: transform $transition-fast ease, box-shadow $transition-fast ease;

        &:active {
          transform: translateY(0);
        }
      }

      .msg__time {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        color: #6b7280;
        opacity: 0.8;
        white-space: nowrap;
      }

      .msg__loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        color: #6b7280;
        opacity: 0.6;
        font-size: 12px;
        animation: pulse 1.5s ease-in-out infinite;
      }

      .msg__popover {
        border-radius: 8px;
      }
    }
  }

  .avatar-img {
    width: $avatar-size;
    height: $avatar-size;
    display: block;
    object-fit: cover;
    object-position: center;
    border-radius: 5px;
  }

  /* 首字母占位 */
  .avatar-initial {
    display: inline-block;
    width: $avatar-size;
    height: $avatar-size;
    line-height: 40px;
    text-align: center;
    user-select: none;
  }

  @keyframes pulse {
    0% {
      opacity: 0.6;
      transform: translateY(0);
    }
    50% {
      opacity: 0.9;
      transform: translateY(-2px);
    }
    100% {
      opacity: 0.6;
      transform: translateY(0);
    }
  }

  /* Empty State */
  .chat-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #6b7280;

    .empty-illustration {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .empty-text {
      font-size: 16px;
    }
  }

  /* Input Area */
  .chat-input {
    padding: 16px 0px;
    border-top: 1px solid #f0f2f5;
    background: #ffffff;

    .input-wrap {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      background: #f3f4f6;
      border-radius: 12px;
      padding: 8px 12px;
      transition: background 0.2s ease;
    }

    .custom-textarea {
      flex: 1;
      border: none;
      background: transparent;
      resize: none;
      font-size: 14px;
      line-height: 1.5;
      color: #1f2a44;
      outline: none;
      min-height: 32px;
      max-height: 220px;
      width: 100%;
      font-family: inherit;

      &::placeholder {
        color: #9ca3af;
      }

      &::-webkit-scrollbar {
        width: 4px;
      }

      &::-webkit-scrollbar-thumb {
        background: #d1d5db;
        border-radius: 2px;
      }
    }
  }
</style>
