<template>
  <div :id="`message-${message.messageId}`" v-context-menu="menuConfig"
    v-memo="[message.messageId, message.isOwner, message.messageTime, linkMeta?.url]" :class="bubbleClass"
    class="message-bubble" @click="handleLinkClick">

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
        <!-- <div class="link-card__url">{{ displayDomain }}</div> -->
      </div>
      <!-- <div v-if="linkMeta.image" class="link-card__preview">
        <img :src="linkMeta.image" alt="" @error="onPreviewError" />
      </div> -->
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
  </div>
</template>

<script lang="ts" setup>
import { MessageContentType } from "@/constants";
import { globalEventBus } from "@/hooks/useEventBus";
import { fetchLinkMeta, isPureUrl, type LinkMeta } from "@/hooks/useLinkPreview";
import ClipboardManager from "@/utils/Clipboard";
import { storage } from "@/utils/Storage";
import { escapeHtml, extractMessageText, urlToLink } from "@/utils/Strings";
import { openUrl } from "@tauri-apps/plugin-opener";
import { computed, onMounted, ref, watch } from "vue";

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
    { label: "复制", value: "copy" },
    { label: "删除", value: "delete" }
  ];

  if (linkMeta.value) {
    options.unshift({ label: "复制链接", value: "copyLink" });
  }

  if (canRecall.value) {
    options.splice(options.length - 1, 0, { label: "撤回", value: "recall" });
  }

  return options;
}

async function handleMenuAction(action: string): Promise<void> {
  const msg = props.message;

  try {
    switch (action) {
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
    `确定删除与 ${msg.name || "该用户"} 的会话?`,
    "删除会话",
    {
      distinguishCancelAndClose: true,
      confirmButtonText: "确认",
      cancelButtonText: "取消"
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
  background-color: #e1f5fe;
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

  &:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }
}

// ===================== 链接卡片样式 =====================

.link-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: linear-gradient(135deg, #fafbfc 0%, #f0f4f8 100%);
  // border: 1px solid #e4e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  max-width: 240px;
  min-width: 240px;

  &:hover {
    border-color: #c0c8d0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  &:active {
    transform: translateY(0);
  }

  // 图标
  &__icon {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    &-placeholder {
      font-size: 20px;
    }
  }

  // 内容区
  &__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: #1a1a2e;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__desc {
    font-size: 12px;
    color: #666;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__url {
    font-size: 11px;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &::before {
      content: "🔗 ";
      font-size: 10px;
    }
  }

  // 预览图
  &__preview {
    flex-shrink: 0;
    width: 80px;
    height: 60px;
    border-radius: 6px;
    overflow: hidden;
    background: #f0f0f0;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  // 加载状态
  &--loading {
    pointer-events: none;
  }

  &__skeleton {
    display: flex;
    gap: 12px;
    width: 100%;
  }
}

// 骨架屏动画
.skeleton-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
}

.skeleton-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;

  &.skeleton-title {
    width: 80%;
  }

  &.skeleton-desc {
    width: 60%;
    height: 12px;
  }
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}

// 自己发送的链接卡片
.message-bubble.owner .link-card {
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
  border-color: #a5d6a7;

  &:hover {
    border-color: #81c784;
  }
}

// 暗色主题适配
:root[data-theme="dark"] {
  .link-card {
    background: linear-gradient(135deg, #2d2d3a 0%, #252532 100%);
    border-color: #3d3d4a;

    &:hover {
      border-color: #4d4d5a;
    }

    &__title {
      color: #e0e0e0;
    }

    &__desc {
      color: #a0a0a0;
    }

    &__url {
      color: #808080;
    }

    &__icon {
      background: #3d3d4a;
    }
  }

  .message-bubble.owner .link-card {
    background: linear-gradient(135deg, #1b3d1b 0%, #1a331a 100%);
    border-color: #2d4d2d;

    &:hover {
      border-color: #3d5d3d;
    }
  }

  .skeleton-icon,
  .skeleton-line {
    background: linear-gradient(90deg, #3d3d4a 25%, #4d4d5a 50%, #3d3d4a 75%);
    background-size: 200% 100%;
  }
}
</style>
