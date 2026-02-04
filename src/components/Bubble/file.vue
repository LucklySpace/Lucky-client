<template>
  <div :id="`message-${message.messageId}`" v-context-menu="getMenuConfig(message)"
    v-memo="[message, message.isOwner, replyInfo?.messageId]"
    :class="['bubble', message.type, { owner: message.isOwner }]" class="message-bubble file-message-bubble">
    <div :title="parsedBody?.name" class="file-bubble no-select" @click="handleOpenFile(message)">
      <svg class="file-icon">
        <use :xlink:href="fileIcon(parsedBody?.suffix)"></use>
      </svg>
      <div class="file-details">
        <div class="file-name">{{ parsedBody?.name }}</div>
        <div class="file-size">{{ formatFileSize(parsedBody?.size) }}</div>
      </div>
      <button v-show="!parsedBody?.local" class="download-btn" @click.stop="handleDownloadFile(message)">
        <i class="iconfont icon-xiazai"></i>
      </button>
    </div>
    <!-- 引用消息显示（在文件下方） -->
    <ReplyQuote v-if="replyInfo" :replyMessage="replyInfo" :senderName="replySenderName" />
  </div>
</template>

<script lang="ts" setup>
import { Events, MessageContentType } from "@/constants";
import { globalEventBus } from "@/hooks/useEventBus";
import { fileIcon, formatFileSize, useFile } from "@/hooks/useFile";
import { ReplyMessageInfo } from "@/models";
import { useChatStore } from "@/store/modules/chat";
import ObjectUtils from "@/utils/ObjectUtils";
import { storage } from "@/utils/Storage";
import { computed, shallowReactive, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import ReplyQuote from "./ReplyQuote.vue";

const { t } = useI18n();
const messageStore = useChatStore();
const { openFile, downloadFile, previewFile, openFilePath, autoDownloadFile } = useFile();

const props = defineProps<{
  message: {
    messageId: string | number;
    messageBody: any; // 对象或 JSON 字符串，包含 replyMessage
    type: string;
    isOwner: boolean;
    fromId?: string;
    name?: string;
  };
}>();

// 从 messageBody 获取引用消息
const replyInfo = computed(() => {
  const body = parsedBody;
  return body?.replyMessage as ReplyMessageInfo | undefined;
});

// 获取被引用消息的发送者名称
const replySenderName = computed(() => {
  const replyFromId = replyInfo.value?.fromId;
  if (!replyFromId) return "";

  const currentUserId = storage.get("userId");
  if (String(replyFromId) === String(currentUserId)) {
    return t("components.message.me");
  }

  const membersMap = messageStore.currentChatGroupMemberMap;
  const member = membersMap?.[String(replyFromId)];
  return member?.name || replyFromId;
});

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

/** 处理回复消息 */
function handleReply(msg: typeof props.message): void {
  const fileName = parsedBody.name || t("components.bubble.reply.file");
  globalEventBus.emit(Events.MESSAGE_REPLY, {
    messageId: msg.messageId,
    fromId: msg.fromId,
    previewText: `[文件] ${fileName}`,
    messageContentType: MessageContentType.FILE.code,
    senderName: msg.name || msg.fromId
  });
}

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
      { label: t("components.bubble.reply.action"), value: "reply" },
      { label: t("common.actions.delete"), value: "delete" },
      {
        label: parsedBody.local ? t("common.actions.showInFolder") : t("common.actions.preview"),
        value: parsedBody.local ? "openPath" : "preview"
      }
    ];
  });

  config.callback = async (action: any) => {
    try {
      if (action === "reply") {
        handleReply(item);
        return;
      }

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
.file-message-bubble {
  display: flex;
  flex-direction: column;
  max-width: 240px;
}

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
