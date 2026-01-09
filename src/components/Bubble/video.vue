<template>
  <div :id="`message-${message.messageId}`" v-context-menu="getMenuConfig(message)" v-memo="[message, message.isOwner]"
    :class="['bubble', message.type, { owner: message.isOwner }]" class="message-bubble video-bubble">
    <div class="video-wrapper" @click="handlePreview(message.messageBody?.path)">
      <video ref="videoRef" :src="localPath" preload="metadata" @loadedmetadata="handleMetadata"></video>
      <div class="play-overlay">
        <i class="iconfont icon-bofang1"></i>
      </div>
      <div v-if="duration" class="video-duration">{{ formatDuration(duration) }}</div>
    </div>
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

const props = defineProps({
  message: {
    type: Object,
    required: true,
    default: function () {
      return {};
    }
  }
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
      // { label: "复制链接", value: "copyLink" },
      { label: "另存为...", value: "saveAs" },
      { label: "删除", value: "delete" }
    ];

    if (isOwnerOfMessage(item) && isWithinTwoMinutes(item.messageTime)) {
      options.splice(2, 0, { label: "撤回", value: "recall" });
    }

    config.options = options;
  });

  config.callback = async (action: any) => {
    try {
      if (action === "copyLink") {
        await ClipboardManager.writeText(item.messageBody?.path);
        logger.prettySuccess("copy link success");
      } else if (action === "saveAs") {
        const fileName = item.messageBody?.name || `video_${Date.now()}.mp4`;
        await downloadFile(fileName, item.messageBody?.path);
      } else if (action === "delete") {
        await ElMessageBox.confirm("确定删除这条消息吗?", "提示", {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          type: "warning"
        });
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

  .video-wrapper {
    position: relative;
    display: flex;
    border-radius: 8px;
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
