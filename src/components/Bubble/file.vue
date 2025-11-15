<template>
  <div :id="`message-${message.messageId}`" v-context-menu="getMenuConfig(message)" v-memo="[message, message.isOwner]"
    :class="['bubble', message.type, { owner: message.isOwner }]" class="message-bubble">
    <div :title="parsedBody?.name" class="file-bubble no-select" @click="handleOpenFile(message)">
      <svg class="file-icon">
        <use :xlink:href="fileIcon(parsedBody?.suffix)"></use>
      </svg>
      <div class="file-details">
        <div class="file-name">{{ parsedBody?.name }}</div>
        <div class="file-size">{{ FileUtils.formatSize(parsedBody?.size) }}</div>
      </div>
      <button v-show="!parsedBody?.local" class="download-btn" @click.stop="handleDownloadFile(message)">
        <i class="iconfont icon-xiazai"></i>
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { fileIcon } from "@/utils/FileUpload";
import { useChatStore } from "@/store/modules/chat";
import FileUtils from "@/utils/File";
import { useFile } from "@/hooks/useFile";
import ObjectUtils from "@/utils/ObjectUtils";
import { shallowReactive, watchEffect } from "vue";

const messageStore = useChatStore();
const { openFile, downloadFile, previewFile, openFilePath, autoDownloadFile } = useFile();

const props = defineProps<{
  message: {
    messageId: string | number;
    messageBody: any; // 对象或 JSON 字符串
    type: string;
    isOwner: boolean;
  };
}>();

const parsedBody = shallowReactive({} as any);

// 解析 messageBody（如果为字符串，JSON.parse；否则直接用）
watchEffect(() => {
  const body = props.message.messageBody;
  if (typeof body === "string") {
    try {
      Object.assign(parsedBody, JSON.parse(body));
    } catch (e) {
      console.warn("Failed to parse messageBody:", e);
      Object.assign(parsedBody, { name: "", path: "", size: 0, local: null });
    }
  } else {
    Object.assign(parsedBody, body || {});
  }
});

// 打开文件（仅更新 local 字段，避免全 body JSON 化）
const handleOpenFile = async (message: any) => {
  const open = await openFile(parsedBody.local);
  if (!open && parsedBody.local) {
    // 只更新 local 为 null，不动其他字段
    parsedBody.local = null;
    const updateData = {
      messageBody: JSON.stringify({ ...parsedBody }) // 仅 stringify 整个 body 以保持 DB 一致
    };
    messageStore.handleUpdateMessage(message, updateData);
  }
};

// 下载文件（仅更新 local）
const handleDownloadFile = async (message: any) => {
  const localPath = await downloadFile(parsedBody.name, parsedBody.path);
  if (ObjectUtils.isNotEmpty(localPath)) {
    parsedBody.local = localPath;
    const updateData = {
      messageBody: JSON.stringify({ ...parsedBody })
    };
    messageStore.handleUpdateMessage(message, updateData);
  }
};

// 自动下载（仅更新 local）
const handleAutoDownloadFile = async (message: any) => {
  if (ObjectUtils.isEmpty(parsedBody.local)) {
    const localPath = await autoDownloadFile(parsedBody.name, parsedBody.path, parsedBody.size);
    if (ObjectUtils.isNotEmpty(localPath)) {
      parsedBody.local = localPath;
      const updateData = {
        messageBody: JSON.stringify({ ...parsedBody })
      };
      messageStore.handleUpdateMessage(message, updateData);
    }
  }
};

/**
 * 右键菜单配置（简化：移除未用复制逻辑）
 */
const getMenuConfig = (item: any) => {
  const config = shallowReactive<any>({
    options: [],
    callback: async () => { }
  });

  watchEffect(() => {
    config.options = [
      { label: "删除", value: "delete" },
      {
        label: parsedBody.local ? "在文件夹中显示" : "预览",
        value: parsedBody.local ? "openPath" : "preview"
      }
    ];
  });

  config.callback = async (action: any) => {
    try {
      if (action === "delete") {
        // TODO: 确认删除逻辑
        return;
      }

      if (action === "openPath") {
        openFilePath(parsedBody.local);
      }

      if (action === "preview") {
        previewFile(parsedBody.name, parsedBody.path);
      }
    } catch {
      /* cancel */
    }
  };

  return config;
};

onMounted(() => {
  handleAutoDownloadFile(props.message);
});
</script>

<style lang="scss" scoped>
.file-bubble {
  display: flex;
  align-items: center;
  background-color: #fff;
  width: 220px;
  padding: 12px;
  border-radius: 5px;
  border: 1px solid #e7e7e7;
  box-shadow: 1px 1px 1px rgba(0, 0, 0, 0.1);
  cursor: pointer;
}

.file-icon {
  width: 28px;
  height: 28px;
  fill: currentColor;
  overflow: hidden;
  margin-right: 10px;
}

.file-details {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.file-name {
  width: 130px;
  font-weight: bold;
  overflow: hidden;
  color: var(--content-bubble-font-color);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  padding-top: 5px;
  font-size: 12px;
  color: #888;
}

.download-btn {
  color: white;
  border: none;
  padding: 6px 8px;
  background-color: transparent;
  cursor: pointer;

  .icon-xiazai {
    color: #777;
    font-size: 22px;
  }

  &:hover {
    color: #555;
    background-color: #eee;
    // font-size: 20px;
    scale: 1.1;
  }
}
</style>
