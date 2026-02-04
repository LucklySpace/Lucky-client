/**
 * @ 提及功能 Hook
 * 
 * 功能：
 * - 检测 @ 触发状态
 * - 管理 @ 弹窗显示/隐藏
 * - 插入 @ 标签到编辑器
 * - 支持 @所有人
 */

import { computed, nextTick, reactive } from "vue";
import { getSelection } from "./useInputEditor";

// ==================== 常量 ====================

/** @ 触发模式：匹配光标前的 @xxx（不含空白） */
const AT_PATTERN = /@([^@\s]*)$/;

/** 插入 @ 标签后的零宽空格占位符 */
const ZERO_WIDTH_SPACE = "\u200b";

/** @所有人 的特殊标识 */
export const MENTION_ALL_ID = "all";
export const MENTION_ALL_NAME = "所有人";

// ==================== 类型定义 ====================

/** @ 用户信息 */
export interface AtUser {
  userId: string;
  name: string;
  avatar?: string | null;
}

/** @ 所有人选项 */
export interface AtAllOption {
  userId: typeof MENTION_ALL_ID;
  name: typeof MENTION_ALL_NAME;
  isAll: true;
}

/** @ 弹窗状态 */
export interface AtDialogState {
  /** 弹窗是否可见 */
  visible: boolean;
  /** 触发 @ 时的文本节点 */
  node: Node | null;
  /** 触发时的光标偏移位置 */
  endIndex: number;
  /** 弹窗位置 */
  position: { x: number; y: number };
  /** @ 后的查询字符串（用于过滤） */
  queryString: string;
}

/** Hook 配置选项 */
export interface UseAtMentionOptions {
  /** 编辑器元素获取器 */
  getEditor: () => HTMLElement | null;
  /** 获取选区位置 */
  getSelectionRect: () => { x: number; y: number };
  /** 是否为群聊（只有群聊才显示 @ 弹窗） */
  isGroupChat: () => boolean;
}

/** @ 标签插入结果 */
export interface InsertAtTagResult {
  success: boolean;
  isAll: boolean;
  userId: string;
  name: string;
}

// ==================== 工具函数 ====================

/**
 * 判断是否为 @所有人
 */
export function isMentionAll(user: AtUser | AtAllOption): user is AtAllOption {
  return (
    user.userId === MENTION_ALL_ID ||
    user.name === MENTION_ALL_NAME ||
    (user as AtAllOption).isAll === true
  );
}

/**
 * 创建 @所有人 选项
 */
export function createMentionAllOption(): AtAllOption {
  return {
    userId: MENTION_ALL_ID,
    name: MENTION_ALL_NAME,
    isAll: true,
  };
}

// ==================== Hook 实现 ====================

export function useAtMention(options: UseAtMentionOptions) {
  const { getEditor, getSelectionRect, isGroupChat } = options;

  // ==================== 状态 ====================

  const state = reactive<AtDialogState>({
    visible: false,
    node: null,
    endIndex: 0,
    position: { x: 0, y: 0 },
    queryString: "",
  });

  // ==================== 选区操作 ====================

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

  // ==================== @ 检测 ====================

  /** 检测光标前是否有 @ 触发模式 */
  const isAtTriggered = (): boolean => {
    const node = getFocusNode();
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;

    const offset = getFocusOffset();
    const text = (node.textContent || "").slice(0, offset);
    return AT_PATTERN.test(text);
  };

  /** 获取 @ 后的查询字符串 */
  const getAtQuery = (): string | undefined => {
    const node = getFocusNode();
    if (!node) return undefined;

    const content = node.textContent || "";
    const offset = getFocusOffset();
    const match = AT_PATTERN.exec(content.slice(0, offset));
    return match?.[1];
  };

  /** @ 匹配信息 */
  const atMatchInfo = computed(() => {
    const triggered = isAtTriggered();
    const query = triggered ? getAtQuery() : undefined;
    return { triggered, query };
  });

  // ==================== 弹窗控制 ====================

  /** 检查并显示 @ 弹窗 */
  const checkAndShowDialog = (): void => {
    // 非群聊不显示
    if (!isGroupChat()) {
      hideDialog();
      return;
    }

    // 检测 @ 触发状态
    if (!isAtTriggered()) {
      hideDialog();
      return;
    }

    // 记录触发位置和查询字符串
    state.node = getFocusNode();
    state.endIndex = getFocusOffset();
    state.position = getSelectionRect();
    state.queryString = getAtQuery() || "";
    state.visible = true;
  };

  /** 隐藏弹窗 */
  const hideDialog = (): void => {
    state.visible = false;
    state.queryString = "";
  };

  /** 重置状态 */
  const resetState = (): void => {
    state.visible = false;
    state.node = null;
    state.endIndex = 0;
    state.position = { x: 0, y: 0 };
    state.queryString = "";
  };

  // ==================== @ 标签操作 ====================

  /** 创建 @ 标签元素 */
  const createAtTag = (user: AtUser | AtAllOption): HTMLSpanElement => {
    const span = document.createElement("span");
    const isAll = isMentionAll(user);

    span.className = "active-text";
    span.setAttribute("contenteditable", "false");
    span.setAttribute("data-id", user.userId);
    span.setAttribute("data-mention-id", user.userId);
    span.setAttribute("data-name", user.name);

    if (isAll) {
      span.setAttribute("data-mention-all", "true");
      span.classList.add("mention-all");
    }

    span.innerText = `@${user.name}`;

    // 样式设置
    span.style.cssText = `
      color: ${isAll ? "#e67e22" : "#1890ff"};
      padding: 0 2px;
      margin: 0 1px;
      border-radius: 2px;
      background: ${isAll ? "rgba(230, 126, 34, 0.08)" : "rgba(24, 144, 255, 0.08)"};
      cursor: default;
      user-select: none;
    `;

    return span;
  };

  /** 替换文本中的 @query 为指定内容 */
  const replaceAtQuery = (str: string, replacement = ""): string => {
    return str.replace(AT_PATTERN, replacement);
  };

  /** 插入 @ 标签到编辑器 */
  const insertAtTag = (user: AtUser | AtAllOption): InsertAtTagResult => {
    const node = state.node;
    const editor = getEditor();

    if (!node || !editor) {
      return { success: false, isAll: false, userId: "", name: "" };
    }

    const endIndex = state.endIndex || 0;
    const content = node.textContent || "";

    // 分割文本：@ 之前的内容 + @ 之后的内容
    const preContent = replaceAtQuery(content.slice(0, endIndex), "");
    const restContent = content.slice(endIndex);

    // 创建节点
    const prevTextNode = document.createTextNode(preContent + ZERO_WIDTH_SPACE);
    const nextTextNode = document.createTextNode(ZERO_WIDTH_SPACE + restContent);
    const atTagNode = createAtTag(user);

    const parent = node.parentNode;
    if (!parent) {
      return { success: false, isAll: false, userId: "", name: "" };
    }

    // 插入节点：替换原文本节点
    const nextSibling = node.nextSibling;
    if (nextSibling) {
      parent.insertBefore(prevTextNode, nextSibling);
      parent.insertBefore(atTagNode, nextSibling);
      parent.insertBefore(nextTextNode, nextSibling);
      parent.removeChild(node);
    } else {
      parent.appendChild(prevTextNode);
      parent.appendChild(atTagNode);
      parent.appendChild(nextTextNode);
      parent.removeChild(node);
    }

    // 移动光标到标签后
    nextTick(() => {
      const sel = getSelection();
      if (!sel) return;

      sel.removeAllRanges();
      const range = document.createRange();

      // 定位到 nextTextNode 的开头（零宽空格之后）
      if (nextTextNode.nodeValue && nextTextNode.nodeValue.length > 0) {
        range.setStart(nextTextNode, 1); // 跳过零宽空格
      } else {
        range.setStartAfter(atTagNode);
      }

      range.collapse(true);
      sel.addRange(range);
    });

    // 隐藏弹窗
    hideDialog();

    return {
      success: true,
      isAll: isMentionAll(user),
      userId: user.userId,
      name: user.name,
    };
  };

  /** 手动插入 @ 标签（不依赖当前状态，直接在光标位置插入） */
  const insertAtTagAtCursor = (user: AtUser | AtAllOption): InsertAtTagResult => {
    const editor = getEditor();
    if (!editor) {
      return { success: false, isAll: false, userId: "", name: "" };
    }

    const sel = getSelection();
    if (!sel || sel.rangeCount === 0) {
      return { success: false, isAll: false, userId: "", name: "" };
    }

    const range = sel.getRangeAt(0);
    const atTagNode = createAtTag(user);
    const spaceAfter = document.createTextNode(ZERO_WIDTH_SPACE + " ");

    // 删除选中内容（如有）
    range.deleteContents();

    // 插入 @ 标签和空格
    range.insertNode(spaceAfter);
    range.insertNode(atTagNode);

    // 移动光标到空格后
    range.setStartAfter(spaceAfter);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    return {
      success: true,
      isAll: isMentionAll(user),
      userId: user.userId,
      name: user.name,
    };
  };

  // ==================== 返回 ====================

  return {
    /** 弹窗状态 */
    state,

    // 检测
    /** 检测是否处于 @ 触发状态 */
    isAtTriggered,
    /** 获取 @ 后的查询字符串 */
    getAtQuery,
    /** @ 匹配信息（computed） */
    atMatchInfo,

    // 弹窗控制
    /** 检查并显示 @ 弹窗 */
    checkAndShowDialog,
    /** 隐藏弹窗 */
    hideDialog,
    /** 重置状态 */
    resetState,

    // 标签操作
    /** 创建 @ 标签元素 */
    createAtTag,
    /** 插入 @ 标签（通过弹窗选择时调用） */
    insertAtTag,
    /** 在光标位置插入 @ 标签（手动触发） */
    insertAtTagAtCursor,

    // 工具
    /** 判断是否为 @所有人 */
    isMentionAll,
    /** 创建 @所有人 选项 */
    createMentionAllOption,
  };
}
