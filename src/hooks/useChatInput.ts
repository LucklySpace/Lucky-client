import { MessageContentType } from "@/constants";
import type Chats from "@/database/entity/Chats";
import { globalI18n } from "@/i18n";

/* -------------------- 类型定义 -------------------- */

export interface MessagePart {
  type: "text" | "at" | "image" | "video" | "audio" | string;
  content?: string;
  name?: string;
  id?: string;
}

export interface MessageBody {
  text?: string;
  parts?: MessagePart[];
}

export interface Message {
  messageContentType?: string | number;
  messageBody?: MessageBody;
  mentionAll?: boolean;
  mentionedUserIds?: (string | number)[];
  previewText?: string;
}

export interface PreviewResult {
  html: string;
  plainText: string;
  originalText: string;
}

export interface PreviewOptions {
  highlightClass?: string;
  currentUserId?: string | null;
  asHtml?: boolean;
}

export interface RemoveHighlightOptions {
  highlightClass?: string;
  matchByDataAttr?: boolean;
  removeBadges?: boolean;
  returnPlainText?: boolean;
}

/* -------------------- 常量 -------------------- */

const ZERO_WIDTH_RE = /\u200B/g;
const MULTI_SPACE_RE = /\s+/g;
const DATA_MENTION_RE = /<([a-z0-9]+)([^>]*?)\sdata-mention-id=(?:"[^"]*"|'[^']*'|[^\s>]+)([^>]*)>([\s\S]*?)<\/\1>/gi;

const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
} as const;

/* -------------------- 工具函数 -------------------- */

/**
 * HTML 转义
 */
const escapeHtml = (s?: string | null): string => {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c);
};

/**
 * 移除 HTML 标签，保留纯文本
 */
const stripHtml = (html: string = ""): string => {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(ZERO_WIDTH_RE, "")
    .replace(MULTI_SPACE_RE, " ")
    .trim();
};

/**
 * 标准化字符串（用于比较）
 */
const normalize = (v: unknown): string => {
  return String(v ?? "").toLowerCase().trim();
};

/**
 * 获取翻译函数
 * 使用全局 i18n 实例，可在非组件环境中使用
 */
const getT = (): ((key: string, ...args: any[]) => string) => {
  // 使用类型断言确保类型正确
  return globalI18n.global.t as (key: string, ...args: any[]) => string;
};

/**
 * 翻译函数类型
 */
type TFunction = (key: string, ...args: any[]) => string;

/**
 * 检查是否为 @所有人
 */
const isAllMention = (part: MessagePart, t: TFunction): boolean => {
  if (!part) return false;

  const id = normalize(part.id);
  const name = normalize(part.name);
  const content = normalize(part.content);

  // 检查 ID
  if (["all", "@all"].includes(id)) return true;

  // 检查名称（支持多语言）
  const allMentionText = normalize(t("pages.chat.mention.all"));
  if (name === allMentionText || name === "所有人") return true;

  // 检查内容
  if (content === "@all" || content.includes("所有人") || content.includes(allMentionText)) {
    return true;
  }

  return false;
};

/* -------------------- 主函数 -------------------- */

/**
 * 聊天输入相关的工具函数
 * 提供消息预览、高亮处理、用户映射等功能
 * 
 * 注意：此函数可以在非 Vue 组件环境中使用（如 Pinia store），
 * 因为它使用全局 i18n 实例而不是 useI18n() hook
 */
export function useChatInput() {
  const t = getT();

  /**
   * 根据消息类型获取占位符文本
   */
  const getPlaceholder = (type: string): string => {
    const placeholderMap: Readonly<Record<string, string>> = {
      image: t("pages.chat.preview.image"),
      video: t("pages.chat.preview.video"),
      audio: t("pages.chat.preview.audio")
    } as const;

    return placeholderMap[type] ?? t("pages.chat.preview.file");
  };

  /**
   * 根据消息类型码获取占位符文本
   */
  const getCodePlaceholder = (code: number): string => {
    const codeMap: Readonly<Record<number, string>> = {
      [MessageContentType.IMAGE.code]: t("pages.chat.preview.image"),
      [MessageContentType.VIDEO.code]: t("pages.chat.preview.video"),
      [MessageContentType.AUDIO.code]: t("pages.chat.preview.audio"),
      [MessageContentType.FILE.code]: t("pages.chat.preview.file"),
      [MessageContentType.LOCATION.code]: t("pages.chat.preview.location"),
      [MessageContentType.GROUP_INVITE.code]: t("pages.chat.preview.groupInvite")
    } as const;

    return codeMap[code] ?? t("pages.chat.preview.unknown");
  };

  /**
   * 将消息 parts 转换为纯文本
   */
  const partsToText = (parts: MessagePart[]): string => {
    if (!Array.isArray(parts) || parts.length === 0) return "";

    return parts
      .filter((p): p is MessagePart => Boolean(p))
      .map((p) => {
        if (p.type === "text") {
          return p.content ?? "";
        }
        if (p.type === "at") {
          return p.content ?? `@${p.name ?? ""}`;
        }
        return getPlaceholder(p.type);
      })
      .join("");
  };

  /**
   * 检查消息 parts 中是否包含 @所有人
   */
  const hasAllMention = (parts?: MessagePart[]): boolean => {
    if (!Array.isArray(parts) || parts.length === 0) return false;
    return parts.some((p) => p && isAllMention(p, t));
  };

  /**
   * 收集消息中被 @ 的用户 ID
   */
  const collectMentionIds = (msg: Message, parts?: MessagePart[]): string[] => {
    const ids = new Set<string>();

    // 从消息的 mentionedUserIds 收集
    if (Array.isArray(msg.mentionedUserIds)) {
      msg.mentionedUserIds.forEach((id) => {
        if (id != null) {
          ids.add(String(id));
        }
      });
    }

    // 从 parts 中收集 @ 类型的 ID
    if (Array.isArray(parts)) {
      parts.forEach((p) => {
        if (p?.type === "at" && p.id) {
          ids.add(String(p.id));
        }
      });
    }

    return Array.from(ids);
  };

  /**
   * 构建消息预览
   */
  function buildMessagePreview(message: Message | null | undefined, opts: PreviewOptions = {}): PreviewResult {
    const { highlightClass = "mention-highlight", currentUserId = null, asHtml = true } = opts;

    if (!message) {
      return { html: "", plainText: "", originalText: "" };
    }

    const code = Number(message.messageContentType ?? 0);

    // 提示消息
    if (code === MessageContentType.TIP.code) {
      const body = message.messageBody ?? {};
      const text = String(body.text ?? "");
      return {
        html: escapeHtml(text),
        plainText: text,
        originalText: text
      };
    }

    // 文本消息
    if (code === MessageContentType.TEXT.code) {
      const body = message.messageBody ?? {};
      const parts = Array.isArray(body.parts) ? body.parts : undefined;
      const originalText = parts ? partsToText(parts) : String(body.text ?? "");

      const mentionAll = Boolean(message.mentionAll) || hasAllMention(parts);
      const mentionedIds = collectMentionIds(message, parts);
      const mentionYou = currentUserId != null && mentionedIds.includes(String(currentUserId));

      // 构建徽章
      const badges: Array<{ text: string; html: string }> = [];
      if (mentionYou) {
        const badgeText = t("pages.chat.mention.you");
        badges.push({
          text: badgeText,
          html: `<span class="${escapeHtml(highlightClass)}">${escapeHtml(badgeText)}</span>`
        });
      }
      if (mentionAll) {
        const badgeText = t("pages.chat.mention.all");
        badges.push({
          text: badgeText,
          html: `<span class="${escapeHtml(highlightClass)}">${escapeHtml(badgeText)}</span>`
        });
      }

      // 构建正文
      let bodyHtml = "";
      let bodyPlain = "";

      if (parts && parts.length > 0) {
        parts
          .filter((p): p is MessagePart => Boolean(p))
          .forEach((p) => {
            if (p.type === "text") {
              const content = p.content ?? "";
              bodyHtml += escapeHtml(content);
              bodyPlain += content;
            } else {
              const placeholder = getPlaceholder(p.type);
              bodyHtml += escapeHtml(placeholder);
              bodyPlain += placeholder;
            }
          });
      } else {
        const raw = String(body.text ?? "");
        bodyHtml = escapeHtml(raw);
        bodyPlain = raw;
      }

      const prefixHtml = badges.length > 0 ? badges.map((b) => b.html).join("") + " " : "";
      const prefixPlain = badges.length > 0 ? badges.map((b) => b.text).join("") + " " : "";
      const htmlOut = asHtml ? prefixHtml + bodyHtml : escapeHtml(prefixPlain + bodyPlain);
      const plainOut = (prefixPlain + bodyPlain).replace(MULTI_SPACE_RE, " ").trim();

      return {
        html: htmlOut || escapeHtml(plainOut),
        plainText: plainOut,
        originalText
      };
    }

    // 非文本消息（图片、视频、文件等）
    const orig = String(message.messageBody?.text ?? message.previewText ?? "");
    const mentionAll = Boolean(message.mentionAll);
    const mentionedIds = (message.mentionedUserIds ?? []).map(String);
    const mentionYou = currentUserId != null && mentionedIds.includes(String(currentUserId));

    const badgeTexts: string[] = [];
    if (mentionYou) {
      badgeTexts.push(t("pages.chat.mention.you"));
    }
    if (mentionAll) {
      badgeTexts.push(t("pages.chat.mention.all"));
    }

    const prefix = badgeTexts.length > 0 ? badgeTexts.join("") + " " : "";
    const placeholder = getCodePlaceholder(code);
    const html = asHtml
      ? escapeHtml(prefix) + escapeHtml(placeholder)
      : escapeHtml((prefix + placeholder).trim());

    return {
      html,
      plainText: (prefix + placeholder).trim(),
      originalText: orig
    };
  }

  /**
   * 从 HTML 中移除高亮标记
   */
  function removeMentionHighlightsFromHtml(html: string | undefined | null, options?: RemoveHighlightOptions): string {
    const {
      highlightClass = "mention-highlight",
      matchByDataAttr = true,
      removeBadges = true,
      returnPlainText = false
    } = options ?? {};

    if (!html) return "";

    // 获取所有可能的徽章文本（支持多语言）
    const badgeTexts = [
      t("pages.chat.mention.you"),
      t("pages.chat.mention.all"),
      t("pages.chat.draft")
    ].filter(Boolean);

    // 浏览器环境使用 DOM API
    if (typeof document !== "undefined") {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;

      // 处理高亮 span
      const escapedClass = highlightClass.replace(/([^\w-])/g, "\\$1");
      const selector = `span.${escapedClass}`;
      wrapper.querySelectorAll(selector).forEach((node) => {
        const text = node.textContent ?? "";
        const isBadge = badgeTexts.some((badge) => text.includes(badge));

        if (removeBadges && isBadge) {
          node.remove();
        } else {
          node.replaceWith(document.createTextNode(text));
        }
      });

      // 处理 data-mention-id 属性
      if (matchByDataAttr) {
        wrapper.querySelectorAll("[data-mention-id]").forEach((node) => {
          node.replaceWith(document.createTextNode(node.textContent ?? ""));
        });
      }

      // 移除残留的徽章文本
      if (removeBadges && badgeTexts.length > 0) {
        const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        let currentNode: Node | null = walker.nextNode();
        while (currentNode) {
          textNodes.push(currentNode as Text);
          currentNode = walker.nextNode();
        }

        textNodes.forEach((node) => {
          if (!node.nodeValue) return;
          let value = node.nodeValue;
          badgeTexts.forEach((badge) => {
            value = value.split(badge).join("");
          });
          node.nodeValue = value.replace(MULTI_SPACE_RE, " ").trim();
        });
      }

      return returnPlainText
        ? (wrapper.textContent ?? "").replace(MULTI_SPACE_RE, " ").trim()
        : wrapper.innerHTML;
    }

    // SSR 环境使用正则表达式
    try {
      let result = html;

      // 移除高亮 span
      const escapedClass = highlightClass.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const spanRegex = new RegExp(
        `<span[^>]*class=["'][^"']*\\b${escapedClass}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
        "gi"
      );

      result = result.replace(spanRegex, (_, inner) => {
        if (!inner) return "";
        const plainInner = inner.replace(/<[^>]+>/g, "");
        const isBadge = badgeTexts.some((badge) => plainInner.includes(badge));
        return removeBadges && isBadge ? "" : plainInner;
      });

      // 移除 data-mention-id 标签
      if (matchByDataAttr) {
        result = result.replace(DATA_MENTION_RE, (_, _tag, _before, _after, inner) => inner || "");
      }

      // 移除残留的徽章文本
      if (removeBadges && badgeTexts.length > 0) {
        badgeTexts.forEach((badge) => {
          result = result.replace(new RegExp(badge.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");
        });
      }

      return returnPlainText
        ? result.replace(/<[^>]+>/g, "").replace(MULTI_SPACE_RE, " ").trim()
        : result;
    } catch (error) {
      console.warn("移除高亮标记失败:", error);
      return html;
    }
  }

  /**
   * 构建用户映射表
   * @param members 成员数据（数组、对象或 JSON 字符串）
   * @param filterIds 可选的用户 ID 过滤列表
   */
  function buildUserMap(members: unknown, filterIds?: string[]): Record<string, string> {
    const result: Record<string, string> = {};

    // 解析输入数据
    let data: unknown = members;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return result;
      }
    }

    /**
     * 添加用户到映射表
     */
    const addUser = (id: string, name: string = ""): void => {
      if (!id || result[id]) return;
      if (filterIds && filterIds.length > 0 && !filterIds.includes(id)) return;
      result[id] = name;
    };

    // 处理数组格式
    if (Array.isArray(data)) {
      data.forEach((member) => {
        if (!member) return;
        const id = String(member.userId ?? member.id ?? (typeof member === "string" ? member : ""));
        const name = String(member.name ?? member.nick ?? member.nickname ?? "");
        if (id) {
          addUser(id, name);
        }
      });
      return result;
    }

    // 处理对象格式
    if (data && typeof data === "object" && !Array.isArray(data)) {
      Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
        const obj = value as Record<string, unknown> | null;
        const id = String(obj?.userId ?? obj?.id ?? key);
        const name = String(obj?.name ?? obj?.nick ?? (typeof value === "string" ? value : ""));
        if (id) {
          addUser(id, name);
        }
      });
    }

    return result;
  }

  /**
   * 构建草稿消息预览
   */
  function buildDraftMessagePreview(chatId: string | number, draftHtml: string): string {
    if (!chatId && !draftHtml) return "";

    const plain = stripHtml(draftHtml);
    const LIMIT = 80;
    const snippet = plain.length > LIMIT ? `${plain.slice(0, LIMIT)}...` : plain;
    const draftText = t("pages.chat.draft");

    return `<span class="mention-highlight-draft">${escapeHtml(draftText)}</span>&nbsp;${escapeHtml(snippet)}`;
  }

  /**
   * 在聊天列表中查找指定聊天 ID 的索引
   */
  function findChatIndex(chatList: Chats[], chatId: string | number): number {
    if (!Array.isArray(chatList) || !chatId) return -1;
    return chatList.findIndex((chat) => chat?.chatId === chatId);
  }

  return {
    buildUserMap,
    buildMessagePreview,
    buildDraftMessagePreview,
    removeMentionHighlightsFromHtml,
    findChatIndex
  };
}
