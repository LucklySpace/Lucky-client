<template>
  <div class="chat-container" :class="{ 'is-dragging': isDragging }" @dragenter.prevent="handleDragEnter"
    @dragover.prevent="handleDragOver" @dragleave.prevent="handleDragLeave" @drop.prevent="handleDrop">
    <!-- 拖拽遮罩 -->
    <transition name="fade">
      <div v-if="isDragging" class="drag-overlay">
        <div class="drag-overlay-content">
          <i class="iconfont icon-wenjian drag-icon"></i>
          <span>{{ $t("pages.chat.toolbar.dropHint") || "拖放文件到此处" }}</span>
        </div>
      </div>
    </transition>

    <!-- 引用消息预览 -->
    <transition name="slide-up">
      <div v-if="replyMessage" class="reply-preview">
        <div class="reply-preview__bar"></div>
        <div class="reply-preview__content">
          <div class="reply-preview__header">
            <span class="reply-preview__label">{{ $t("components.bubble.reply.replyTo", {
              name: replyMessage.senderName
                || replyMessage.fromId
            }) }}</span>
            <button class="reply-preview__close" @click="cancelReply">
              <i class="iconfont icon-close"></i>
            </button>
          </div>
          <div class="reply-preview__text">{{ replyMessage.previewText }}</div>
        </div>
      </div>
    </transition>

    <!-- 工具栏 -->
    <div class="chat-container-tool">
      <!-- 表情 -->
      <div ref="emojiBtnRef" :title="$t('pages.chat.toolbar.emoji')"
        :class="['icon-box', { disabled: isInputDisabled }]" @click="toggleEmoji">
        <i class="iconfont icon-biaoqing-xue"></i>
        <el-popover v-if="!isInputDisabled" ref="emojiPopoverRef" v-model:visible="emojiVisible"
          :virtual-ref="emojiBtnRef" placement="top" trigger="click" virtual-triggering width="390">
          <emoji :historyEmojiList="historyEmojiList" @handleChooseEmoji="handleChooseEmoji" />
        </el-popover>
      </div>

      <!-- 截图（带下拉弹窗） -->
      <div :class="['icon-box', { disabled: isInputDisabled }]">
        <i :title="$t('pages.chat.toolbar.screenshot')" class="iconfont icon-jietu1" @click="handleScreenshot"></i>
        <el-popover v-if="!isInputDisabled" :close-on-click-modal="true" :popper-style="{ minWidth: '90px' }"
          :show-arrow="true" placement="top" trigger="click" width="90">
          <el-row :gutter="5" align="middle" justify="center" style="margin-bottom: 8px" type="flex">
            <el-button link size="default" @click="handleScreenshot">{{
              $t("pages.chat.toolbar.screenshot")
            }}</el-button>
          </el-row>
          <el-row :gutter="5" align="middle" justify="center" type="flex">
            <el-button link size="default" @click="handleRecord">{{
              $t("pages.chat.toolbar.recorder.label")
            }}</el-button>
          </el-row>
          <template #reference>
            <el-icon :size="15" style="margin-left: 2px">
              <ArrowDown />
            </el-icon>
          </template>
        </el-popover>
      </div>

      <!-- 视频通话 -->
      <div :title="$t('business.call.invite')" :class="['icon-box', { disabled: isInputDisabled }]" @click="handleCall">
        <i class="iconfont icon-shipin1"></i>
      </div>

      <!-- 文件 -->
      <div :title="$t('pages.chat.toolbar.file')" :class="['icon-box', { disabled: isInputDisabled }]"
        @click="openFileDialog">
        <i class="iconfont icon-wenjian"></i>
        <input ref="fileInputRef" style="display: none" type="file" multiple @change="handleFileChange" />
      </div>

      <!-- 聊天历史 -->
      <div :title="$t('pages.chat.toolbar.history')" class="icon-box" @click="toggleHistoryDialog">
        <i class="iconfont icon-liaotianjilu"></i>
      </div>
    </div>

    <!-- 输入框：contenteditable -->
    <div ref="editorRef" :data-placeholder="chatStore.getCurrentType === MessageType.GROUP_MESSAGE.code
      ? $t('pages.chat.input.mentionHint', { at: '@' })
      : $t('pages.chat.input.placeholder')
      " class="chat-container-input" :contenteditable="!isInputDisabled" spellcheck="false" @click="handleInteraction"
      @input="handleInteraction" @keydown="handleKeyDown" @keyup="handleKeyUp" @paste.prevent="handlePaste"></div>

    <!-- 发送按钮 -->
    <div class="chat-container-button">
      <button :title="settingStore.getShortcut('sendMessage')" class="button" :disabled="isInputDisabled"
        @click="handleSend">
        {{ $t("common.actions.send") }}
      </button>
    </div>

    <!-- @ 弹窗组件 -->
    <AtDialog v-if="atMention.state.visible" :position="atMention.state.position"
      :queryString="atMention.state.queryString" :users="chatStore.getCurrentGroupMembersExcludeSelf"
      :visible="atMention.state.visible" @handleHide="atMention.hideDialog" @handlePickUser="handlePickUser" />

    <HistoryDialog :visible="historyDialogVisible" title="聊天历史记录" @handleClose="toggleHistoryDialog" />
  </div>
</template>

<script lang="ts" setup>
/**
 * 聊天输入组件
 *
 * 功能：
 * - contenteditable 富文本输入（支持 @、图片、换行、emoji）
 * - 粘贴图片/文件支持
 * - 拖拽文件支持
 * - 文件预览队列
 * - 草稿自动保存
 * - @ 提及功能
 */

import AtDialog from "@/components/Atdialog/index.vue";
import emoji from "@/components/Emoji/index.vue";
import HistoryDialog from "@/components/History/index.vue";
import { Events, MessageType } from "@/constants";
import { useAtMention } from "@/hooks/useAtMention";
import { globalEventBus } from "@/hooks/useEventBus";
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
import { useInputEditor } from "@/hooks/useInputEditor";
import { useLogger } from "@/hooks/useLogger";
import { ReplyMessageInfo } from "@/models";
import { useCallStore } from "@/store/modules/call";
import { useChatStore } from "@/store/modules/chat";
import { useGroupStore } from "@/store/modules/group";
import { useSettingStore } from "@/store/modules/setting";
import onPaste from "@/utils/Paste";
import { storage } from "@/utils/Storage";
import { ElMessage } from "element-plus";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

// ==================== Store & Hooks ====================

const chatStore = useChatStore();
const callStore = useCallStore();
const settingStore = useSettingStore();
const groupStore = useGroupStore();
const log = useLogger();
const { addShortcut } = useGlobalShortcut();

const isInputDisabled = computed(() => {
  return chatStore.getCurrentType === MessageType.GROUP_MESSAGE.code && groupStore.isMuted(groupStore.getOwnerId);
});

// ==================== Refs ====================

const emojiBtnRef = ref<HTMLElement | null>(null);
const emojiVisible = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const editorRef = ref<HTMLElement | null>(null);
const historyDialogVisible = ref(false);
const historyEmojiList = ref<string[]>([]);
const isDragging = ref(false);
let dragCounter = 0; // 用于处理嵌套拖拽

// ==================== 引用消息状态 ====================

interface ReplyMessageWithSender extends ReplyMessageInfo {
  senderName?: string;
}

const replyMessage = ref<ReplyMessageWithSender | null>(null);

/** 设置引用消息 */
const setReplyMessage = (msg: ReplyMessageWithSender) => {
  replyMessage.value = msg;
  // 聚焦输入框
  editorRef.value?.focus();
};

/** 取消引用 */
const cancelReply = () => {
  replyMessage.value = null;
};

// ==================== 编辑器 Hook ====================

const editor = useInputEditor({
  editorRef,
  getChatId: () => chatStore.currentChat?.chatId,
});

// ==================== @ 提及 Hook ====================

const atMention = useAtMention({
  getEditor: () => editorRef.value,
  getSelectionRect: editor.getSelectionRect,
  isGroupChat: () => chatStore.getChatIsGroup,
});

// ==================== 表情处理 ====================

const toggleEmoji = () => {
  if (isInputDisabled.value) return;
  /* popover 自动处理 */
};

const handleChooseEmoji = (emojiChar: string | any) => {
  const char = typeof emojiChar === "string" ? emojiChar : emojiChar?.native || String(emojiChar);
  editor.insertText(char);
  editor.moveCursorToEnd();
  pushEmojiHistory(char);
};

const pushEmojiHistory = (ch: string) => {
  const list = historyEmojiList.value;
  const idx = list.indexOf(ch);
  if (idx >= 0) list.splice(idx, 1);
  list.unshift(ch);
  if (list.length > 16) list.length = 16;
  storage.set("emojiHistory", JSON.stringify(list));
};

// ==================== 文件处理 ====================

const openFileDialog = () => fileInputRef.value?.click();

const handleFileChange = async (event: Event) => {
  if (isInputDisabled.value) {
    ElMessage.warning("当前已被禁言，不能发送消息");
    return;
  }
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files?.length) return;

  await addFilesToQueue(files);
  input.value = ""; // 清空以支持重复选择
};

/** 添加文件到队列 */
const addFilesToQueue = async (files: FileList | File[]) => {
  if (isInputDisabled.value) {
    ElMessage.warning("当前已被禁言，不能发送消息");
    return { added: 0, skipped: (files as any)?.length || 0, errors: [] } as any;
  }
  const result = await editor.addFiles(files);
  if (result.errors.length) {
    result.errors.forEach(err => ElMessage.warning(err));
  }
  if (result.added > 0) {
    log.prettyInfo("files added to queue", { added: result.added, skipped: result.skipped });
  }
};

/** 移除文件 */
const handleRemoveFile = (index: number) => {
  editor.removeFile(index);
};

// ==================== 拖拽处理 ====================

const handleDragEnter = (e: DragEvent) => {
  e.preventDefault();
  if (isInputDisabled.value) return;
  dragCounter++;
  if (e.dataTransfer?.types.includes("Files")) {
    isDragging.value = true;
  }
};

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  if (isInputDisabled.value) return;
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "copy";
  }
};

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault();
  if (isInputDisabled.value) return;
  dragCounter--;
  if (dragCounter === 0) {
    isDragging.value = false;
  }
};

const handleDrop = async (e: DragEvent) => {
  e.preventDefault();
  if (isInputDisabled.value) {
    ElMessage.warning("当前已被禁言，不能发送消息");
    isDragging.value = false;
    dragCounter = 0;
    return;
  }
  isDragging.value = false;
  dragCounter = 0;

  const files = e.dataTransfer?.files;
  if (files?.length) {
    await addFilesToQueue(files);
  }
};

// ==================== 粘贴处理 ====================

const MAX_PASTE_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

const handlePaste = async (e: ClipboardEvent) => {
  e.preventDefault();
  if (isInputDisabled.value) {
    ElMessage.warning("当前已被禁言，不能发送消息");
    return;
  }

  try {
    const result: any = await onPaste(e as any);
    if (!result) return;

    if (result.type === "string") {
      document.execCommand("insertText", false, result.data);
      editor.moveCursorToEnd();
      return;
    }

    // 处理文件和图片
    if (result.type === "file" || result.type === "image") {
      const file = result.data as File;
      if (!file) return;

      // 大文件检查
      if (file.size > MAX_PASTE_IMAGE_SIZE) {
        ElMessage.warning("文件大小超过 10MB 限制");
        return;
      }

      // 图片可以直接插入编辑器显示，也可以加入队列
      // 这里统一加入队列，保持一致性
      await addFilesToQueue([file]);
    }
  } catch (err) {
    // 忽略不支持的粘贴类型
    log.warn("paste error", err);
  }
};

// ==================== 键盘事件 ====================

const handleKeyDown = (event: KeyboardEvent) => {
  if (isInputDisabled.value) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  // Enter 发送（排除中文输入法 composing）
  if ((event.key === "Enter" || event.keyCode === 13) && !(event.target as any)?.composing) {
    event.preventDefault();
    event.stopPropagation();
    handleSend();
  }
};

// 节流时间戳
let lastKeyupTime = 0;
const KEYUP_THROTTLE = 50;

const handleKeyUp = () => {
  if (isInputDisabled.value) return;
  const now = Date.now();
  if (now - lastKeyupTime < KEYUP_THROTTLE) return;
  lastKeyupTime = now;

  atMention.checkAndShowDialog();
};

// ==================== 发送消息 ====================

const handleSend = async () => {
  if (isInputDisabled.value) {
    ElMessage.warning("当前已被禁言，不能发送消息");
    return;
  }
  const parts = editor.extractParts();
  if (!parts?.length) return;

  // 如果有引用消息，将引用信息添加到所有消息部分中
  if (replyMessage.value) {
    const reply = {
      messageId: replyMessage.value.messageId,
      fromId: replyMessage.value.fromId,
      previewText: replyMessage.value.previewText,
      messageContentType: replyMessage.value.messageContentType
    };
    // 只给第一个消息添加引用（避免多条消息都带引用）
    if (parts.length > 0) {
      parts[0].replyMessage = reply;
    }
  }

  await chatStore.handleSendMessage(parts);
  log.prettyInfo("send message", parts);

  // 清理编辑器和文件队列
  editor.clearContent();
  emojiVisible.value = false;
  atMention.hideDialog();
  cancelReply(); // 清除引用消息

  // 清除草稿
  const chatId = chatStore.currentChat?.chatId;
  if (chatId) editor.clearDraft(chatId);
};

// ==================== @ 提及回调 ====================

const handlePickUser = (user: any) => {
  atMention.insertAtTag(user);
};

// ==================== 交互处理 ====================

const handleInteraction = () => {
  if (isInputDisabled.value) return;
  const chatId = chatStore.currentChat?.chatId;
  if (chatId) editor.saveDraftDebounced(chatId);
};

// ==================== 工具栏操作 ====================

const handleScreenshot = () => {
  if (isInputDisabled.value) return;
  chatStore.handleShowScreenshot();
};
const handleRecord = () => {
  if (isInputDisabled.value) return;
  chatStore.handleShowRecord?.();
};
const handleCall = () => {
  if (isInputDisabled.value) return;
  callStore.handleCreateCallMessage?.();
};
const toggleHistoryDialog = () => {
  historyDialogVisible.value = !historyDialogVisible.value;
};

// ==================== 生命周期 ====================

// 监听会话切换，恢复草稿并清除引用消息
watch(
  () => chatStore.currentChat?.chatId,
  async chatId => {
    if (!chatId) return;
    cancelReply(); // 切换会话时清除引用消息
    await editor.restoreDraft(chatId);
    if (chatStore.getCurrentType === MessageType.GROUP_MESSAGE.code) {
      const gid = chatStore.currentChat?.toId;
      if (gid) await groupStore.loadGroupInfo(String(gid));
    }
  },
  { immediate: true }
);

onMounted(() => {
  // 恢复 emoji 历史
  try {
    historyEmojiList.value = JSON.parse(storage.get("emojiHistory")) || [];
  } catch {
    historyEmojiList.value = [];
  }

  // 注册全局快捷键
  try {
    addShortcut({
      name: "sendMessage",
      combination: "Alt + S",
      handler: handleSend,
    });
  } catch {
    /* ignore */
  }

  // 监听引用消息事件
  globalEventBus.on(Events.MESSAGE_REPLY, (msg: ReplyMessageWithSender) => {
    setReplyMessage(msg);
  });

  // 监听取消引用事件
  globalEventBus.on(Events.MESSAGE_REPLY_CANCEL, () => {
    cancelReply();
  });
});

onBeforeUnmount(() => {
  const chatId = chatStore.currentChat?.chatId;
  editor.cleanup(chatId);
});

// ==================== 暴露给父组件 ====================

defineExpose({
  pendingFiles: editor.pendingFiles,
  removeFile: handleRemoveFile,
});
</script>

<style lang="scss" scoped>
@mixin scroll-bar($width: 8px) {
  &::-webkit-scrollbar-track {
    border-radius: 10px;
    background-color: transparent;
  }

  &::-webkit-scrollbar {
    width: $width;
    height: 10px;
    background-color: transparent;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 10px;
    background-color: rgba(0, 0, 0, 0.2);
  }
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;

  &.is-dragging {
    .chat-container-input {
      border-color: var(--el-color-primary, #409eff);
    }
  }
}

// 拖拽遮罩
.drag-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(64, 158, 255, 0.08);
  border: 2px dashed var(--el-color-primary, #409eff);
  border-radius: 8px;
  pointer-events: none;
}

.drag-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--el-color-primary, #409eff);

  .drag-icon {
    font-size: 32px;
    animation: bounce 0.6s ease-in-out infinite;
  }

  span {
    font-size: 14px;
    font-weight: 500;
  }
}

@keyframes bounce {

  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-6px);
  }
}

// 淡入淡出动画
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.chat-container-tool {
  display: flex;
  height: 25px;
  padding: 5px;
  margin-left: 10px;
  // border-top: 1px solid rgba(148, 142, 142, 0.11);

  .icon-box {
    margin-right: 12px;
    cursor: pointer;

    i {
      font-size: 20px;
      color: var(--input-button-icon-color);

      &:hover {
        color: rgb(25, 166, 221);
      }
    }

    &.disabled {
      pointer-events: none;
      opacity: 0.5;
    }
  }
}

.chat-container-input {
  font-size: 15px;
  color: var(--input-font-color);
  border: none;
  outline: none;
  padding: 5px 8px;
  overflow-y: auto;
  flex: 1 1 auto;
  //word-break: break-all; // 解决纯字母时不自动换行问题
  white-space: pre-wrap;
  /* 保留空格和换行 */
  word-break: break-word;
  /* 长单词换行 */
  //caret-color: red; /* 光标颜色改成红色 */

  &:empty:before {
    content: attr(data-placeholder);
    color: #999;
    font-size: 14px;
  }

  // &:focus:before {
  //   content: " "; // 解决无内容时聚焦没有光标
  // }

  /* 可以伸缩，但只占所需空间 */
  @include scroll-bar();
}

.chat-container-button .button {
  height: 30px;
  width: 90px;
  margin: 0 30px 10px auto;
  border-radius: 6px;
  border: none;
  float: right;

  &:hover {
    box-shadow: 1px 1px 2px #cec5c5;
    border: 1px solid rgba(255, 255, 255, 0.8);
  }
}

/* @ 标签样式 */
.active-text {
  background: rgba(25, 166, 221, 0.08);
  border-radius: 4px;
  padding: 0 4px;
  margin: 0 2px;
}

/* 引用消息预览样式 */
.reply-preview {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 8px 10px;
  margin: 0 8px 6px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 4px;

  &__bar {
    width: 2px;
    min-height: 100%;
    background: var(--side-bg-color, #409eff);
    border-radius: 1px;
    flex-shrink: 0;
  }

  &__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__label {
    font-size: 12px;
    font-weight: 500;
    color: var(--side-bg-color, #409eff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__close {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;

    &:hover {
      opacity: 1;
    }

    .iconfont {
      font-size: 12px;
      color: var(--content-font-color, #333);
    }
  }

  &__text {
    font-size: 12px;
    color: var(--content-message-font-color, #90969b);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

// 滑入滑出过渡
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.15s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

// 暗色主题
:root[data-theme="dark"] {
  .reply-preview {
    background: rgba(255, 255, 255, 0.05);
  }
}
</style>
