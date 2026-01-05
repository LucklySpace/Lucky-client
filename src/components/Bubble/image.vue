<template>
  <div :id="`message-${message.messageId}`" v-context-menu="getMenuConfig(message)" v-memo="[message, message.isOwner]"
    :class="['bubble', message.type, { owner: message.isOwner }]" class="message-bubble">
    <img :data-src="localPath" :src="localPath" alt="Image message" class="img-bubble lazy-img"
      @click="handlePreview(message.messageBody?.path)" @load="cacheMedia" />
  </div>
</template>

<script lang="ts" setup>
import { ShowPreviewWindow } from "@/windows/preview";
import { useMediaCacheStore } from "@/store/modules/media";
import { CacheEnum, MessageContentType } from "@/constants";
import ClipboardManager from "@/utils/Clipboard";
import { getPath } from "@/utils/Image";
import { readFile } from "@tauri-apps/plugin-fs";

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
  ShowPreviewWindow("", path);
};

/**
 * 构造右键菜单配置，只需要 item
 */
const getMenuConfig = (item: any) => {
  const config = shallowReactive<any>({
    options: [],
    callback: async () => {
    }
  });
  // watchEffect 会监听 item.isTop/item.name 的改变，自动重建 options
  watchEffect(() => {
    config.options = [
      { label: "复制", value: "copy" },
      { label: "删除", value: "delete" }
    ];
  });
  config.callback = async (action: any) => {
    try {
      if (action === "copy") {
        try {
          await ClipboardManager.clear();

          // 图片消息
          if (item.messageContentType == MessageContentType.IMAGE.code) {
            const path = await getPath(item.messageBody?.path, CacheEnum.IMAGE_CACHE);
            const imgBuf = await readFile(path);
            ClipboardManager.writeImage(imgBuf).then(() => {
              useLogger().prettySuccess("copy image success", item.messageBody?.path);
            });
          }
        } catch (err) {
          console.log(err);
        }
      }
      if (action === "delete") {
        await ElMessageBox.confirm(`确定删除与 ${item.name} 的会话?`, "删除会话", {
          distinguishCancelAndClose: true,
          confirmButtonText: "确认",
          cancelButtonText: "取消"
        });
      }
    } catch {
      /* cancel */
    }
  };

  return config;
};
</script>

<style lang="scss" scoped>
.message-bubble {
  display: inline-block;
  border-radius: 8px;
  //padding: 8px;
  font-size: 14px;
  color: #333;
  position: relative;
  //width: 80%;
  //max-width: 60%;
  word-wrap: break-word;
  // overflow: hidden;
  background-color: #e1f5fe;
  //color: #333;

  img {
    width: 200px;
    //height: 100%;
    border-radius: 5px;
    cursor: pointer;
  }
}
</style>
