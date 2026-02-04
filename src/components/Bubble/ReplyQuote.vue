<template>
  <div v-if="replyMessage" class="reply-quote" @click="handleJumpToMessage" :title="previewContent">
    <span class="reply-quote__sender">{{ senderName }}:</span>
    <span class="reply-quote__text">{{ previewContent }}</span>
  </div>
</template>

<script lang="ts" setup>
import { MessageContentType } from "@/constants";
import { ReplyMessageInfo } from "@/models";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

interface Props {
  replyMessage?: ReplyMessageInfo;
  senderName?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "jumpToMessage", messageId: string): void;
}>();

const { t } = useI18n();

// 发送者名称
const senderName = computed(() => {
  return props.senderName || props.replyMessage?.fromId || t("components.bubble.reply.unknown");
});

// 预览内容
const previewContent = computed(() => {
  const reply = props.replyMessage;
  if (!reply) return "";

  if (reply.previewText) {
    return reply.previewText.length > 40
      ? reply.previewText.slice(0, 40) + "..."
      : reply.previewText;
  }

  const contentType = reply.messageContentType;
  if (contentType === MessageContentType.IMAGE.code) {
    return t("components.bubble.reply.image");
  }
  if (contentType === MessageContentType.VIDEO.code) {
    return t("components.bubble.reply.video");
  }
  if (contentType === MessageContentType.AUDIO.code) {
    return t("components.bubble.reply.audio");
  }
  if (contentType === MessageContentType.FILE.code) {
    return t("components.bubble.reply.file");
  }
  if (contentType === MessageContentType.LOCATION.code) {
    return t("components.bubble.reply.location");
  }

  return t("components.bubble.reply.message");
});

// 跳转到原消息
const handleJumpToMessage = () => {
  const messageId = props.replyMessage?.messageId;
  if (messageId) {
    emit("jumpToMessage", messageId);

    const targetEl = document.getElementById(`message-${messageId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      targetEl.classList.add("reply-highlight");
      setTimeout(() => {
        targetEl.classList.remove("reply-highlight");
      }, 1500);
    }
  }
};
</script>

<style lang="scss" scoped>
.reply-quote {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  margin-top: 3px;
  background-color: #efefef;
  // background: rgba(68, 66, 66, 0.04);
  border-radius: 3px;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.3;

  // &:hover {
  //   background: rgba(0, 0, 0, 0.07);
  // }

  &__sender {
    flex-shrink: 0;
    color: var(--side-bg-color, #409eff);
    font-weight: 500;
  }

  &__text {
    color: var(--content-message-font-color, #90969b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

// 高亮动画
:global(.reply-highlight) {
  animation: highlight-flash 1.5s ease-out;
}

@keyframes highlight-flash {

  0%,
  30% {
    background-color: rgba(64, 158, 255, 0.15);
  }

  100% {
    background-color: transparent;
  }
}

// 暗色主题
:root[data-theme="dark"] {
  .reply-quote {
    background: rgba(255, 255, 255, 0.06);

    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  }
}
</style>
