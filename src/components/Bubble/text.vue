<template>
  <div :id="`message-${message.messageId}`" v-context-menu="menuConfig"
    v-memo="[message.messageId, message.isOwner, message.messageTime, linkMeta?.url, replyInfo?.messageId]"
    :class="bubbleClass" class="message-bubble" @click="handleLinkClick">

    <!-- 链接卡片模式 -->
    <div v-if="linkMeta" class="link-card" @click="openLink">
      <div class="link-card__icon">
        <img v-if="linkMeta.icon" :src="linkMeta.icon" alt="" @error="onIconError" />
      </div>
      <div class="link-card__content">
        <div class="link-card__title" :title="linkMeta.title">{{ linkMeta.title }}</div>
        <div v-if="linkMeta.description" class="link-card__desc" :title="linkMeta.description">
          {{ linkMeta.description }}
        </div>
      </div>
    </div>

    <!-- 加载中 -->
    <div v-else-if="isLinkLoading" class="link-card link-card--loading">
      <div class="link-card__skeleton">
        <div class="skeleton-icon"></div>
        <div class="skeleton-content">
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line skeleton-desc"></div>
        </div>
      </div>
    </div>

    <!-- 普通文本模式 -->
    <div v-else v-dompurify="processedText" class="message-bubble__text" translate="yes" />

    <!-- 引用消息显示（在消息下方） -->
    <ReplyQuote v-if="replyInfo" :replyMessage="replyInfo" :senderName="replySenderName" />
  </div>
</template>

<script lang="ts" setup>
import { Events, MessageContentType } from "@/constants";
import { globalEventBus } from "@/hooks/useEventBus";
import { fetchLinkMeta, isPureUrl, type LinkMeta } from "@/hooks/useLinkPreview";
import { useChatStore } from "@/store/modules/chat";
import ClipboardManager from "@/utils/Clipboard";
import { storage } from "@/utils/Storage";
import { escapeHtml, extractMessageText, urlToLink } from "@/utils/Strings";
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import ReplyQuote from "./ReplyQuote.vue";

// ===================== 类型定义 =====================

interface MessageBody {
  text?: string;
  [key: string]: unknown;
}

interface ReplyMessageInfo {
  messageId?: string;
  fromId?: string;
  previewText?: string;
  messageContentType?: number;
}

interface Message {
  messageId: string;
  messageTime: number;
  messageContentType?: number;
  messageBody?: MessageBody & { replyMessage?: ReplyMessageInfo };
  fromId?: string;
  isOwner?: boolean;
  type?: string;
  name?: string;
}

interface MenuOption {
  label: string;
  value: string;
}

// ===================== Props =====================

const props = defineProps<{
  message: Message;
}>();

const { t } = useI18n();
const chatStore = useChatStore();

// ===================== 常量 =====================

const RECALL_TIME_LIMIT = Number(import.meta.env.VITE_MESSAGE_RECALL_TIME) || 120000;
const URL_SCHEMES = ["https://", "http://", "ftp://", "ftps://"] as const;

// ===================== 链接预览状态 =====================

const linkMeta = ref<LinkMeta | null>(null);
const isLinkLoading = ref(false);
const iconFailed = ref(false);
const previewFailed = ref(false);

// ===================== 计算属性 =====================

const bubbleClass = computed(() => [
  "bubble",
  props.message.type,
  { owner: props.message.isOwner, "has-link-card": !!linkMeta.value }
]);

/** 原始文本 */
const rawText = computed(() => extractMessageText(props.message.messageBody, "text") || "");

/** 是否为纯链接 */
const isPureLink = computed(() => isPureUrl(rawText.value));

/** 处理后的消息文本 */
const processedText = computed(() => {
  if (!rawText.value) return "";
  return urlToLink(escapeHtml(rawText.value));
});

const isOwner = computed(() => {
  const msg = props.message;
  if (typeof msg.isOwner === "boolean") return msg.isOwner;
  const currentUserId = storage.get("userId");
  return currentUserId != null && String(msg.fromId) === String(currentUserId);
});

const canRecall = computed(() => {
  if (!isOwner.value) return false;
  const elapsed = Date.now() - (props.message.messageTime || 0);
  return elapsed >= 0 && elapsed <= RECALL_TIME_LIMIT;
});

const menuConfig = computed(() => ({
  options: buildMenuOptions(),
  callback: handleMenuAction
}));

// 从 messageBody 获取引用消息
const replyInfo = computed(() => props.message.messageBody?.replyMessage);

// 获取被引用消息的发送者名称
const replySenderName = computed(() => {
  const replyFromId = replyInfo.value?.fromId;
  if (!replyFromId) return "";

  const currentUserId = storage.get("userId");
  if (String(replyFromId) === String(currentUserId)) {
    return t("components.message.me");
  }

  // 从群成员中获取名称
  const membersMap = chatStore.currentChatGroupMemberMap;
  const member = membersMap?.[String(replyFromId)];
  return member?.name || replyFromId;
});

// ===================== 链接预览加载 =====================

const loadLinkPreview = async () => {
  if (!isPureLink.value) {
    linkMeta.value = null;
    return;
  }

  isLinkLoading.value = true;
  iconFailed.value = false;
  previewFailed.value = false;

  try {
    linkMeta.value = await fetchLinkMeta(rawText.value);
  } catch {
    linkMeta.value = null;
  } finally {
    isLinkLoading.value = false;
  }
};

// 监听消息变化
watch(() => props.message.messageId, loadLinkPreview, { immediate: true });
onMounted(loadLinkPreview);

// ===================== 事件处理 =====================

const onIconError = (e: Event) => {
  iconFailed.value = true;
  (e.target as HTMLImageElement).style.display = "none";
};

const onPreviewError = (e: Event) => {
  previewFailed.value = true;
  (e.target as HTMLImageElement).style.display = "none";
};

const openLink = async () => {
  if (linkMeta.value?.url) {
    try {
      await openUrl(linkMeta.value.url);
    } catch (e) {
      console.warn("打开链接失败:", e);
    }
  }
};

// ===================== 方法 =====================

function buildMenuOptions(): MenuOption[] {
  const options: MenuOption[] = [
    { label: t("components.bubble.reply.action"), value: "reply" },
    { label: t("common.actions.copy"), value: "copy" },
    { label: t("common.actions.delete"), value: "delete" }
  ];

  if (linkMeta.value) {
    options.splice(1, 0, { label: t("common.actions.copyLink"), value: "copyLink" });
  }

  if (canRecall.value) {
    options.splice(options.length - 1, 0, { label: t("common.actions.recall"), value: "recall" });
  }

  return options;
}

async function handleMenuAction(action: string): Promise<void> {
  const msg = props.message;

  try {
    switch (action) {
      case "reply":
        handleReply(msg);
        break;
      case "copy":
        await handleCopy(msg);
        break;
      case "copyLink":
        if (linkMeta.value?.url) {
          await ClipboardManager.writeText(linkMeta.value.url);
          useLogger().prettySuccess("copy link success", linkMeta.value.url);
        }
        break;
      case "recall":
        globalEventBus.emit("message:recall", msg);
        break;
      case "delete":
        await confirmDelete(msg);
        break;
    }
  } catch {
    // 用户取消或操作失败
  }
}

/** 处理回复消息 */
function handleReply(msg: Message): void {
  const previewText = extractMessageText(msg.messageBody, "text") || "";
  globalEventBus.emit(Events.MESSAGE_REPLY, {
    messageId: msg.messageId,
    fromId: msg.fromId,
    previewText: previewText.length > 100 ? previewText.slice(0, 100) + "..." : previewText,
    messageContentType: msg.messageContentType || MessageContentType.TEXT.code,
    senderName: msg.name || msg.fromId
  });
}

async function handleCopy(msg: Message): Promise<void> {
  await ClipboardManager.clear();

  if (msg.messageContentType === MessageContentType.TEXT.code) {
    const text = extractMessageText(msg.messageBody, "text");
    await ClipboardManager.writeText(text);
    useLogger().prettySuccess("copy text success", text);
  }
}

async function confirmDelete(msg: Message): Promise<void> {
  await ElMessageBox.confirm(
    t("components.dialog.deleteSession.confirm", { name: msg.name || t("components.bubble.reply.unknown") }),
    t("components.dialog.deleteSession.title"),
    {
      distinguishCancelAndClose: true,
      confirmButtonText: t("components.dialog.buttons.confirm"),
      cancelButtonText: t("components.dialog.buttons.cancel")
    }
  );
}

async function handleLinkClick(e: MouseEvent): Promise<void> {
  const target = e.target as HTMLElement;
  if (target.tagName !== "A" || !target.dataset.url) return;

  e.preventDefault();
  const url = target.dataset.url;

  try {
    await openSafeUrl(url);
  } catch {
    console.warn("链接打开失败:", url);
  }
}

async function openSafeUrl(raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (!trimmed) return;

  const hasScheme = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed);
  if (hasScheme) {
    await openUrl(trimmed);
    return;
  }

  let lastError: unknown;
  for (const scheme of URL_SCHEMES) {
    try {
      await openUrl(scheme + trimmed);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}
</script>

<style lang="scss" scoped>
.message-bubble {
  display: inline-block;
  position: relative;
  font-size: 14px;
  color: #333;
  border-radius: 8px;
  word-wrap: break-word;
  max-width: 100%;

  &.has-link-card {
    background: transparent;
  }

  &__text {
    padding: 10px;
    border-radius: 8px;
    background-color: #e1f5fe;
    white-space: break-spaces;
    line-height: 1.5;

    :deep(.text-link) {
      color: var(--text-link-color);
      text-decoration: none;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  &.owner &__text {
    background-color: #dcf8c6;
  }

  // &:hover {
  //   box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  // }
}

// ===================== 链接卡片样式 =====================

.link-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 6px;
  cursor: pointer;
  max-width: 240px;
  min-width: 240px;

  &:hover {
    background: #eeeeee;
  }

  // 图标
  &__icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 6px;
    overflow: hidden;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }

  // 内容区
  &__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__title {
    font-size: 13px;
    font-weight: 500;
    color: var(--content-font-color, #333);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__desc {
    font-size: 12px;
    color: var(--content-message-font-color, #90969b);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 加载状态
  &--loading {
    pointer-events: none;
  }

  &__skeleton {
    display: flex;
    gap: 10px;
    width: 100%;
  }
}

// 骨架屏动画
.skeleton-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: #e0e0e0;
  animation: skeleton-pulse 1.5s infinite;
}

.skeleton-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skeleton-line {
  height: 12px;
  border-radius: 3px;
  background: #e0e0e0;
  animation: skeleton-pulse 1.5s infinite;

  &.skeleton-title {
    width: 80%;
  }

  &.skeleton-desc {
    width: 60%;
    height: 10px;
  }
}

@keyframes skeleton-pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

// 自己发送的链接卡片
.message-bubble.owner .link-card {
  background: rgba(255, 255, 255, 0.3);

  &:hover {
    background: rgba(255, 255, 255, 0.4);
  }
}

// 暗色主题适配
:root[data-theme="dark"] {
  .link-card {
    background: rgba(255, 255, 255, 0.08);

    &:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    &__icon {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  .message-bubble.owner .link-card {
    background: rgba(0, 0, 0, 0.15);

    &:hover {
      background: rgba(0, 0, 0, 0.2);
    }
  }

  .skeleton-icon,
  .skeleton-line {
    background: rgba(255, 255, 255, 0.1);
  }
}
</style>
