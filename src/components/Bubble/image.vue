<template>
  <div :id="`message-${message.messageId}`" v-context-menu="menuConfig"
    v-memo="[message.messageId, message.isOwner, replyInfo?.messageId]"
    :class="['image-bubble', { 'image-bubble--owner': message.isOwner }]">
    <div class="image-bubble__wrapper" @click="handlePreview">
      <img :src="src" class="image-bubble__img" alt="Image" @load="cacheOnLoad" />
    </div>
    <!-- 引用消息显示（在图片下方） -->
    <ReplyQuote v-if="replyInfo" :replyMessage="replyInfo" :senderName="replySenderName" />
  </div>
</template>

<script lang="ts" setup>
import { CacheEnum, Events, MessageContentType } from "@/constants";
import { globalEventBus } from "@/hooks/useEventBus";
import { useFile } from "@/hooks/useFile";
import { useImageCache } from "@/hooks/useImageCache";
import { useLogger } from "@/hooks/useLogger";
import { ReplyMessageInfo } from "@/models";
import { useChatStore } from "@/store/modules/chat";
import ClipboardManager from "@/utils/Clipboard";
import { getPath } from "@/utils/Image";
import { storage } from "@/utils/Storage";
import { ShowPreviewWindow } from "@/windows/preview";
import { readFile } from "@tauri-apps/plugin-fs";
import { ElMessageBox } from "element-plus";
import { computed, shallowReactive, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import ReplyQuote from "./ReplyQuote.vue";

// ===================== Props =====================

const props = defineProps<{
  message: {
    messageId: string;
    messageBody?: { path?: string; name?: string; replyMessage?: ReplyMessageInfo };
    messageTime?: number;
    fromId?: string;
    isOwner?: boolean;
    name?: string;
  };
}>();

const { t } = useI18n();
const chatStore = useChatStore();

// ===================== 引用消息 =====================

// 从 messageBody 获取引用消息
const replyInfo = computed(() => props.message.messageBody?.replyMessage);

const replySenderName = computed(() => {
  const replyFromId = replyInfo.value?.fromId;
  if (!replyFromId) return "";

  const currentUserId = storage.get("userId");
  if (String(replyFromId) === String(currentUserId)) {
    return t("components.message.me");
  }

  const membersMap = chatStore.currentChatGroupMemberMap;
  const member = membersMap?.[String(replyFromId)];
  return member?.name || replyFromId;
});

// ===================== 图片缓存 =====================

const imageUrl = computed(() => props.message.messageBody?.path || "");
const { src, cacheOnLoad } = useImageCache(imageUrl);

// ===================== Hooks =====================

const { downloadFile } = useFile();
const logger = useLogger();

// ===================== 事件 =====================

const handlePreview = () => {
  const path = props.message.messageBody?.path;
  if (path) ShowPreviewWindow("", path, "image");
};

// ===================== 右键菜单 =====================

const isOwner = (item: typeof props.message) =>
  typeof item.isOwner === "boolean" ? item.isOwner : String(item.fromId) === String(storage.get("userId"));

const canRecall = (item: typeof props.message) => {
  if (!item.messageTime) return false;
  const recallTime = import.meta.env.VITE_MESSAGE_RECALL_TIME || 120000;
  return Date.now() - item.messageTime <= recallTime;
};

const menuConfig = shallowReactive({
  options: [] as { label: string; value: string }[],
  callback: async (action: string) => {
    const item = props.message;
    const body = item.messageBody;

    try {
      if (action === "reply") {
        handleReply(item);
      } else if (action === "copy") {
        await ClipboardManager.clear();
        const path = await getPath(body?.path || "", CacheEnum.IMAGE_CACHE);
        const imgBuf = await readFile(path);
        await ClipboardManager.writeImage(imgBuf);
        logger.prettySuccess("Image copied", body?.path);
      } else if (action === "saveAs") {
        await downloadFile(body?.name || `image_${Date.now()}.png`, body?.path || "");
      } else if (action === "delete") {
        await ElMessageBox.confirm(
          t("components.dialog.deleteMessage.confirm"),
          t("components.dialog.title.warning"),
          {
            distinguishCancelAndClose: true,
            confirmButtonText: t("components.dialog.buttons.confirm"),
            cancelButtonText: t("components.dialog.buttons.cancel"),
            type: "warning"
          }
        );
      } else if (action === "recall") {
        globalEventBus.emit("message:recall", item);
      }
    } catch {
      // 用户取消
    }
  }
});

/** 处理回复消息 */
function handleReply(msg: typeof props.message): void {
  globalEventBus.emit(Events.MESSAGE_REPLY, {
    messageId: msg.messageId,
    fromId: msg.fromId,
    previewText: t("components.bubble.reply.image"),
    messageContentType: MessageContentType.IMAGE.code,
    senderName: msg.name || msg.fromId
  });
}

watchEffect(() => {
  const item = props.message;
  const opts = [
    { label: t("components.bubble.reply.action"), value: "reply" },
    { label: t("common.actions.copy"), value: "copy" },
    { label: t("common.actions.saveAs"), value: "saveAs" },
    { label: t("common.actions.delete"), value: "delete" }
  ];
  if (isOwner(item) && canRecall(item)) {
    opts.splice(3, 0, { label: t("common.actions.recall"), value: "recall" });
  }
  menuConfig.options = opts;
});
</script>

<style lang="scss" scoped>
.image-bubble {
  display: flex;
  flex-direction: column;
  margin: 4px 0;
  max-width: 300px;

  &--owner {
    align-items: flex-end;
  }

  &__wrapper {
    display: inline-flex;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;

    &:hover .image-bubble__img {
      transform: scale(1.02);
    }
  }

  &__img {
    display: block;
    max-width: 280px;
    max-height: 300px;
    object-fit: cover;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    transition: transform 0.2s ease;
  }

  // 包含引用时的样式
  :deep(.reply-quote) {
    max-width: 280px;
  }
}
</style>
