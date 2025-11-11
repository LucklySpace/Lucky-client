<template>
  <div class="chat-container">
    <!-- 工具栏 -->
    <div class="chat-container-tool">
      <!-- 表情 -->
      <div ref="emojiBtnRef" :title="$t('chat.toolbar.emoji')" class="icon-box" @click="toggleEmoji">
        <i class="iconfont icon-biaoqing-xue"></i>
        <!-- 使用 v-model:visible 控制 popover 显示，避免直接调用底层 API -->
        <el-popover ref="emojiPopoverRef" v-model:visible="emojiVisible" :virtual-ref="emojiBtnRef" placement="top"
          popper-class="emoji-popper" trigger="click" virtual-triggering width="390">
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
    <div ref="inputContentRef" :data-placeholder="chatStore.getCurrentType === IMessageType.GROUP_MESSAGE.code
        ? $t('chat.input.mentionHint', { at: '@' })
        : $t('chat.input.placeholder')
      " class="chat-container-input" contenteditable="true" spellcheck="false" @click="handleSelection"
      @input="handleSelection" @keydown="handleKeyDown" @keyup="handleKeyUp" @paste.prevent="handlePaste"></div>

    <!-- 发送按钮 -->
    <div class="chat-container-button">
      <button :title="settingStore.getShortcut('sendMessage')" class="button" @click="handleSendMessageWrapper">
        {{ $t("actions.send") }}
      </button>
    </div>

    <!-- @ 弹窗组件 -->
    <AtDialog v-if="atDialogParam.showDialog" :position="atDialogParam.position"
      :queryString="atDialogParam.queryString" :users="chatStore.getCurrentGroupMembersExcludeSelf"
      :visible="atDialogParam.showDialog" @handleHide="handleHide" @handlePickUser="handlePickUser" />

    <HistoryDialog :visible="historyDialogParam.showDialog" title="聊天历史记录" @handleClose="toggleHistoryDialog" />
  </div>
</template>

<script lang="ts" setup>
/**
 * 聊天输入组件（主逻辑）
 *
 * 该组件职责：
 *  - 提供一个 contenteditable 输入区，支持富文本（@ 标签、图片、换行、emoji）
 *  - 将编辑区内容解析为 parts（text / image / at）以便发送
 *  - 粘贴图片时把 File 存入 fileList 并在 <img> 上标记 data-file-index，发送时可从 fileList 拿回 File
 *  - 支持插入不可编辑的 @ 标签（span.active-text，包含 data-id 和 data-name）
 *  - 支持 emoji 弹窗、截图、文件直接发送、发送按钮和快捷键
 *
 * 注：所有 DOM 操作都做了空值保护（尽量避免在 SSR 或非浏览器环境报错）
 */

import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import emoji from "@/components/Emoji/index.vue";
import AtDialog from "@/components/Atdialog/index.vue";
import HistoryDialog from "@/components/History/index.vue";
import { useChatStore } from "@/store/modules/chat";
import { useSettingStore } from "@/store/modules/setting";
import { useCallStore } from "@/store/modules/call";
import { storage } from "@/utils/Storage";
import onPaste from "@/utils/Paste.ts";
import { useLogger } from "@/hooks/useLogger";
import { IMessageType } from "@/constants";
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
import { IMessagePart } from "@/models";

const chatStore = useChatStore();
const callStore = useCallStore();
const logger = useLogger();
const settingStore = useSettingStore();
const { addShortcut } = useGlobalShortcut();

/** ------------------ refs & state ------------------ **/
const emojiBtnRef = ref<HTMLElement | null>(null);
const emojiPopoverRef = ref<HTMLElement | null>(null);
const emojiVisible = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const inputContentRef = ref<HTMLElement | null>(null);

// fileList：存储通过粘贴/选择添加的 File 对象。图片 <img> 会有 data-file-index 指向 fileList 的索引
const fileList = ref<File[]>([]); // 保存通过粘贴或 file input 添加的 File（用于映射 <img data-file-index>)
const historyEmojiList = ref<string[]>([]);
// AT_PATTERN：用于检测文本节点中以 @ 开头的触发器（不包含空白、只匹配最近的 @）
const AT_PATTERN = /@([^@\s]*)$/;
// 插入 @ 后使用零宽空格占位，避免后续合并文本时破坏标签边界
const AT_SPACE = "\u200b\u200b";

// 用来传递给 AtDialog 的状态（弹窗展示位置、查询字符串、对应的文本节点等）
const historyDialogParam = ref({ showDialog: false });
const atDialogParam = reactive({
  showDialog: false,
  node: null as Node | null, // 触发 @ 的文本节点（用于替换）
  endIndex: 0, // 光标在文本节点内的结束索引，用于替换 @query
  position: { x: 0, y: 0 }, // 弹窗展示相对于视窗的坐标
  queryString: "", // 当前 @ 后面的查询字符串
  user: {} as any
});

/** ------------------ helper：光标/选区 ------------------ **/

/**
 * 获取当前 selection；任何 DOM 操作都围绕该 API 进行
 * 返回 null 时调用方应做空值保护（表示非浏览器或 API 调用异常）
 */
const getSel = (): Selection | null => {
  try {
    return window.getSelection();
  } catch {
    return null;
  }
};

/**
 * 将光标移动到输入区末尾（兼容多浏览器）
 * - 在插入元素（emoji / at / 图片）后把光标放到末尾，避免用户继续在其它位置输入
 */
const cursorToEnd = () => {
  const el = inputContentRef.value;
  if (!el) return;
  el.focus();
  const sel = getSel();
  if (!sel) return;
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.addRange(range);
};

/**
 * stripZero：移除零宽字符（用于解析/比较文本时去掉占位符）
 * - 会移除 \u200B、\uFEFF、\u200C、\u200D 等常见零宽字符
 */
const stripZero = (s = "") => s.replace(/[\u200B\uFEFF\u200C\u200D]/g, "");

/* ---------- debounce with cancel ----------
 * 提供带 cancel 的防抖工具，便于组件卸载时强制取消定时器
 * 用法：
 *   const deb = debounceWithCancel(fn, 400);
 *   deb(); deb.cancel();
 */
function debounceWithCancel<T extends (...args: any[]) => any>(fn: T, wait = 300) {
  let tid: number | undefined;
  const wrapped = (...args: Parameters<T>) => {
    if (tid) clearTimeout(tid);
    // @ts-ignore
    tid = window.setTimeout(() => fn(...args), wait);
  };
  (wrapped as any).cancel = () => {
    if (tid) {
      clearTimeout(tid);
      tid = undefined;
    }
  };
  return wrapped as T & { cancel: () => void };
}

/* ---------- At/@ helpers ----------
 * 以下函数用于检测 @ 触发、计算光标/范围位置、以及插入不可编辑的 @ 标签（span.active-text）
 */

const getRangeNode = (): Node | null => {
  const sel = getSel();
  return sel && sel.focusNode ? sel.focusNode : null;
};
const getCursorIndex = (): number => {
  const sel = getSel();
  return sel ? sel.focusOffset : 0;
};

/**
 * getAtUserQuery：
 * - 如果光标所在文本节点前包含 @ 开头并符合 AT_PATTERN，则返回 @ 后面的查询字符串（不含 @）
 * - 用于在用户输入 @ 后显示联系人搜索弹窗
 */
const getAtUserQuery = (): string | undefined => {
  const node = getRangeNode();
  if (!node) return undefined;
  const content = node.textContent || "";
  const match = AT_PATTERN.exec(content.slice(0, getCursorIndex()));
  return match && match[1] ? match[1] : undefined;
};

/**
 * showAt：
 * - 检测当前光标前是否处于 @ 的触发状态（返回 boolean）
 * - 该函数不会读取整个 currentChat（避免 watchEffect 过度触发）
 */
const showAt = (): boolean => {
  const node = getRangeNode();
  if (!node) return false;
  const offset = getCursorIndex();
  const text = (node.textContent || "").slice(0, offset);
  return AT_PATTERN.test(text);
};

/**
 * getRangeRect：
 * - 计算当前选区（range）的可视矩形，用于在该位置显示 @ 弹窗
 * - 若无法获取 range，会退回到输入框底部作为展示位置
 */
const getRangeRect = () => {
  const sel = getSel();
  if (!sel || sel.rangeCount === 0) {
    // fallback：输入框底部
    const el = inputContentRef.value;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.bottom };
  }
  try {
    const range = sel.getRangeAt(0);
    const rects = range.getClientRects();
    if (!rects || rects.length === 0) {
      const r = range.getBoundingClientRect();
      return { x: r.left || 0, y: (r.top || 0) + (r.height || 0) };
    }
    const rect = rects[0];
    // y 往下偏移一点，让弹窗不遮挡文本
    return { x: rect.x || rect.left || 0, y: (rect.y || rect.top || 0) + (rect.height || 0) };
  } catch {
    return { x: 0, y: 0 };
  }
};

/**
 * createAtButton：
 * - 生成一个不可编辑的 span（contenteditable=false）来作为 @ 标签的展示
 * - 包含 data-id（userId）和 data-name（用于调试 / 恢复）
 * - 插入后应把光标移动到标签后（或标签后首个文本节点）
 */
const createAtButton = (user: { userId: string; name: string }) => {
  const span = document.createElement("span");
  span.className = "active-text";
  span.setAttribute("contenteditable", "false");
  span.setAttribute("data-id", user.userId);
  // 增加 data-name 便于调试
  span.setAttribute("data-name", user.name);
  span.innerText = `@${user.name}`;
  // 可自定义样式（在 CSS 中统筹更好），此处做默认视觉提示
  span.style.color = "blue";
  span.style.padding = "0 2px";
  return span;
};

const replaceStringAt = (raw: string, replace = "") => raw.replace(AT_PATTERN, replace);

/**
 * replaceAtUser：
 * - 将触发 @ 的文本节点中 @query 的部分替换为不可编辑的 @ 标签（span），
 *   同时在前后插入零宽空白以避免节点粘连。
 * - 操作完后把光标放到插入后文本的开始位置或 atButton 之后。
 */
const replaceAtUser = (user: any) => {
  const node: any = atDialogParam.node;
  const elRoot = inputContentRef.value;
  if (!node || !elRoot) return;

  const endIndex = atDialogParam.endIndex || 0;
  const content = node.textContent || "";

  // pre 与 rest
  const pre = replaceStringAt(content.slice(0, endIndex), "");
  const rest = content.slice(endIndex);

  const prevText = new Text(pre + AT_SPACE);
  const nextText = new Text(AT_SPACE + rest);
  const atBtn = createAtButton(user);
  const parent = node.parentNode;
  if (!parent) return;

  const nextSibling = node.nextSibling;
  if (nextSibling) {
    parent.insertBefore(prevText, nextSibling);
    parent.insertBefore(atBtn, nextSibling);
    parent.insertBefore(nextText, nextSibling);
    parent.removeChild(node);
  } else {
    parent.appendChild(prevText);
    parent.appendChild(atBtn);
    parent.appendChild(nextText);
    parent.removeChild(node);
  }

  // 将光标放在 nextTextNode 开头（若 nextTextNode 为空则放到 atButton 后）
  nextTick(() => {
    const sel = getSel();
    if (!sel) return;
    sel.removeAllRanges();
    const r = document.createRange();
    if (nextText.nodeValue && nextText.nodeValue.length > 0) r.setStart(nextText, 0);
    else r.setStartAfter(atBtn);
    r.collapse(true);
    sel.addRange(r);
  });
};

/* ---------- emoji ----------
 * handleChooseEmoji：把 emoji 插入到当前选区
 * - 支持在无选区状态下 append
 * - 插入后把光标移动到字符后并记录历史
 */
const handleChooseEmoji = (emojiChar: string) => {
  const el = inputContentRef.value;
  if (!el) return;
  el.focus();
  const sel = getSel();
  if (!sel || !sel.rangeCount) {
    // append
    el.appendChild(document.createTextNode(emojiChar));
    cursorToEnd();
    pushEmojiHistory(emojiChar);
    return;
  }
  const r = sel.getRangeAt(0);
  const node = document.createTextNode(emojiChar);
  r.insertNode(node);
  r.setStartAfter(node);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
  pushEmojiHistory(emojiChar);
  cursorToEnd();
};

const pushEmojiHistory = (ch: string) => {
  const idx = historyEmojiList.value.indexOf(ch);
  if (idx >= 0) historyEmojiList.value.splice(idx, 1);
  historyEmojiList.value.unshift(ch);
  if (historyEmojiList.value.length > 16) historyEmojiList.value.length = 16;
  storage.set("emojiHistory", JSON.stringify(historyEmojiList.value));
};

/** ------------------ 文件 / 粘贴 图片 处理 ------------------ **/

/**
 * openFileDialog：触发隐藏的 <input type="file"> 打开系统文件选择窗口
 */
const openFileDialog = () => fileInputRef.value?.click();

/**
 * handleFileChange：
 * - 由 file input 的 change 事件触发
 * - 将用户选择的文件直接构造成 parts 并发送（示例：直接走 messageStore.handleSendMessage）
 * - 清空 input.value 以便重复选择同样文件
 */
const handleFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;
  // 可以将所有文件打包为要发送的 parts
  const parts: any[] = [];
  for (let i = 0; i < files.length; i++) parts.push({ type: "file", file: files[i] });
  if (parts.length) {
    chatStore.handleSendMessage(parts);
    logger.prettyInfo("send files", parts);
  }
  // 清空 input，方便再次选择同一文件
  input.value = "";
};

/**
 * handlePaste：
 * - 处理剪贴板粘贴（来自 onPaste 工具）
 * - 支持插入纯文本（document.execCommand('insertText')）以及图片（将 File 保存到 fileList，并插入 <img data-file-index>）
 * - 注意：这里对图片大小做了示例限制（2MB），可根据业务调整或提示用户
 */
const handlePaste = async (e: ClipboardEvent) => {
  e.preventDefault();
  const result: any = await onPaste(e as any);
  if (!result) return;
  // 如果是文本
  if (result.type === "string") {
    document.execCommand("insertText", false, result.data);
    cursorToEnd();
    return;
  }
  if (result.type === "file" || result.type === "image") {
    const file: File = result.data as File;
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      // 可提示用户（目前直接忽略）
      return;
    }
    const idx = fileList.value.push(file) - 1;
    const sel = getSel();
    const img = new Image();
    img.style.height = "90px";
    img.src = result.url;
    img.setAttribute("data-file-index", String(idx));
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0);
      r.insertNode(img);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      inputContentRef.value?.appendChild(img);
    }
  }
};

/** ------------------ 解析输入区为 message parts ------------------ **/

/**
 * extractPartsFromContent：
 * - 解析 contenteditable DOM 节点，将文本节点与自定义元素组合为 parts
 * - 语义：
 *   - 连续文本（含 @ 显示文本）会合并为单个 text part，mentionedUserIds 放在该 part 上
 *   - 图片单独作为 image part（优先使用 data-file-index 映射 File）
 * - 返回数组，便于直接发送或进一步合并为单条 message
 *
 * 注意点：
 * - 使用 stripZero 去掉占位零宽字符
 * - 在遇到 span.active-text 时把其作为 @ 展示文本插入 buffer（同时记录 data-id）
 * - 在遇到 IMG 时先 flush 当前文本 buffer 再生成 image part
 */
const extractPartsFromContent = (): IMessagePart[] => {
  const out: IMessagePart[] = [];
  const el = inputContentRef.value;
  if (!el) return out;

  // 累积文本（包含 @ 已插入的展示文本），并收集被 @ 的 id
  let textBuf = "";
  const mentioned = new Set<string>();

  const nodes = Array.from(el.childNodes);

  const flushText = () => {
    const txt = stripZero(textBuf).trim();
    if (txt.length > 0) {
      out.push({ type: "text", content: txt, mentionedUserIds: Array.from(mentioned) });
    }
    textBuf = "";
    mentioned.clear();
  };

  const isWhitespace = (ch?: string) => !!ch && /\s/.test(ch);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.nodeType === Node.TEXT_NODE) {
      // 直接把文本加入 buffer（移除零宽但保留普通空格/换行）
      textBuf += stripZero((node as Text).nodeValue || "");
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const en = node as HTMLElement;
      if (en.tagName === "SPAN" && en.classList.contains("active-text")) {
        // @ 标签：把显示文本加入 buffer，并收集 id
        // ensure space separation
        if (textBuf.length > 0 && !isWhitespace(textBuf.charAt(textBuf.length - 1))) textBuf += " ";
        const id = en.getAttribute("data-id") || "";
        const name = en.getAttribute("data-name") || en.innerText || "";
        textBuf += `@${name}`;
        if (id) mentioned.add(id);
        // 如果下一个节点是文本且首字符不是空白，补一个空格，避免拼接成一个单词
        const next = nodes[i + 1];
        const nextStart =
          next && next.nodeType === Node.TEXT_NODE ? stripZero((next as Text).nodeValue || "").charAt(0) : "";
        if (next && next.nodeType === Node.TEXT_NODE && nextStart && !isWhitespace(nextStart)) textBuf += " ";
      } else if (en.tagName === "IMG") {
        // 图片为独立 part：先 flush 文本 buffer，然后处理图片
        flushText();
        const idxAttr = en.getAttribute("data-file-index");
        if (idxAttr != null) {
          const idx = parseInt(idxAttr, 10);
          const f = fileList.value[idx];
          if (f) out.push({ type: "image", content: "", file: f });
          else out.push({ type: "image", content: (en as HTMLImageElement).src });
        } else {
          out.push({ type: "image", content: (en as HTMLImageElement).src });
        }
      } else if (en.tagName === "BR") {
        // 换行视为普通文本换行
        textBuf += "\n";
      } else {
        // 其它元素：把可见文本加入 buffer（例如 <b>, <i> 等）
        textBuf += stripZero(en.innerText || en.textContent || "");
      }
    }
  }

  // final flush
  const final = stripZero(textBuf).trim();
  if (final.length) out.push({ type: "text", content: final, mentionedUserIds: [] });

  return out;
};

/* ---------- 发送消息（改造为单条 text + meta） ---------- */
/**
 * handleSendMessage：
 * - 从编辑区提取 parts（extractPartsFromContent）
 * - 目前直接把 parts 传给 messageStore.handleSendMessage（store 负责将 parts 转为后端需要的 message）
 * - 发送成功后清理 UI（清空编辑区、fileList、关闭 emoji / at 弹窗）
 *
 * 你可以根据后端契约在这里做上传图片 -> 替换 url 的过程，或在 store 内处理。
 */
const handleSendMessage = async () => {
  const parts = extractPartsFromContent();
  if (!parts || parts.length === 0) return;

  await chatStore.handleSendMessage(parts);
  logger.prettyInfo("send message", parts);

  // 清理 UI
  fileList.value = [];
  if (inputContentRef.value) inputContentRef.value.innerHTML = "";
  emojiVisible.value = false;
  atDialogParam.showDialog = false;
};

/**
 * handleSendMessageWrapper：
 * - 在发送后清除 store 中对应会话的草稿（chatStore.clearDraft）
 * - 确保编辑区清空（双重保险）
 */
const handleSendMessageWrapper = async () => {
  await handleSendMessage();
  const chatId = chatStore.currentChat?.chatId;
  if (chatId) chatStore.clearDraft(chatId);
  if (inputContentRef.value) inputContentRef.value.innerHTML = "";
};

const toggleEmoji = () => {
  // 目前仅占位（如果需要可以主动切换 emojiVisible）
};

/** ------------------ 键盘事件 ------------------ **/

const handleKeyDown = (event: KeyboardEvent) => {
  // Enter 发送（排除中文输入法 composing 场景）
  if ((event.key === "Enter" || event.keyCode === 13) && !(event.target as any)?.composing) {
    event.preventDefault();
    event.stopPropagation();
    handleSendMessageWrapper();
  }
};

// 用于节流 keyup 事件（避免频繁计算）
let lastKeyup = 0;
const handleKeyUp = (e: KeyboardEvent) => {
  const now = Date.now();
  if (now - lastKeyup < 50) return;
  lastKeyup = now;

  // 如果检测到处于 @ 触发状态且没有输入查询（直接按 @ 后），并且当前是群聊，则弹出 AtDialog
  if (showAt() && !getAtUserQuery() && chatStore.getChatIsGroup) {
    logger.prettyInfo("会话输入区显示@弹窗", e);
    atDialogParam.node = getRangeNode();
    atDialogParam.endIndex = getCursorIndex();
    atDialogParam.position = getRangeRect();
    atDialogParam.queryString = getAtUserQuery() || "";
    atDialogParam.showDialog = true;
  } else {
    atDialogParam.showDialog = false;
  }
};

/** ------------------ AtDialog 回调 ------------------ **/

const handleHide = () => (atDialogParam.showDialog = false);
const handlePickUser = (user: any) => {
  // 从弹窗收到 user，插入 @ 标签
  replaceAtUser(user);
  atDialogParam.user = user;
  atDialogParam.showDialog = false;
};

/** ------------------ 其他工具 ------------------ **/

/**
 * handleSelection:
 * - 每次互动（click/input）调用，用于保存草稿（防抖）
 * - 备用：可在此处更新 selection 状态供其他逻辑使用
 */
const handleSelection = () => {
  // const handleSelection = (e: Event) => {
  // 每次 interaction 更新 selection/range 信息
  saveDraftDebounced();

  // 保持一个引用（可扩展）
};

/**
 * saveDraft：把当前编辑区 innerHTML 存入 chatStore 的草稿（key = chatId）
 * - 存 HTML 可以保留 @ 标签与图片占位，便于恢复编辑状态
 */
const saveDraft = () => {
  const chatId = chatStore.currentChat?.chatId;
  if (!chatId) return;
  const el = inputContentRef.value;
  if (!el) return;
  chatStore.setDraft(chatId, el.innerHTML || "");
};

// 防抖保存草稿（避免频繁写 store），组件卸载时会取消 pending 定时器并同步一次
const saveDraftDebounced = debounceWithCancel(saveDraft, 400);

const handleScreenshot = () => chatStore.handleShowScreenshot();
const handleRecord = () => chatStore.handleShowRecord?.();
const handleCall = () => callStore.handleCreateCallMessage?.();
const toggleHistoryDialog = () => (historyDialogParam.value.showDialog = !historyDialogParam.value.showDialog);

/* ---------- lifecycle ---------- */
watch(
  () => chatStore.currentChat?.chatId,
  async chatId => {
    // 切换会话时恢复草稿（如果有）
    const el = inputContentRef.value;
    if (!el || !chatId) return;
    const draftHtml = chatStore.getDraft(chatId) ?? "";
    el.innerHTML = draftHtml || "";
    await nextTick();
    cursorToEnd();
  },
  { immediate: true }
);

onMounted(() => {
  // 恢复 emoji 历史（本地存储）
  try {
    historyEmojiList.value = JSON.parse(storage.get("emojiHistory")) || [];
  } catch {
    historyEmojiList.value = [];
  }

  // 注册全局快捷键（例如 Alt+S 发送），使用 useGlobalShortcut 提供的 API
  try {
    addShortcut({
      name: "sendMessage",
      combination: "Alt + S",
      handler: () =>
        // optional: check focus
        handleSendMessageWrapper()
    });
  } catch {
  }
});

onBeforeUnmount(() => {
  // 卸载前强制同步草稿，取消防抖定时器，避免丢失编辑内容
  saveDraft();
  (saveDraftDebounced as any).cancel?.();
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
