import { MessageContentType } from "@/constants";
import type Chats from "@/database/entity/Chats";
import { globalI18n } from "@/i18n";
import { logger } from "@/hooks/useLogger";

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
const DRAFT_PREVIEW_LIMIT = 80;

const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
} as const;

const MENTION_ALL_IDS = ["all", "@all"] as const;
const MENTION_ALL_NAMES = ["所有人"] as const;

/* -------------------- 工具函数 -------------------- */

/** HTML 转义 */
const escapeHtml = (s?: string | null): string => {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c);
};

/** 移除 HTML 标签，保留纯文本 */
const stripHtml = (html: string = ""): string => {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(ZERO_WIDTH_RE, "")
    .replace(MULTI_SPACE_RE, " ")
    .trim();
};

/** 标准化字符串（用于比较） */
const normalize = (v: unknown): string => String(v ?? "").toLowerCase().trim();

/** 获取翻译函数 */
const getT = (): ((key: string, ...args: any[]) => string) => {
  return globalI18n.global.t as (key: string, ...args: any[]) => string;
};

type TFunction = (key: string, ...args: any[]) => string;

/** 检查是否为 @所有人 */
const isAllMention = (part: MessagePart, t: TFunction): boolean => {
  if (!part) return false;

  const id = normalize(part.id);
  const name = normalize(part.name);
  const content = normalize(part.content);
  const allMentionText = normalize(t("pages.chat.mention.all"));

  return (
    MENTION_ALL_IDS.includes(id as any) ||
    name === allMentionText ||
    MENTION_ALL_NAMES.includes(name as any) ||
    content === "@all" ||
    content.includes("所有人") ||
    content.includes(allMentionText)
  );
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

  // ==================== 占位符映射 ====================

  const placeholderMap: Readonly<Record<string, string>> = {
    image: t("pages.chat.preview.image"),
    video: t("pages.chat.preview.video"),
    audio: t("pages.chat.preview.audio")
  } as const;

  const codePlaceholderMap: Readonly<Record<number, string>> = {
    [MessageContentType.IMAGE.code]: t("pages.chat.preview.image"),
    [MessageContentType.VIDEO.code]: t("pages.chat.preview.video"),
    [MessageContentType.AUDIO.code]: t("pages.chat.preview.audio"),
    [MessageContentType.FILE.code]: t("pages.chat.preview.file"),
    [MessageContentType.LOCATION.code]: t("pages.chat.preview.location"),
    [MessageContentType.INVITE_TO_GROUP.code]: t("pages.chat.preview.groupInvite")
  } as const;

  /** 根据消息类型获取占位符文本 */
  const getPlaceholder = (type: string): string => placeholderMap[type] ?? t("pages.chat.preview.file");

  /** 根据消息类型码获取占位符文本 */
  const getCodePlaceholder = (code: number): string => codePlaceholderMap[code] ?? t("pages.chat.preview.unknown");

  // ==================== Parts 处理 ====================

  /** 将消息 parts 转换为纯文本 */
  const partsToText = (parts: MessagePart[]): string => {
    if (!Array.isArray(parts) || parts.length === 0) return "";

    return parts
      .filter((p): p is MessagePart => Boolean(p))
      .map((p) => {
        if (p.type === "text") return p.content ?? "";
        if (p.type === "at") return p.content ?? `@${p.name ?? ""}`;
        return getPlaceholder(p.type);
      })
      .join("");
  };

  /** 检查消息 parts 中是否包含 @所有人 */
  const hasAllMention = (parts?: MessagePart[]): boolean => {
    return Array.isArray(parts) && parts.length > 0 && parts.some((p) => p && isAllMention(p, t));
  };

  /** 收集消息中被 @ 的用户 ID */
  const collectMentionIds = (msg: Message, parts?: MessagePart[]): string[] => {
    const ids = new Set<string>();

    // 从消息的 mentionedUserIds 收集
    if (Array.isArray(msg.mentionedUserIds)) {
      msg.mentionedUserIds.forEach((id) => {
        if (id != null) ids.add(String(id));
      });
    }

    // 从 parts 中收集 @ 类型的 ID
    if (Array.isArray(parts)) {
      parts.forEach((p) => {
        if (p?.type === "at" && p.id) ids.add(String(p.id));
      });
    }

    return Array.from(ids);
  };

  // ==================== 徽章构建 ====================

  /** 构建徽章 HTML 和文本 */
  const buildBadge = (text: string, highlightClass: string) => ({
    text,
    html: `<span class="${escapeHtml(highlightClass)}">${escapeHtml(text)}</span>`
  });

  /** 构建提及徽章列表 */
  const buildMentionBadges = (
    mentionYou: boolean,
    mentionAll: boolean,
    highlightClass: string
  ): Array<{ text: string; html: string }> => {
    const badges: Array<{ text: string; html: string }> = [];
    if (mentionYou) badges.push(buildBadge(t("pages.chat.mention.you"), highlightClass));
    if (mentionAll) badges.push(buildBadge(t("pages.chat.mention.all"), highlightClass));
    return badges;
  };

  // ==================== 消息预览构建 ====================

  /** 构建提示消息预览 */
  const buildTipPreview = (text: string): PreviewResult => {
    const escaped = escapeHtml(text);
    return { html: escaped, plainText: text, originalText: text };
  };

  /** 构建文本消息正文 */
  const buildTextBody = (parts: MessagePart[] | undefined, fallbackText: string): { html: string; plain: string } => {
    if (!parts || parts.length === 0) {
      const escaped = escapeHtml(fallbackText);
      return { html: escaped, plain: fallbackText };
    }

    let html = "";
    let plain = "";

    parts
      .filter((p): p is MessagePart => Boolean(p))
      .forEach((p) => {
        if (p.type === "text") {
          const content = p.content ?? "";
          html += escapeHtml(content);
          plain += content;
        } else {
          const placeholder = getPlaceholder(p.type);
          html += escapeHtml(placeholder);
          plain += placeholder;
        }
      });

    return { html, plain };
  };

  /** 构建文本消息预览 */
  const buildTextMessagePreview = (
    message: Message,
    opts: PreviewOptions
  ): PreviewResult => {
    const { highlightClass = "mention-highlight", currentUserId, asHtml } = opts;
    const body = message.messageBody ?? {};
    const parts = Array.isArray(body.parts) ? body.parts : undefined;
    const originalText = parts ? partsToText(parts) : String(body.text ?? "");

    const mentionAll = Boolean(message.mentionAll) || hasAllMention(parts);
    const mentionedIds = collectMentionIds(message, parts);
    const mentionYou = currentUserId != null && mentionedIds.includes(String(currentUserId));

    const badges = buildMentionBadges(mentionYou, mentionAll, highlightClass);
    const { html: bodyHtml, plain: bodyPlain } = buildTextBody(parts, String(body.text ?? ""));

    const prefixHtml = badges.length > 0 ? badges.map((b) => b.html).join("") + " " : "";
    const prefixPlain = badges.length > 0 ? badges.map((b) => b.text).join("") + " " : "";

    const htmlOut = asHtml ? prefixHtml + bodyHtml : escapeHtml(prefixPlain + bodyPlain);
    const plainOut = (prefixPlain + bodyPlain).replace(MULTI_SPACE_RE, " ").trim();

    return {
      html: htmlOut || escapeHtml(plainOut),
      plainText: plainOut,
      originalText
    };
  };

  /** 构建非文本消息预览 */
  const buildNonTextMessagePreview = (
    message: Message,
    opts: PreviewOptions
  ): PreviewResult => {
    const { highlightClass = "mention-highlight", currentUserId, asHtml } = opts;
    const code = Number(message.messageContentType ?? 0);
    const orig = String(message.messageBody?.text ?? message.previewText ?? "");

    const mentionAll = Boolean(message.mentionAll);
    const mentionedIds = (message.mentionedUserIds ?? []).map(String);
    const mentionYou = currentUserId != null && mentionedIds.includes(String(currentUserId));

    const badges = buildMentionBadges(mentionYou, mentionAll, highlightClass);
    const prefix = badges.length > 0 ? badges.map((b) => b.text).join("") + " " : "";
    const placeholder = getCodePlaceholder(code);

    const html = asHtml
      ? escapeHtml(prefix) + escapeHtml(placeholder)
      : escapeHtml((prefix + placeholder).trim());

    return {
      html,
      plainText: (prefix + placeholder).trim(),
      originalText: orig
    };
  };

  /** 构建消息预览 */
  function buildMessagePreview(message: Message | null | undefined, opts: PreviewOptions = {}): PreviewResult {
    const { highlightClass = "mention-highlight", currentUserId = null, asHtml = true } = opts;

    if (!message) {
      return { html: "", plainText: "", originalText: "" };
    }

    const code = Number(message.messageContentType ?? 0);

    // 提示消息
    if (code === MessageContentType.TIP.code) {
      const text = String(message.messageBody?.text ?? "");
      return buildTipPreview(text);
    }

    // 文本消息
    if (code === MessageContentType.TEXT.code) {
      return buildTextMessagePreview(message, { highlightClass, currentUserId, asHtml });
    }

    // 非文本消息
    return buildNonTextMessagePreview(message, { highlightClass, currentUserId, asHtml });
  }

  // ==================== HTML 高亮移除 ====================

  /** 获取徽章文本列表 */
  const getBadgeTexts = (): string[] => [
    t("pages.chat.mention.you"),
    t("pages.chat.mention.all"),
    t("pages.chat.draft")
  ].filter(Boolean);

  /** 使用 DOM API 移除高亮（浏览器环境） */
  const removeHighlightsWithDOM = (
    html: string,
    options: Required<RemoveHighlightOptions>
  ): string => {
    const { highlightClass, matchByDataAttr, removeBadges, returnPlainText } = options;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const badgeTexts = getBadgeTexts();

    // 处理高亮 span
    const escapedClass = highlightClass.replace(/([^\w-])/g, "\\$1");
    wrapper.querySelectorAll(`span.${escapedClass}`).forEach((node) => {
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
      let node: Node | null = walker.nextNode();
      while (node) {
        textNodes.push(node as Text);
        node = walker.nextNode();
      }

      textNodes.forEach((textNode) => {
        if (!textNode.nodeValue) return;
        let value = textNode.nodeValue;
        badgeTexts.forEach((badge) => {
          value = value.split(badge).join("");
        });
        textNode.nodeValue = value.replace(MULTI_SPACE_RE, " ").trim();
      });
    }

    return returnPlainText
      ? (wrapper.textContent ?? "").replace(MULTI_SPACE_RE, " ").trim()
      : wrapper.innerHTML;
  };

  /** 使用正则表达式移除高亮（SSR 环境） */
  const removeHighlightsWithRegex = (
    html: string,
    options: Required<RemoveHighlightOptions>
  ): string => {
    const { highlightClass, matchByDataAttr, removeBadges, returnPlainText } = options;
    const badgeTexts = getBadgeTexts();
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
        const escapedBadge = badge.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(escapedBadge, "g"), "");
      });
    }

    return returnPlainText
      ? result.replace(/<[^>]+>/g, "").replace(MULTI_SPACE_RE, " ").trim()
      : result;
  };

  /** 从 HTML 中移除高亮标记 */
  function removeMentionHighlightsFromHtml(
    html: string | undefined | null,
    options?: RemoveHighlightOptions
  ): string {
    const opts: Required<RemoveHighlightOptions> = {
      highlightClass: options?.highlightClass ?? "mention-highlight",
      matchByDataAttr: options?.matchByDataAttr ?? true,
      removeBadges: options?.removeBadges ?? true,
      returnPlainText: options?.returnPlainText ?? false
    };

    if (!html) return "";

    try {
      return typeof document !== "undefined"
        ? removeHighlightsWithDOM(html, opts)
        : removeHighlightsWithRegex(html, opts);
    } catch (error) {
      logger.warn("移除高亮标记失败:", error);
      return html;
    }
  }

  // ==================== 用户映射 ====================

  /** 从成员对象提取用户信息 */
  const extractUserInfo = (member: unknown, key?: string): { id: string; name: string } | null => {
    if (!member) return null;

    if (typeof member === "string") {
      return { id: member, name: "" };
    }

    if (typeof member === "object") {
      const obj = member as Record<string, unknown>;
      const id = String(obj.userId ?? obj.id ?? key ?? "");
      const name = String(obj.name ?? obj.nick ?? obj.nickname ?? "");
      return id ? { id, name } : null;
    }

    return null;
  };

  /** 构建用户映射表 */
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

    const shouldInclude = (id: string): boolean => {
      if (!id || result[id]) return false;
      return !filterIds || filterIds.length === 0 || filterIds.includes(id);
    };

    // 处理数组格式
    if (Array.isArray(data)) {
      data.forEach((member) => {
        const info = extractUserInfo(member);
        if (info && shouldInclude(info.id)) {
          result[info.id] = info.name;
        }
      });
      return result;
    }

    // 处理对象格式
    if (data && typeof data === "object" && !Array.isArray(data)) {
      Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
        const info = extractUserInfo(value, key);
        if (info && shouldInclude(info.id)) {
          result[info.id] = info.name;
        }
      });
    }

    return result;
  }

  // ==================== 其他工具 ====================

  /** 构建草稿消息预览 */
  function buildDraftMessagePreview(chatId: string | number, draftHtml: string): string {
    if (!chatId && !draftHtml) return "";

    const plain = stripHtml(draftHtml);
    const snippet = plain.length > DRAFT_PREVIEW_LIMIT ? `${plain.slice(0, DRAFT_PREVIEW_LIMIT)}...` : plain;
    const draftText = t("pages.chat.draft");

    return `<span class="mention-highlight-draft">${escapeHtml(draftText)}</span>&nbsp;${escapeHtml(snippet)}`;
  }

  /** 在聊天列表中查找指定聊天 ID 的索引 */
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
