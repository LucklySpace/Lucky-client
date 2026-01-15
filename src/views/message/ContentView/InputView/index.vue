<template>
  <div class="chat-container">
    <!-- 工具栏 -->
    <div class="chat-container-tool">
      <!-- 表情 -->
      <div ref="emojiBtnRef" :title="$t('chat.toolbar.emoji')" class="icon-box" @click="toggleEmoji">
        <i class="iconfont icon-biaoqing-xue"></i>
        <!-- 使用 v-model:visible 控制 popover 显示，避免直接调用底层 API -->
        <el-popover ref="emojiPopoverRef" v-model:visible="emojiVisible" :virtual-ref="emojiBtnRef" placement="top"
          trigger="click" virtual-triggering width="390">
          <emoji :historyEmojiList="historyEmojiList" @handleChooseEmoji="handleChooseEmoji" />
        </el-popover>
      </div>

      <!-- 截图（带下拉弹窗） -->
      <div class="icon-box">
        <!-- 主按钮：直接触发一次截图（快捷动作） -->

        <i :title="$t('chat.toolbar.screenshot')" class="iconfont icon-jietu1" @click="handleScreenshot"></i>

        <!-- 小下拉按钮：展开更多截图/录屏/上传选项（向上弹出） -->
        <el-popover :close-on-click-modal="true" :popper-style="{ minWidth: '90px' }" :show-arrow="true" placement="top"
          trigger="click" width="90">
          <el-row :gutter="5" align="middle" justify="center" style="margin-bottom: 8px" type="flex">
            <el-button link size="default" @click="handleScreenshot">{{ $t("chat.toolbar.screenshot") }}</el-button>
          </el-row>

          <el-row :gutter="5" align="middle" justify="center" type="flex">
            <el-button link size="default" @click="handleRecord">{{ $t("chat.toolbar.recorder.label") }}</el-button>
          </el-row>

          <!-- 触发器：使用一个小图标按钮（位于截图按钮右侧） -->
          <template #reference>
            <el-icon :size="15" style="margin-left: 2px">
              <ArrowDown />
            </el-icon>
          </template>
        </el-popover>
      </div>

      <!-- 截图 -->
      <!-- <div class="icon-box" @click="handleScreenshot" :title="$t('chat.toolbar.screenshot')">
        <i class="iconfont icon-jietu1"></i>
      </div> -->

      <!-- 录屏 -->
      <!-- <div class="icon-box" @click="handleRecord" :title="$t('chat.toolbar.recorder.label')">
        <i class="iconfont icon-luping"></i>
      </div> -->

      <!-- 视频通话 -->
      <div :title="$t('actions.videoCall')" class="icon-box" @click="handleCall">
        <i class="iconfont icon-shipin1"></i>
      </div>

      <!-- 文件 -->
      <div :title="$t('chat.toolbar.file')" class="icon-box" @click="openFileDialog">
        <i class="iconfont icon-wenjian"></i>
        <!-- 支持多选（按需改）-->
        <input ref="fileInputRef" style="display: none" type="file" @change="handleFileChange" />
      </div>

      <!-- 聊天历史 -->
      <div :title="$t('chat.toolbar.history')" class="icon-box" @click="toggleHistoryDialog">
        <i class="iconfont icon-liaotianjilu"></i>
      </div>
    </div>

    <!-- 输入框：contenteditable -->
    <div ref="editorRef" :data-placeholder="chatStore.getCurrentType === MessageType.GROUP_MESSAGE.code
      ? $t('chat.input.mentionHint', { at: '@' })
      : $t('chat.input.placeholder')
      " class="chat-container-input" contenteditable="true" spellcheck="false" @click="handleInteraction"
      @input="handleInteraction" @keydown="handleKeyDown" @keyup="handleKeyUp" @paste.prevent="handlePaste"></div>

    <!-- 发送按钮 -->
    <div class="chat-container-button">
      <button :title="settingStore.getShortcut('sendMessage')" class="button" @click="handleSend">
        {{ $t("actions.send") }}
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
 * - 粘贴图片支持
 * - 草稿自动保存
 * - @ 提及功能
 */

import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import emoji from "@/components/Emoji/index.vue";
import AtDialog from "@/components/Atdialog/index.vue";
import HistoryDialog from "@/components/History/index.vue";
import { useChatStore } from "@/store/modules/chat";
import { useSettingStore } from "@/store/modules/setting";
import { useCallStore } from "@/store/modules/call";
import { storage } from "@/utils/Storage";
import onPaste from "@/utils/Paste";
import { useLogger } from "@/hooks/useLogger";
import { MessageType } from "@/constants";
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
import { useInputEditor } from "@/hooks/useInputEditor";
import { useAtMention } from "@/hooks/useAtMention";

// ==================== Store & Hooks ====================

const chatStore = useChatStore();
const callStore = useCallStore();
const settingStore = useSettingStore();
const log = useLogger();
const { addShortcut } = useGlobalShortcut();

// ==================== Refs ====================

const emojiBtnRef = ref<HTMLElement | null>(null);
const emojiVisible = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const editorRef = ref<HTMLElement | null>(null);
const historyDialogVisible = ref(false);
const historyEmojiList = ref<string[]>([]);

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

const toggleEmoji = () => { /* popover 自动处理 */ };

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

const handleFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files?.length) return;

  const parts = editor.createPartsFromFiles(files);
  if (parts.length) {
    chatStore.handleSendMessage(parts);
    log.prettyInfo("send files", parts);
  }

  input.value = ""; // 清空以支持重复选择
};

// ==================== 粘贴处理 ====================

const MAX_PASTE_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

const handlePaste = async (e: ClipboardEvent) => {
  e.preventDefault();
  const result: any = await onPaste(e as any);
  if (!result) return;

  if (result.type === "string") {
    document.execCommand("insertText", false, result.data);
    editor.moveCursorToEnd();
    return;
  }

  if (result.type === "file" || result.type === "image") {
    const file = result.data as File;
    if (!file || file.size > MAX_PASTE_IMAGE_SIZE) return;
    editor.insertImage(file, result.url);
  }
};

// ==================== 键盘事件 ====================

const handleKeyDown = (event: KeyboardEvent) => {
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
  const now = Date.now();
  if (now - lastKeyupTime < KEYUP_THROTTLE) return;
  lastKeyupTime = now;

  atMention.checkAndShowDialog();
};

// ==================== 发送消息 ====================

const handleSend = async () => {
  const parts = editor.extractParts();
  if (!parts?.length) return;

  await chatStore.handleSendMessage(parts);
  log.prettyInfo("send message", parts);

  // 清理
  editor.clearContent();
  emojiVisible.value = false;
  atMention.hideDialog();

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
  const chatId = chatStore.currentChat?.chatId;
  if (chatId) editor.saveDraftDebounced(chatId);
};

// ==================== 工具栏操作 ====================

const handleScreenshot = () => chatStore.handleShowScreenshot();
const handleRecord = () => chatStore.handleShowRecord?.();
const handleCall = () => callStore.handleCreateCallMessage?.();
const toggleHistoryDialog = () => { historyDialogVisible.value = !historyDialogVisible.value; };

// ==================== 生命周期 ====================

// 监听会话切换，恢复草稿
watch(
  () => chatStore.currentChat?.chatId,
  async (chatId) => {
    if (!chatId) return;
    await editor.restoreDraft(chatId);
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
  } catch { /* ignore */ }
});

onBeforeUnmount(() => {
  const chatId = chatStore.currentChat?.chatId;
  editor.cleanup(chatId);
});
</script>

<style lang="scss" scoped>
@mixin scroll-bar($width: 8px) {

  /* 背景色为透明 */
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
</style>
