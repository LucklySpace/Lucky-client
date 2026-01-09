<template>
  <div :id="`message-${message.messageId}`" v-context-menu="getMenuConfig(message)" v-memo="[message, message.isOwner]"
    :class="['bubble', message.type, { owner: message.isOwner }]" class="message-bubble image-bubble">
    <div class="image-wrapper">
      <img :data-src="localPath" :src="localPath" alt="Image message" class="img-bubble lazy-img"
        @click="handlePreview(message.messageBody?.path)" @load="cacheMedia" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ShowPreviewWindow } from "@/windows/preview";
import { useMediaCacheStore } from "@/store/modules/media";
import { CacheEnum, MessageContentType } from "@/constants";
import ClipboardManager from "@/utils/Clipboard";
import { getPath } from "@/utils/Image";
import { readFile } from "@tauri-apps/plugin-fs";
import { storage } from "@/utils/Storage";
import { globalEventBus } from "@/hooks/useEventBus";
import { useFile } from "@/hooks/useFile";
import { useLogger } from "@/hooks/useLogger";

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

const cacheMedia = () => {
  const id = store.getId();
  if (id && (id == props.message?.toId || id == props.message?.groupId)) {
    store.loadMedia(props.message?.messageId, props.message.messageBody?.path);
  }
};

const localPath = computed(() => store.getMedia(props.message.messageId) || props.message.messageBody?.path);

// 处理预览
const handlePreview = (path: string) => {
  ShowPreviewWindow("", path, "image");
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
      { label: "复制", value: "copy" },
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
      if (action === "copy") {
        try {
          await ClipboardManager.clear();
          const path = await getPath(item.messageBody?.path, CacheEnum.IMAGE_CACHE);
          const imgBuf = await readFile(path);
          await ClipboardManager.writeImage(imgBuf);
          logger.prettySuccess("copy image success", item.messageBody?.path);
        } catch (err) {
          console.error("Copy image failed:", err);
        }
      } else if (action === "saveAs") {
        const fileName = item.messageBody?.name || `image_${Date.now()}.png`;
        await downloadFile(fileName, item.messageBody?.path);
      } else if (action === "delete") {
        await ElMessageBox.confirm("确定删除这条消息吗?", "提示", {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          type: "warning"
        });
        // TODO: 调用删除 API
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
.message-bubble.image-bubble {
  background-color: transparent !important;
  padding: 0;
  max-width: 300px;
  overflow: hidden;

  .image-wrapper {
    position: relative;
    display: flex;
    border-radius: 8px;
    overflow: hidden;
    transition: transform 0.2s ease;

    img {
      display: block;
      width: 100%;
      height: auto;
      max-height: 400px;
      object-fit: cover;
      cursor: pointer;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }

  &.owner {
    .image-wrapper {
      justify-content: flex-end;
    }
  }
}
</style>
