<template>
  <div :id="`message-${message.messageId}`" v-context-menu="menuConfig" v-memo="[message, message.isOwner]"
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
import { Events } from "@/constants";
import { storage } from "@/utils/Storage";
import { globalEventBus } from "@/hooks/useEventBus";
import { useMessageContextMenu } from "@/hooks/useMessageContextMenu";
import { ElMessageBox } from "element-plus";

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

// ===================== 右键菜单 =====================
const { menuConfig, setTarget } = useMessageContextMenu<any>({
  getOptions: (item) => {
    const target = item ?? props.message;
    const options = [{ label: "删除", value: "delete" }];
    if (isOwnerOfMessage(target) && isWithinTwoMinutes(target.messageTime)) {
      options.push({ label: "撤回", value: "recall" });
    }
    return options;
  },
  onAction: async (action, item) => {
    const target = item ?? props.message;
    try {
      if (action === "delete") {
        await ElMessageBox.confirm("确定删除这条消息吗?", "提示", {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          type: "warning"
        });
        globalEventBus.emit(Events.MESSAGE_DELETE, target);
        return;
      }
      if (action === "recall") {
        globalEventBus.emit(Events.MESSAGE_RECALL, target);
      }
    } catch {
      // User cancelled or error
    }
  },
  beforeShow: () => setTarget(props.message)
});
</script>

<style lang="scss" scoped>
.message-bubble.image-bubble {
  background-color: transparent !important;
  padding: 0;
  max-width: 150px;
  overflow: hidden;

  .image-wrapper {
    position: relative;
    display: flex;
    border-radius: 5px;
    overflow: hidden;
    transition: transform 0.2s ease;

    img {
      display: block;
      max-width: 150px;
      max-height: 150px;
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
