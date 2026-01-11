import { MessageContentType } from "@/constants";
import type Chats from "@/database/entity/Chats";
import { useI18n } from "vue-i18n";

/* -------------------- 类型定义 -------------------- */

interface MessagePart {
  type: "text" | "at" | "image" | "video" | "audio" | string;
  content?: string;
  name?: string;
  id?: string;
}

interface MessageBody {
  text?: string;
  parts?: MessagePart[];
}

interface Message {
  messageContentType?: string | number;
  messageBody?: MessageBody;
  mentionAll?: boolean;
  mentionedUserIds?: (string | number)[];
  previewText?: string;
}

interface PreviewResult {
  html: string;
  plainText: string;
  originalText: string;
}

interface PreviewOptions {
  highlightClass?: string;
  currentUserId?: string | null;
  asHtml?: boolean;
}

interface RemoveHighlightOptions {
  highlightClass?: string;
  matchByDataAttr?: boolean;
  removeBadges?: boolean;
  returnPlainText?: boolean;
}

type TranslatorFn = (key: string, params?: Record<string, unknown>) => string;

/* -------------------- 常量 -------------------- */

const ZERO_WIDTH_RE = /\u200B/g;
const MULTI_SPACE_RE = /\s+/g;
const BADGE_TEXT_RE = /\[(?:@?所有人|有人@你|草稿)\]/g;
const DATA_MENTION_RE = /<([a-z0-9]+)([^>]*?)\sdata-mention-id=(?:"[^"]*"|'[^']*'|[^\s>]+)([^>]*)>([\s\S]*?)<\/\1>/gi;
const HTML_ESCAPE_MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/* -------------------- 主函数 -------------------- */

export function useChatInput() {
  const t = getTranslator();

  /** 获取消息类型占位符 */
  const getPlaceholder = (type: string): string => {
    const map: Record<string, string> = {
      image: t("chat.placeholder.image"),
      video: t("chat.placeholder.video"),
      audio: t("chat.placeholder.audio")
    };
    return map[type] ?? t("chat.placeholder.file");
  };

  /** 消息类型码映射到占位符 */
  const getCodePlaceholder = (code: number): string => {
    const map: Record<number, string> = {
      [MessageContentType.IMAGE.code]: t("chat.placeholder.image"),
      [MessageContentType.VIDEO.code]: t("chat.placeholder.video"),
      [MessageContentType.AUDIO.code]: t("chat.placeholder.audio"),
      [MessageContentType.FILE.code]: t("chat.placeholder.file"),
      [MessageContentType.LOCAL.code]: t("chat.placeholder.location"),
      [MessageContentType.GROUP_INVITE.code]: t("chat.placeholder.groupInvite")
    };
    return map[code] ?? t("chat.placeholder.unknown");
  };

  /** parts 转纯文本 */
  const partsToText = (parts: MessagePart[]): string =>
    parts
      .filter(Boolean)
      .map(p => {
        if (p.type === "text") return p.content ?? "";
        if (p.type === "at") return p.content ?? `@${p.name ?? ""}`;
        return getPlaceholder(p.type);
      })
      .join("");

  /** 检查是否 @所有人 */
  const hasAllMention = (parts?: MessagePart[]): boolean =>
    parts?.some(p => p && isAllMention(p)) ?? false;

  /** 收集被 @ 的用户 ID */
  const collectMentionIds = (msg: Message, parts?: MessagePart[]): string[] => {
    const ids = new Set<string>();
    msg.mentionedUserIds?.forEach(id => id != null && ids.add(String(id)));
    parts?.forEach(p => p?.type === "at" && p.id && ids.add(String(p.id)));
    return [...ids];
  };

  /** 构建消息预览 */
  function buildMessagePreview(message: Message, opts: PreviewOptions = {}): PreviewResult {
    const { highlightClass = "mention-highlight", currentUserId = null, asHtml = true } = opts;
    const code = Number(message?.messageContentType ?? 0);

    // 提示消息
    if (code === MessageContentType.TIP.code) {
      const body = message?.messageBody ?? {};
      const text = body.text ?? "";
      return {
        html: escapeHtml(text),
        plainText: text,
        originalText: text
      };
    }

    // 文本消息
    if (code === MessageContentType.TEXT.code) {
      const body = message?.messageBody ?? {};
      const parts = Array.isArray(body.parts) ? body.parts : undefined;
      const originalText = parts ? partsToText(parts) : String(body.text ?? "");

      const mentionAll = !!message?.mentionAll || hasAllMention(parts);
      const mentionedIds = collectMentionIds(message, parts);
      const mentionYou = currentUserId != null && mentionedIds.includes(String(currentUserId));

      const badges: { text: string; html: string }[] = [];
      if (mentionYou) {
        const text = t("chat.mention.you");
        badges.push({ text, html: `<span class="${escapeHtml(highlightClass)}">${escapeHtml(text)}</span>` });
      }
      if (mentionAll) {
        const text = t("chat.mention.all");
        badges.push({ text, html: `<span class="${escapeHtml(highlightClass)}">${escapeHtml(text)}</span>` });
      }

      // 正文
      let bodyHtml = "";
      let bodyPlain = "";

      if (parts?.length) {
        parts.filter(Boolean).forEach(p => {
          if (p.type === "text") {
            bodyHtml += escapeHtml(p.content ?? "");
            bodyPlain += p.content ?? "";
          } else {
            const ph = getPlaceholder(p.type);
            bodyHtml += escapeHtml(ph);
            bodyPlain += ph;
          }
        });
      } else {
        const raw = String(body.text ?? "");
        bodyHtml = escapeHtml(raw);
        bodyPlain = raw;
      }

      const prefixHtml = badges.length ? badges.map(b => b.html).join("") + " " : "";
      const prefixPlain = badges.length ? badges.map(b => b.text).join("") + " " : "";
      const htmlOut = asHtml ? prefixHtml + bodyHtml : escapeHtml(prefixPlain + bodyPlain);
      const plainOut = (prefixPlain + bodyPlain).replace(MULTI_SPACE_RE, " ").trim();

      return {
        html: htmlOut || escapeHtml(plainOut),
        plainText: plainOut,
        originalText
      };
    }

    // 非文本消息
    const orig = String(message?.messageBody?.text ?? message?.previewText ?? "");
    const mentionAll = !!message?.mentionAll;
    const mentionedIds = message?.mentionedUserIds?.map(String) ?? [];
    const mentionYou = currentUserId != null && mentionedIds.includes(String(currentUserId));

    const badgeTexts: string[] = [];
    if (mentionYou) badgeTexts.push(t("chat.mention.you"));
    if (mentionAll) badgeTexts.push(t("chat.mention.all"));

    const prefix = badgeTexts.length ? badgeTexts.join("") + " " : "";
    const placeholder = getCodePlaceholder(code);
    const html = asHtml
      ? escapeHtml(prefix) + escapeHtml(placeholder)
      : escapeHtml((prefix + placeholder).trim());

    return { html, plainText: (prefix + placeholder).trim(), originalText: orig };
  }

  /** 移除高亮标记 */
  function removeMentionHighlightsFromHtml(html: string | undefined, options?: RemoveHighlightOptions): string {
    const { highlightClass = "mention-highlight", matchByDataAttr = true, removeBadges = true, returnPlainText = false } = options ?? {};
    if (!html) return "";

    const badgeTexts = [t("chat.mention.you"), t("chat.mention.all"), t("chat.draft")].filter(Boolean);

    // 浏览器环境用 DOM
    if (typeof document !== "undefined") {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;

      // 处理高亮 span
      const selector = `span.${(highlightClass || "").replace(/([^\w-])/g, "\\$1")}`;
      wrapper.querySelectorAll(selector).forEach(node => {
        const txt = node.textContent ?? "";
        const isBadge = badgeTexts.some(b => txt.includes(b));
        if (removeBadges && isBadge) {
          node.remove();
        } else {
          node.replaceWith(document.createTextNode(txt));
        }
      });

      // 处理 data-mention-id
      if (matchByDataAttr) {
        wrapper.querySelectorAll("[data-mention-id]").forEach(node => {
          node.replaceWith(document.createTextNode(node.textContent ?? ""));
        });
      }

      // 移除残留 badge 文本
      if (removeBadges) {
        const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

        textNodes.forEach(node => {
          if (!node.nodeValue) return;
          let value = node.nodeValue;
          badgeTexts.forEach(b => { value = value.split(b).join(""); });
          node.nodeValue = value.replace(MULTI_SPACE_RE, " ").trim();
        });
      }

      return returnPlainText
        ? (wrapper.textContent ?? "").replace(MULTI_SPACE_RE, " ").trim()
        : wrapper.innerHTML;
    }

    // SSR 环境用正则
    try {
      let result = html;

      // 移除高亮 span
      const clsEscaped = (highlightClass || "").replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const reSpan = new RegExp(
        `<span[^>]*class=["'][^"']*\\b${clsEscaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
        "gi"
      );
      result = result.replace(reSpan, (_, inner) => {
        if (!inner) return "";
        const plainInner = inner.replace(/<[^>]+>/g, "");
        return removeBadges && BADGE_TEXT_RE.test(plainInner) ? "" : plainInner;
      });

      // 移除 data-mention-id 标签
      if (matchByDataAttr) {
        result = result.replace(DATA_MENTION_RE, (_, _t, _a, _b, inner) => inner || "");
      }

      // 移除残留 badge
      if (removeBadges) result = result.replace(BADGE_TEXT_RE, "");

      return returnPlainText
        ? result.replace(/<[^>]+>/g, "").replace(MULTI_SPACE_RE, " ").trim()
        : result;
    } catch {
      return html;
    }
  }

  /** 构建用户映射表 */
  function buildUserMap(members: unknown, filterIds?: string[]): Record<string, string> {
    const result: Record<string, string> = {};

    let data = members;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch { return result; }
    }

    const add = (id: string, name = "") => {
      if (!id || result[id]) return;
      if (filterIds?.length && !filterIds.includes(id)) return;
      result[id] = name;
    };

    if (Array.isArray(data)) {
      data.forEach(m => {
        if (!m) return;
        const id = String(m.userId ?? m.id ?? (typeof m === "string" ? m : ""));
        const name = String(m.name ?? m.nick ?? m.nickname ?? "");
        if (id) add(id, name);
      });
    } else if (data && typeof data === "object") {
      Object.entries(data as Record<string, unknown>).forEach(([key, v]) => {
        const obj = v as Record<string, unknown> | null;
        const id = String(obj?.userId ?? obj?.id ?? key);
        const name = String(obj?.name ?? obj?.nick ?? (typeof v === "string" ? v : ""));
        if (id) add(id, name);
      });
    }

    return result;
  }

  /** 构建草稿预览 */
  function buildDraftMessagePreview(chatId: string | number, draftHtml: string): string {
    if (!chatId && !draftHtml) return "";

    const plain = stripHtml(draftHtml);
    const LIMIT = 80;
    const snippet = plain.length > LIMIT ? `${plain.slice(0, LIMIT)}...` : plain;

    return `<span class="mention-highlight-draft">${escapeHtml(t("chat.draft"))}</span>&nbsp;${escapeHtml(snippet)}`;
  }

  /** 查找聊天索引 */
  function findChatIndex(chatList: Chats[], chatId: string | number): number {
    if (!Array.isArray(chatList) || !chatId) return -1;
    return chatList.findIndex(c => c?.chatId === chatId);
  }

  return {
    buildUserMap,
    buildMessagePreview,
    buildDraftMessagePreview,
    removeMentionHighlightsFromHtml,
    findChatIndex
  };
}


const FALLBACK_I18N: Record<string, string> = {
  "chat.mention.you": "[有人@你]",
  "chat.mention.all": "[@所有人]",
  "chat.draft": "[草稿]",
  "chat.placeholder.image": "[图片]",
  "chat.placeholder.video": "[视频]",
  "chat.placeholder.audio": "[语音]",
  "chat.placeholder.file": "[文件]",
  "chat.placeholder.location": "[位置]",
  "chat.placeholder.groupInvite": "[群聊邀请]",
  "chat.placeholder.unknown": "[未知消息类型]"
};

/* -------------------- 工具函数 -------------------- */

const escapeHtml = (s?: string): string =>
  s == null ? "" : String(s).replace(/[&<>"']/g, c => HTML_ESCAPE_MAP[c] ?? c);

const stripHtml = (html = ""): string =>
  String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(ZERO_WIDTH_RE, "")
    .replace(MULTI_SPACE_RE, " ")
    .trim();

const normalize = (v: unknown): string => String(v ?? "").toLowerCase();

const isAllMention = (p: MessagePart): boolean => {
  const id = normalize(p.id);
  const name = normalize(p.name);
  const content = normalize(p.content);
  return ["all", "@all"].includes(id) || name === "所有人" || content === "@all" || content.includes("所有人");
};

/* -------------------- 翻译函数 -------------------- */

function getTranslator(): TranslatorFn {
  try {
    const { t } = useI18n();
    if (typeof t === "function") return t;
  } catch {
    // 非 setup 环境，使用 fallback
  }
  return (key: string, params?: Record<string, unknown>) => {
    let result = FALLBACK_I18N[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.split(`{${k}}`).join(String(v));
      });
    }
    return result;
  };
}
