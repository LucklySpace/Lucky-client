/**
 * @ 提及功能
 * 处理 @ 触发检测、弹窗显示、标签插入等
 */

import { reactive, nextTick } from "vue";
import { getSelection } from "./useInputEditor";

// @ 触发模式：匹配光标前的 @xxx（不含空白）
const AT_PATTERN = /@([^@\s]*)$/;
// 插入 @ 标签后的零宽空格占位符
const AT_SPACE = "\u200b\u200b";

export interface AtUser {
  userId: string;
  name: string;
}

export interface AtDialogState {
  visible: boolean;
  node: Node | null;
  endIndex: number;
  position: { x: number; y: number };
  queryString: string;
}

export interface UseAtMentionOptions {
  /** 编辑器元素获取器 */
  getEditor: () => HTMLElement | null;
  /** 获取选区位置 */
  getSelectionRect: () => { x: number; y: number };
  /** 是否为群聊（只有群聊才显示 @ 弹窗） */
  isGroupChat: () => boolean;
}

export function useAtMention(options: UseAtMentionOptions) {
  const { getEditor, getSelectionRect, isGroupChat } = options;

  const state = reactive<AtDialogState>({
    visible: false,
    node: null,
    endIndex: 0,
    position: { x: 0, y: 0 },
    queryString: "",
  });

  // ==================== 检测 ====================

  /** 获取当前光标所在节点 */
  const getFocusNode = (): Node | null => {
    const sel = getSelection();
    return sel?.focusNode ?? null;
  };

  /** 获取光标偏移 */
  const getFocusOffset = (): number => {
    const sel = getSelection();
    return sel?.focusOffset ?? 0;
  };

  /** 检测是否处于 @ 触发状态 */
  const isAtTriggered = (): boolean => {
    const node = getFocusNode();
    if (!node) return false;
    const offset = getFocusOffset();
    const text = (node.textContent || "").slice(0, offset);
    return AT_PATTERN.test(text);
  };

  /** 获取 @ 后的查询字符串 */
  const getAtQuery = (): string | undefined => {
    const node = getFocusNode();
    if (!node) return undefined;
    const content = node.textContent || "";
    const match = AT_PATTERN.exec(content.slice(0, getFocusOffset()));
    return match?.[1];
  };

  // ==================== 弹窗控制 ====================

  /** 检查并显示 @ 弹窗 */
  const checkAndShowDialog = (): void => {
    if (!isGroupChat()) {
      state.visible = false;
      return;
    }

    if (isAtTriggered() && !getAtQuery()) {
      state.node = getFocusNode();
      state.endIndex = getFocusOffset();
      state.position = getSelectionRect();
      state.queryString = getAtQuery() || "";
      state.visible = true;
    } else {
      state.visible = false;
    }
  };

  /** 隐藏弹窗 */
  const hideDialog = () => {
    state.visible = false;
  };

  // ==================== 标签插入 ====================

  /** 创建 @ 标签元素 */
  const createAtTag = (user: AtUser): HTMLSpanElement => {
    const span = document.createElement("span");
    span.className = "active-text";
    span.setAttribute("contenteditable", "false");
    span.setAttribute("data-id", user.userId);
    span.setAttribute("data-name", user.name);
    span.innerText = `@${user.name}`;
    span.style.color = "blue";
    span.style.padding = "0 2px";
    return span;
  };

  /** 替换文本中的 @query 为 @ 标签 */
  const replaceAtQuery = (str: string, replacement = ""): string => {
    return str.replace(AT_PATTERN, replacement);
  };

  /** 插入 @ 标签（选中用户后调用） */
  const insertAtTag = (user: AtUser): void => {
    const node = state.node;
    const editor = getEditor();
    if (!node || !editor) return;

    const endIndex = state.endIndex || 0;
    const content = node.textContent || "";

    // 分割文本
    const pre = replaceAtQuery(content.slice(0, endIndex), "");
    const rest = content.slice(endIndex);

    // 创建节点
    const prevText = new Text(pre + AT_SPACE);
    const nextText = new Text(AT_SPACE + rest);
    const atTag = createAtTag(user);

    const parent = node.parentNode;
    if (!parent) return;

    // 插入节点
    const nextSibling = node.nextSibling;
    if (nextSibling) {
      parent.insertBefore(prevText, nextSibling);
      parent.insertBefore(atTag, nextSibling);
      parent.insertBefore(nextText, nextSibling);
      parent.removeChild(node);
    } else {
      parent.appendChild(prevText);
      parent.appendChild(atTag);
      parent.appendChild(nextText);
      parent.removeChild(node);
    }

    // 移动光标到标签后
    nextTick(() => {
      const sel = getSelection();
      if (!sel) return;

      sel.removeAllRanges();
      const range = document.createRange();

      if (nextText.nodeValue?.length) {
        range.setStart(nextText, 0);
      } else {
        range.setStartAfter(atTag);
      }

      range.collapse(true);
      sel.addRange(range);
    });

    // 隐藏弹窗
    state.visible = false;
  };

  return {
    state,
    // 检测
    isAtTriggered,
    getAtQuery,
    // 弹窗
    checkAndShowDialog,
    hideDialog,
    // 插入
    insertAtTag,
  };
}

