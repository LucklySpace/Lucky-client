<template>
  <div v-if="showBanner" class="group-notice-banner" role="button" @click="openDialog">
    <i class="iconfont icon-gonggao" aria-hidden="true"></i>
    <span class="prefix">【 {{ t('group.notice.prefix') }} 】</span>
    <span class="text" :title="oneLineText">{{ oneLineText }}</span>
  </div>

  <el-dialog v-model="dialogVisible" :title="$t('group.notice.title')" width="520px" @close="markRead">
    <div class="notice-content">
      <pre class="content">{{ fullText }}</pre>
    </div>
    <template #footer>
      <el-button type="primary" @click="closeAndRead">{{ $t("group.notice.known") }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, onMounted, onBeforeUnmount, ref } from "vue";
  import { useChatStore } from "@/store/modules/chat";
  import { globalEventBus } from "@/hooks/useEventBus";
  import { CHAT_CHANGED, GROUP_NOTICE_CHANGED } from "@/constants/events";
  import { IMessageType } from "@/constants";
  import { useI18n } from "vue-i18n";

  type NoticePayload = {
    chatId?: string | number;
    groupId?: string | number;
    content?: string;
  };

  const chatStore = useChatStore() as any;
  const { t } = useI18n();

  const dialogVisible = ref(false);
  const currentText = ref("");
  // 读状态本地响应式标记：用于立即隐藏横幅（localStorage 非响应式）
  const readFlag = ref(false);

  const isGroupChat = computed(() => {
    const cc = chatStore.currentChat;
    return !!cc && cc.chatType === IMessageType.GROUP_MESSAGE.code;
  });

  const chatId = computed(() => chatStore.currentChat?.chatId || chatStore.currentChat?.id);

  const fullText = computed(() => {
    const fromChat = (chatStore.currentChat?.notification || "").toString();
    return (currentText.value || fromChat || "").trim();
  });

  const oneLineText = computed(() => {
    const base = fullText.value || "";
    if (!base) return "";
    const line = base.split(/\r?\n/)[0] || base;
    const max = 25;
    return line.length > max ? line.slice(0, max) + "…" : line;
  });

  function hash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 131 + str.charCodeAt(i)) >>> 0;
    }
    return h.toString(16);
  }

  function readKey(): string {
    const id = chatId.value ?? "unknown";
    const txt = fullText.value ?? "";
    return `groupNoticeRead:${id}:${hash(txt)}`;
  }

  const showBanner = computed(() => {
    if (!isGroupChat.value) return false;
    if (!fullText.value) return false;
    if (readFlag.value) return false; // 立即隐藏（点击确认后）
    const key = readKey();
    return !localStorage.getItem(key);
  });

  function markRead() {
    if (!fullText.value) return;
    const key = readKey();
    localStorage.setItem(key, "1");
    readFlag.value = true; // 立刻隐藏横幅与弹窗
  }

  function openDialog() {
    if (!fullText.value) return;
    dialogVisible.value = true;
  }

  function closeAndRead() {
    markRead();
    dialogVisible.value = false;
  }

  function handleChatChanged() {
    currentText.value = "";
    readFlag.value = false; // 切换会话后重置（是否显示由 localStorage 决定）
  }

  function handleNoticeChanged(payload?: NoticePayload) {
    const cid = chatId.value;
    const target = payload?.chatId ?? payload?.groupId;
    if (!cid || (target && String(target) !== String(cid))) return;
    if (payload?.content) {
      currentText.value = String(payload.content);
      readFlag.value = false; // 新公告到来，允许再次显示
    }
  }

  onMounted(() => {
    globalEventBus.on(CHAT_CHANGED as any, handleChatChanged as any);
    globalEventBus.on(GROUP_NOTICE_CHANGED as any, handleNoticeChanged as any);
  });

  onBeforeUnmount(() => {
    globalEventBus.off(CHAT_CHANGED as any, handleChatChanged as any);
    globalEventBus.off(GROUP_NOTICE_CHANGED as any, handleNoticeChanged as any);
  });
</script>

<style scoped>
  .group-notice-banner {
    /* 可配置两侧留白，不撑破父容器 */
    --notice-gap: 10px;

    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    /* 留白通过 margin 实现，同时缩小自身宽度抵消，避免横向滚动条 */
    width: calc(100% - var(--notice-gap) * 2);
    margin: 6px var(--notice-gap) 8px;
    box-sizing: border-box; /* 内边距/边框计入宽度，避免溢出 */
    overflow: hidden; /* 防止横向滚动条 */
    border-radius: 6px;
    font-size: 13px;
    background: #dddddd1c;
    color: #1f2d3d;
    border: 1px solid var(--header-border-bottom-color);
    cursor: pointer;
  }
  /* 仅在消息内容容器内渲染，不使用 fixed，避免影响其它区域 */
  .group-notice-banner .prefix {
    color: #409eff;
  }
  .group-notice-banner .text {
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .group-notice-banner .action {
    flex: 0 0 auto;
    color: #409eff;
    font-weight: 500;
  }
  .notice-content .content {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
    max-height: 60vh; /* 控制弹窗内高度，避免出现页面整体滚动条 */
    overflow: auto;
  }
</style>
