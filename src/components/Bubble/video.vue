<template>
  <div :id="`message-${message.messageId}`" v-context-menu="getMenuConfig(message)" v-memo="[message, message.isOwner, replyInfo?.messageId]"
    :class="['bubble', message.type, { owner: message.isOwner }]" class="message-bubble video-bubble">
    <div class="video-wrapper" @click="handlePreview(message.messageBody?.path)">
      <video ref="videoRef" :src="localPath" preload="metadata" @loadedmetadata="handleMetadata"></video>
      <div class="play-overlay">
        <i class="iconfont icon-bofang1"></i>
      </div>
      <div v-if="duration" class="video-duration">{{ formatDuration(duration) }}</div>
    </div>
    <!-- 引用消息显示（在视频下方） -->
    <ReplyQuote v-if="replyInfo" :replyMessage="replyInfo" :senderName="replySenderName" />
  </div>
</template>

<script lang="ts" setup>
import { ShowPreviewWindow } from "@/windows/preview";
import { useMediaCacheStore } from "@/store/modules/media";
import { storage } from "@/utils/Storage";
import { globalEventBus } from "@/hooks/useEventBus";
import { useFile } from "@/hooks/useFile";
import { useLogger } from "@/hooks/useLogger";
import ClipboardManager from "@/utils/Clipboard";
import ReplyQuote from "./ReplyQuote.vue";
import { useChatStore } from "@/store/modules/chat";
import { useI18n } from "vue-i18n";
import { Events, MessageContentType } from "@/constants";

const props = defineProps({
  message: {
    type: Object,
    required: true,
    default: function () {
      return {};
    }
  }
});

const { t } = useI18n();
const chatStore = useChatStore();

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

  const membersMap = chatStore.currentChatGroupMemberMap;
  const member = membersMap?.[String(replyFromId)];
  return member?.name || replyFromId;
});

const store = useMediaCacheStore();
const { downloadFile } = useFile();
const logger = useLogger();

const videoRef = ref<HTMLVideoElement | null>(null);
const duration = ref<number>(0);

const localPath = computed(() => store.getMedia(props.message.messageId) || props.message.messageBody?.path);

onMounted(() => {
  const id = store.getId();
  if (id && (id == props.message?.toId || id == props.message?.groupId)) {
    store.loadMedia(props.message?.messageId, props.message.messageBody?.path);
  }
});

const handleMetadata = () => {
  if (videoRef.value) {
    duration.value = videoRef.value.duration;
  }
};

const formatDuration = (seconds: number) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
};

// 处理预览
const handlePreview = (path: string) => {
  ShowPreviewWindow("", path, "video");
};

// 判断当前用户是否为消息所有者
function isOwnerOfMessage(item: any) {
  if (!item) return false;
  if (typeof item.isOwner === "boolean") return item.isOwner;
  const currentUserId = storage.get("userId");
  return String(item.fromId) === String(currentUserId);
}

// 判断是否在撤回时间内
function isWithinTwoMinutes(timestamp: number): boolean {
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  return diff <= (import.meta.env.VITE_MESSAGE_RECALL_TIME || 120000);
}

/** 处理回复消息 */
function handleReply(msg: any): void {
  globalEventBus.emit(Events.MESSAGE_REPLY, {
    messageId: msg.messageId,
    fromId: msg.fromId,
    previewText: t("components.bubble.reply.video"),
    messageContentType: MessageContentType.VIDEO.code,
    senderName: msg.name || msg.fromId
  });
}

/**
 * 构造右键菜单配置
 */
const getMenuConfig = (item: any) => {
  const config = shallowReactive<any>({
    options: [],
    callback: async () => {
    }
  });

  watchEffect(() => {
    const options = [
      { label: t("components.bubble.reply.action"), value: "reply" },
      { label: t("common.actions.saveAs"), value: "saveAs" },
      { label: t("common.actions.delete"), value: "delete" }
    ];

    if (isOwnerOfMessage(item) && isWithinTwoMinutes(item.messageTime)) {
      options.splice(2, 0, { label: t("common.actions.recall"), value: "recall" });
    }

    config.options = options;
  });

  config.callback = async (action: any) => {
    try {
      if (action === "reply") {
        handleReply(item);
      } else if (action === "copyLink") {
        await ClipboardManager.writeText(item.messageBody?.path);
        logger.prettySuccess("copy link success");
      } else if (action === "saveAs") {
        const fileName = item.messageBody?.name || `video_${Date.now()}.mp4`;
        await downloadFile(fileName, item.messageBody?.path);
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
    } catch (err) {
      // User cancelled or error
    }
  };

  return config;
};
</script>

<style lang="scss" scoped>
.message-bubble.video-bubble {
  background-color: transparent !important;
  padding: 0;
  max-width: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  // 包含引用时的样式
  :deep(.reply-quote) {
    max-width: 280px;
  }

  .video-wrapper {
    position: relative;
    display: flex;
    border-radius: 5px;
    overflow: hidden;
    background-color: #000;
    cursor: pointer;
    transition: transform 0.2s ease;

    &:hover {

      .play-overlay {
        background-color: rgba(0, 0, 0, 0.3);
      }
    }

    video {
      display: block;
      width: 100%;
      height: auto;
      max-height: 400px;
      object-fit: contain;
    }

    .play-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(0, 0, 0, 0.2);
      transition: background-color 0.2s ease;

      .iconfont {
        color: #fff;
        font-size: 48px;
        opacity: 0.9;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      }
    }

    .video-duration {
      position: absolute;
      bottom: 8px;
      right: 8px;
      background-color: rgba(0, 0, 0, 0.6);
      color: #fff;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
    }
  }

  &.owner {
    .video-wrapper {
      justify-content: flex-end;
    }
  }
}
</style>
