<template>
  <div :id="`message-${message.messageId}`" v-context-menu="menuConfig" v-memo="[message.messageId, message.isOwner]"
    :class="['image-bubble', { 'image-bubble--owner': message.isOwner }]">
    <div class="image-bubble__wrapper" @click="handlePreview">
      <img :src="src" class="image-bubble__img" alt="Image" @load="cacheOnLoad" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, shallowReactive, watchEffect } from "vue";
import { ElMessageBox } from "element-plus";
import { readFile } from "@tauri-apps/plugin-fs";
import { useImageCache } from "@/hooks/useImageCache";
import { useFile } from "@/hooks/useFile";
import { useLogger } from "@/hooks/useLogger";
import { globalEventBus } from "@/hooks/useEventBus";
import { ShowPreviewWindow } from "@/windows/preview";
import { CacheEnum } from "@/constants";
import { getPath } from "@/utils/Image";
import { storage } from "@/utils/Storage";
import ClipboardManager from "@/utils/Clipboard";

// ===================== Props =====================

const props = defineProps<{
  message: {
    messageId: string;
    messageBody?: { path?: string; name?: string };
    messageTime?: number;
    fromId?: string;
    isOwner?: boolean;
  };
}>();

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
      if (action === "copy") {
        await ClipboardManager.clear();
        const path = await getPath(body?.path || "", CacheEnum.IMAGE_CACHE);
        const imgBuf = await readFile(path);
        await ClipboardManager.writeImage(imgBuf);
        logger.prettySuccess("Image copied", body?.path);
      } else if (action === "saveAs") {
        await downloadFile(body?.name || `image_${Date.now()}.png`, body?.path || "");
      } else if (action === "delete") {
        await ElMessageBox.confirm("确定删除这条消息吗?", "提示", {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          type: "warning"
        });
      } else if (action === "recall") {
        globalEventBus.emit("message:recall", item);
      }
    } catch {
      // 用户取消
    }
  }
});

watchEffect(() => {
  const item = props.message;
  const opts = [
    { label: "复制", value: "copy" },
    { label: "另存为...", value: "saveAs" },
    { label: "删除", value: "delete" }
  ];
  if (isOwner(item) && canRecall(item)) {
    opts.splice(2, 0, { label: "撤回", value: "recall" });
  }
  menuConfig.options = opts;
});
</script>

<style lang="scss" scoped>
.image-bubble {
  display: flex;
  margin: 4px 0;
  max-width: 300px;

  &--owner {
    justify-content: flex-end;
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
}
</style>
