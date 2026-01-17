<template>
  <div :id="`message-${message.messageId}`" v-context-menu="menuConfig"
    v-memo="[message.messageId, message.isOwner, message.messageTime]" :class="bubbleClass" class="message-bubble"
    @click="handleLinkClick">
    <div v-dompurify="processedText" class="message-bubble__text" translate="yes" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { urlToLink, escapeHtml, extractMessageText } from "@/utils/Strings";
import { openUrl } from "@tauri-apps/plugin-opener";
import ClipboardManager from "@/utils/Clipboard";
import { globalEventBus } from "@/hooks/useEventBus";
import { MessageContentType } from "@/constants";
import { storage } from "@/utils/Storage";

// ===================== 类型定义 =====================

interface MessageBody {
  text?: string;
  [key: string]: unknown;
}

interface Message {
  messageId: string;
  messageTime: number;
  messageContentType?: number;
  messageBody?: MessageBody;
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

// ===================== 常量 =====================

/** 消息撤回时限（毫秒） */
const RECALL_TIME_LIMIT = Number(import.meta.env.VITE_MESSAGE_RECALL_TIME) || 120000;

/** 协议前缀候选 */
const URL_SCHEMES = ["https://", "http://", "ftp://", "ftps://"] as const;

// ===================== 计算属性 =====================

/** 气泡样式类 */
const bubbleClass = computed(() => [
  "bubble",
  props.message.type,
  { owner: props.message.isOwner }
]);

/** 处理后的消息文本 */
const processedText = computed(() => {
  const rawText = extractMessageText(props.message.messageBody, "text");
  if (!rawText) return "";
  return urlToLink(escapeHtml(rawText));
});

/** 是否为消息所有者 */
const isOwner = computed(() => {
  const msg = props.message;
  if (typeof msg.isOwner === "boolean") return msg.isOwner;
  const currentUserId = storage.get("userId");
  return currentUserId != null && String(msg.fromId) === String(currentUserId);
});

/** 是否可撤回（2分钟内的自己消息） */
const canRecall = computed(() => {
  if (!isOwner.value) return false;
  const elapsed = Date.now() - (props.message.messageTime || 0);
  return elapsed >= 0 && elapsed <= RECALL_TIME_LIMIT;
});

/** 右键菜单配置 */
const menuConfig = computed(() => ({
  options: buildMenuOptions(),
  callback: handleMenuAction
}));

// ===================== 方法 =====================

/**
 * 构建菜单选项
 */
function buildMenuOptions(): MenuOption[] {
  const options: MenuOption[] = [
    { label: "复制", value: "copy" },
    { label: "删除", value: "delete" }
  ];

  if (canRecall.value) {
    options.splice(1, 0, { label: "撤回", value: "recall" });
  }

  return options;
}

/**
 * 处理菜单操作
 */
async function handleMenuAction(action: string): Promise<void> {
  const msg = props.message;

  try {
    switch (action) {
      case "copy":
        await handleCopy(msg);
        break;
      case "recall":
        globalEventBus.emit("message:recall", msg);
        break;
      case "delete":
        await confirmDelete(msg);
        break;
    }
  } catch {
    // 用户取消或操作失败，静默处理
  }
}

/**
 * 复制消息内容
 */
async function handleCopy(msg: Message): Promise<void> {
  await ClipboardManager.clear();

  if (msg.messageContentType === MessageContentType.TEXT.code) {
    const text = extractMessageText(msg.messageBody, "text");
    await ClipboardManager.writeText(text);
    useLogger().prettySuccess("copy text success", text);
  }
}

/**
 * 确认删除
 */
async function confirmDelete(msg: Message): Promise<void> {
  await ElMessageBox.confirm(
    `确定删除与 ${msg.name || "该用户"} 的会话?`,
    "删除会话",
    {
      distinguishCancelAndClose: true,
      confirmButtonText: "确认",
      cancelButtonText: "取消"
    }
  );
}

/**
 * 处理链接点击
 */
async function handleLinkClick(e: MouseEvent): Promise<void> {
  const target = e.target as HTMLElement;

  // 只处理带 data-url 的链接
  if (target.tagName !== "A" || !target.dataset.url) return;

  e.preventDefault();
  const url = target.dataset.url;

  try {
    await openSafeUrl(url);
  } catch {
    console.warn("链接打开失败:", url);
  }
}

/**
 * 安全打开 URL
 * 自动尝试多种协议前缀
 */
async function openSafeUrl(raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (!trimmed) return;

  // 已有协议则直接打开
  const hasScheme = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed);
  if (hasScheme) {
    await openUrl(trimmed);
    return;
  }

  // 尝试各协议前缀
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
  background-color: #e1f5fe;

  &__text {
    padding: 10px;
    border-radius: 8px;
    background-color: #e1f5fe;
    white-space: break-spaces;
    line-height: 1.5;

    // 链接样式
    :deep(.text-link) {
      color: var(--text-link-color);
      text-decoration: none;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  // 自己的消息
  &.owner &__text {
    background-color: #dcf8c6;
  }

  &:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }
}
</style>
