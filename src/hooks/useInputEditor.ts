/**
 * 输入编辑器核心逻辑
 * 处理光标、选区、内容解析、草稿管理、文件队列等
 */

import { ref, Ref, nextTick, reactive, computed } from "vue";
import { IMessagePart } from "@/models";
import { FileType, fromFileName } from "@/constants";
import { storage } from "@/utils/Storage";

// ==================== 文件队列项类型 ====================

export interface PendingFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string;
  uploading?: boolean;
  progress?: number;
}

// 零宽字符正则
const ZERO_WIDTH_REGEX = /[\u200B\uFEFF\u200C\u200D]/g;

// 草稿存储 key
const DRAFT_STORAGE_KEY = "chat_drafts";

/** 移除零宽字符 */
export const stripZero = (s = "") => s.replace(ZERO_WIDTH_REGEX, "");

/** 获取 Selection 对象（兼容性处理） */
export const getSelection = (): Selection | null => {
  try {
    return window.getSelection();
  } catch {
    return null;
  }
};

/** 带取消功能的防抖 */
export function debounceWithCancel<T extends (...args: any[]) => any>(fn: T, wait = 300) {
  let tid: number | undefined;
  const wrapped = (...args: Parameters<T>) => {
    if (tid) clearTimeout(tid);
    tid = window.setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => {
    if (tid) {
      clearTimeout(tid);
      tid = undefined;
    }
  };
  return wrapped as T & { cancel: () => void };
}

// ==================== 草稿管理器（单例） ====================

class DraftManager {
  private static instance: DraftManager;
  private draftMap: Record<string, string> = {};
  private initialized = false;

  private constructor() {}

  static getInstance(): DraftManager {
    if (!DraftManager.instance) {
      DraftManager.instance = new DraftManager();
    }
    return DraftManager.instance;
  }

  /** 初始化（从存储加载） */
  init(): void {
    if (this.initialized) return;
    try {
      const stored = storage.get(DRAFT_STORAGE_KEY);
      if (stored) {
        this.draftMap = JSON.parse(stored);
      }
    } catch {
      this.draftMap = {};
    }
    this.initialized = true;
  }

  /** 获取草稿 */
  get(chatId: string | number): string | undefined {
    this.init();
    return this.draftMap[String(chatId)] || undefined;
  }

  /** 设置草稿 */
  set(chatId: string | number, html: string): void {
    this.init();
    const id = String(chatId);
    if (!id) return;

    if (html?.trim()) {
      this.draftMap[id] = html;
    } else {
      delete this.draftMap[id];
    }
    this.persist();
  }

  /** 清除草稿 */
  clear(chatId: string | number): void {
    this.init();
    delete this.draftMap[String(chatId)];
    this.persist();
  }

  /** 获取所有草稿 */
  getAll(): Record<string, string> {
    this.init();
    return { ...this.draftMap };
  }

  /** 检查是否有草稿 */
  has(chatId: string | number): boolean {
    this.init();
    return !!this.draftMap[String(chatId)]?.trim();
  }

  /** 持久化到存储 */
  private persist(): void {
    try {
      storage.set(DRAFT_STORAGE_KEY, JSON.stringify(this.draftMap));
    } catch {
      /* ignore */
    }
  }
}

/** 草稿管理器实例 */
export const draftManager = DraftManager.getInstance();

// ==================== Hook 接口 ====================

export interface UseInputEditorOptions {
  /** 编辑器元素引用 */
  editorRef: Ref<HTMLElement | null>;
  /** 当前会话 ID 获取器 */
  getChatId?: () => string | number | undefined;
  /** 草稿变更回调（用于通知外部更新预览等） */
  onDraftChange?: (chatId: string | number, html: string) => void;
}

export function useInputEditor(options: UseInputEditorOptions) {
  const { editorRef, getChatId, onDraftChange } = options;

  // 存储粘贴的文件（用于映射 <img data-file-index>）
  const fileList = ref<File[]>([]);

  // ==================== 文件队列管理 ====================

  const pendingFiles = ref<PendingFile[]>([]);
  const MAX_FILE_COUNT = 9;
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

  /** 生成唯一 ID */
  const generateFileId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  /** 创建文件预览 URL */
  const createPreview = async (file: File): Promise<string | undefined> => {
    if (!file.type.startsWith("image/")) return undefined;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file);
    });
  };

  /** 添加文件到队列 */
  const addFiles = async (files: FileList | File[]): Promise<{ added: number; skipped: number; errors: string[] }> => {
    const errors: string[] = [];
    let added = 0;
    let skipped = 0;

    for (const file of Array.from(files)) {
      // 检查数量限制
      if (pendingFiles.value.length >= MAX_FILE_COUNT) {
        errors.push(`最多只能添加 ${MAX_FILE_COUNT} 个文件`);
        skipped++;
        continue;
      }

      // 检查大小限制
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`文件 "${file.name}" 超过 100MB 限制`);
        skipped++;
        continue;
      }

      // 检查重复
      const isDuplicate = pendingFiles.value.some(
        (f) => f.name === file.name && f.size === file.size
      );
      if (isDuplicate) {
        skipped++;
        continue;
      }

      const preview = await createPreview(file);
      pendingFiles.value.push({
        id: generateFileId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        preview,
      });
      added++;
    }

    return { added, skipped, errors };
  };

  /** 从队列移除文件 */
  const removeFile = (index: number): void => {
    if (index >= 0 && index < pendingFiles.value.length) {
      const file = pendingFiles.value[index];
      // 释放预览 URL
      if (file.preview?.startsWith("blob:")) {
        URL.revokeObjectURL(file.preview);
      }
      pendingFiles.value.splice(index, 1);
    }
  };

  /** 清空文件队列 */
  const clearFiles = (): void => {
    pendingFiles.value.forEach((f) => {
      if (f.preview?.startsWith("blob:")) {
        URL.revokeObjectURL(f.preview);
      }
    });
    pendingFiles.value = [];
  };

  /** 获取待发送的文件部分 */
  const getFileParts = (): IMessagePart[] => {
    return pendingFiles.value.map((item) => {
      const fileType = fromFileName(item.name);
      if (fileType === FileType.Image) {
        return { type: "image" as const, content: "", file: item.file };
      } else if (fileType === FileType.Video) {
        return { type: "video" as const, content: "", file: item.file };
      } else {
        return { type: "file" as const, content: "", file: item.file };
      }
    });
  };

  /** 文件队列是否为空 */
  const hasFiles = computed(() => pendingFiles.value.length > 0);

  // ==================== 光标操作 ====================

  /** 将光标移动到编辑器末尾 */
  const moveCursorToEnd = () => {
    const el = editorRef.value;
    if (!el) return;

    el.focus();
    const sel = getSelection();
    if (!sel) return;

    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.addRange(range);
  };

  /** 获取当前光标所在节点 */
  const getFocusNode = (): Node | null => {
    const sel = getSelection();
    return sel?.focusNode ?? null;
  };

  /** 获取光标在当前节点的偏移 */
  const getFocusOffset = (): number => {
    const sel = getSelection();
    return sel?.focusOffset ?? 0;
  };

  /** 获取当前选区的可视矩形位置 */
  const getSelectionRect = () => {
    const sel = getSelection();
    if (!sel || sel.rangeCount === 0) {
      const el = editorRef.value;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.bottom };
    }

    try {
      const range = sel.getRangeAt(0);
      const rects = range.getClientRects();
      if (!rects?.length) {
        const r = range.getBoundingClientRect();
        return { x: r.left || 0, y: (r.top || 0) + (r.height || 0) };
      }
      const rect = rects[0];
      return { x: rect.x || rect.left || 0, y: (rect.y || rect.top || 0) + (rect.height || 0) };
    } catch {
      return { x: 0, y: 0 };
    }
  };

  // ==================== 内容操作 ====================

  /** 插入文本到当前光标位置 */
  const insertText = (text: string) => {
    const el = editorRef.value;
    if (!el) return;

    el.focus();
    const sel = getSelection();
    if (!sel?.rangeCount) {
      el.appendChild(document.createTextNode(text));
      moveCursorToEnd();
      return;
    }

    const range = sel.getRangeAt(0);
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  /** 插入图片到编辑器 */
  const insertImage = (file: File, url: string) => {
    const idx = fileList.value.push(file) - 1;
    const sel = getSelection();
    const img = new Image();
    img.style.height = "90px";
    img.src = url;
    img.setAttribute("data-file-index", String(idx));

    if (sel?.rangeCount) {
      const range = sel.getRangeAt(0);
      range.insertNode(img);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editorRef.value?.appendChild(img);
    }
  };

  /** 清空编辑器内容（包括文件队列） */
  const clearContent = () => {
    if (editorRef.value) {
      editorRef.value.innerHTML = "";
    }
    fileList.value = [];
    clearFiles();
  };

  /** 设置编辑器内容 */
  const setContent = (html: string) => {
    if (editorRef.value) {
      editorRef.value.innerHTML = html;
    }
  };

  /** 获取编辑器内容 */
  const getContent = (): string => editorRef.value?.innerHTML ?? "";

  // ==================== 内容解析 ====================

  /** @所有人 标识常量 */
  const MENTION_ALL_ID = "all";

  /**
   * 解析编辑器内容为消息部分（包含文件队列）
   * 
   * 返回的 IMessagePart 数组中：
   * - type: "text" | "image" | "video" | "file" | "at"
   * - mentionedUserIds: 被 @ 的用户 ID 数组
   * - mentionAll: 是否 @所有人
   */
  const extractParts = (): IMessagePart[] => {
    const out: IMessagePart[] = [];
    const el = editorRef.value;

    // 先添加文件队列中的文件
    out.push(...getFileParts());

    if (!el) return out;

    let textBuf = "";
    const mentionedIds = new Set<string>();
    let hasMentionAll = false;
    const nodes = Array.from(el.childNodes);

    const isWhitespace = (ch?: string) => !!ch && /\s/.test(ch);

    const flushText = () => {
      const txt = stripZero(textBuf).trim();
      if (txt.length > 0) {
        const part: IMessagePart = {
          type: "text",
          content: txt,
          mentionedUserIds: Array.from(mentionedIds),
        };
        // 标记是否 @所有人
        if (hasMentionAll) {
          part.mentionAll = true;
        }
        out.push(part);
      }
      textBuf = "";
      mentionedIds.clear();
      // 注意：hasMentionAll 不重置，保持整条消息的状态
    };

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      if (node.nodeType === Node.TEXT_NODE) {
        textBuf += stripZero((node as Text).nodeValue || "");
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      const element = node as HTMLElement;
      const tag = element.tagName;

      // @ 标签
      if (tag === "SPAN" && element.classList.contains("active-text")) {
        if (textBuf.length > 0 && !isWhitespace(textBuf.charAt(textBuf.length - 1))) {
          textBuf += " ";
        }

        const id = element.getAttribute("data-id") || "";
        const name = element.getAttribute("data-name") || element.innerText || "";
        const isMentionAllTag = element.hasAttribute("data-mention-all") || id === MENTION_ALL_ID;

        textBuf += `@${name}`;

        // 记录 @ 信息
        if (isMentionAllTag) {
          hasMentionAll = true;
        } else if (id) {
          mentionedIds.add(id);
        }

        // 检查下一节点是否需要补空格
        const next = nodes[i + 1];
        if (next?.nodeType === Node.TEXT_NODE) {
          const nextStart = stripZero((next as Text).nodeValue || "").charAt(0);
          if (nextStart && !isWhitespace(nextStart)) textBuf += " ";
        }
        continue;
      }

      // 图片
      if (tag === "IMG") {
        flushText();
        const idxAttr = element.getAttribute("data-file-index");
        if (idxAttr != null) {
          const idx = parseInt(idxAttr, 10);
          const file = fileList.value[idx];
          if (file) {
            out.push({ type: "image", content: "", file });
          } else {
            out.push({ type: "image", content: (element as HTMLImageElement).src });
          }
        } else {
          out.push({ type: "image", content: (element as HTMLImageElement).src });
        }
        continue;
      }

      // 换行
      if (tag === "BR") {
        textBuf += "\n";
        continue;
      }

      // 其他元素：提取文本
      textBuf += stripZero(element.innerText || element.textContent || "");
    }

    // 最后的文本
    const final = stripZero(textBuf).trim();
    if (final.length) {
      const part: IMessagePart = {
        type: "text",
        content: final,
        mentionedUserIds: Array.from(mentionedIds),
      };
      if (hasMentionAll) {
        part.mentionAll = true;
      }
      out.push(part);
    }

    return out;
  };

  /**
   * 检查编辑器内容中是否包含 @所有人
   */
  const hasMentionAll = (): boolean => {
    const el = editorRef.value;
    if (!el) return false;

    const atTags = el.querySelectorAll("span.active-text");
    for (const tag of atTags) {
      if (
        tag.hasAttribute("data-mention-all") ||
        tag.getAttribute("data-id") === MENTION_ALL_ID
      ) {
        return true;
      }
    }
    return false;
  };

  /**
   * 获取编辑器中所有被 @ 的用户 ID
   */
  const getMentionedUserIds = (): string[] => {
    const el = editorRef.value;
    if (!el) return [];

    const ids: string[] = [];
    const atTags = el.querySelectorAll("span.active-text");

    for (const tag of atTags) {
      const id = tag.getAttribute("data-id");
      if (id && id !== MENTION_ALL_ID && !ids.includes(id)) {
        ids.push(id);
      }
    }

    return ids;
  };

  // ==================== 草稿管理 ====================

  /** 获取草稿 */
  const getDraft = (chatId: string | number): string | undefined => {
    return draftManager.get(chatId);
  };

  /** 设置草稿 */
  const setDraft = (chatId: string | number, html: string): void => {
    draftManager.set(chatId, html);
    onDraftChange?.(chatId, html);
  };

  /** 清除草稿 */
  const clearDraft = (chatId: string | number): void => {
    draftManager.clear(chatId);
    onDraftChange?.(chatId, "");
  };

  /** 检查是否有草稿 */
  const hasDraft = (chatId: string | number): boolean => {
    return draftManager.has(chatId);
  };

  /** 保存当前编辑器内容为草稿（防抖） */
  const saveDraftDebounced = debounceWithCancel((chatId?: string | number) => {
    const id = chatId ?? getChatId?.();
    if (!id) return;
    setDraft(id, getContent());
  }, 400);

  /** 立即保存草稿 */
  const saveDraftNow = (chatId?: string | number): void => {
    const id = chatId ?? getChatId?.();
    if (!id) return;
    setDraft(id, getContent());
  };

  /** 恢复草稿到编辑器 */
  const restoreDraft = async (chatId: string | number): Promise<void> => {
    const html = getDraft(chatId) ?? "";
    setContent(html);
    await nextTick();
    moveCursorToEnd();
  };

  /** 清理（组件卸载时调用） */
  const cleanup = (chatId?: string | number): void => {
    const id = chatId ?? getChatId?.();
    if (id) {
      saveDraftNow(id);
    }
    saveDraftDebounced.cancel();
  };

  // ==================== 文件处理 ====================

  /** 从文件列表创建消息部分 */
  const createPartsFromFiles = (files: FileList | File[]): IMessagePart[] => {
    const parts: IMessagePart[] = [];
    for (const file of Array.from(files)) {
      const fileType = fromFileName(file.name);
      if (fileType === FileType.Image) {
        parts.push({ type: "image", content: "", file });
      } else if (fileType === FileType.Video) {
        parts.push({ type: "video", content: "", file });
      } else {
        parts.push({ type: "file", content: "", file });
      }
    }
    return parts;
  };

  return {
    fileList,
    // 光标操作
    moveCursorToEnd,
    getFocusNode,
    getFocusOffset,
    getSelectionRect,
    // 内容操作
    insertText,
    insertImage,
    clearContent,
    setContent,
    getContent,
    // 解析
    extractParts,
    hasMentionAll,
    getMentionedUserIds,
    // 草稿管理
    getDraft,
    setDraft,
    clearDraft,
    hasDraft,
    saveDraftDebounced,
    saveDraftNow,
    restoreDraft,
    cleanup,
    // 文件队列管理
    pendingFiles,
    hasFiles,
    addFiles,
    removeFile,
    clearFiles,
    getFileParts,
    createPartsFromFiles,
  };
}

// ==================== 导出草稿管理器供外部使用 ====================

export { DraftManager };
