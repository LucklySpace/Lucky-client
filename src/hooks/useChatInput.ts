import { MessageContentType } from "@/constants";
import Chats from "@/database/entity/Chats";
import { useI18n } from "vue-i18n";

/* -------------------- 常量 / 预编译正则（模块级缓存，提升性能） -------------------- */
const ZERO_WIDTH_RE = /\u200B/g;
const MULTI_SPACE_RE = /\s+/g;
// badge 正则：匹配原来可能出现的文本占位，例如 "[有人@你]" "[@所有人]" "[草稿]"（用于正则回退）
const BADGE_TEXT_FALLBACK_RE = /\[(?:@?所有人|有人@你|草稿)\]/g;
// 匹配带 data-mention-id 标签的宽松正则（用于 SSR fallback）
const DATA_MENTION_TAG_RE =
  /<([a-zA-Z0-9]+)([^>]*?)\sdata-mention-id=(?:"[^"]*"|'[^']*'|[^\s>]+)([^>]*)>([\s\S]*?)<\/\1>/gi;

/* -------------------- 主函数工厂 -------------------- */
export function useChatInput() {
  //  TODO 临时方案
  const t = getTranslator();

  /* -------------------- 基础工具函数（高性能实现） -------------------- */

  /**
   * HTML escape（极简、高性能）
   */
  const escapeHtml = (s?: string): string =>
    s == null
      ? ""
      : String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

  /**
   * stripHtmlToPlain
   * - 把常见的 <br /> 转为换行，然后去掉其他标签
   * - 移除零宽字符并压缩空白
   */
  const stripHtmlToPlain = (html = ""): string =>
    String(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(ZERO_WIDTH_RE, "")
      .replace(MULTI_SPACE_RE, " ")
      .trim();

  /**
   * partsToOriginalText
   * - 将 parts（编辑器片段）还原为原文本（不含 html）
   * - 保持最少的分配与字符串拼接
   */
  const partsToOriginalText = (parts?: any[]): string => {
    if (!Array.isArray(parts) || parts.length === 0) return "";
    let out = "";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      switch (p.type) {
        case "text":
          out += String(p.content ?? "");
          break;
        case "at":
          out += String(p.content ?? `@${p.name ?? ""}`);
          break;
        case "image":
          out += t("chat.placeholder.image"); // i18n
          break;
        case "video":
          out += t("chat.placeholder.video");
          break;
        case "audio":
          out += t("chat.placeholder.audio");
          break;
        default:
          out += t("chat.placeholder.file");
      }
    }
    return out;
  };

  /**
   * partsHasAll
   * - 检查 parts 是否包含 @all 标记（或内容里已包含类似“所有人”）
   */
  const partsHasAll = (parts?: any[]): boolean => {
    if (!Array.isArray(parts) || parts.length === 0) return false;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      const id = String(p.id ?? "").toLowerCase();
      const name = String(p.name ?? "").toLowerCase();
      const content = String(p.content ?? "").toLowerCase();
      if (id === "all" || id === "@all" || name === "所有人" || content === "@all" || content.includes("所有人"))
        return true;
    }
    return false;
  };

  /**
   * collectMentionIds
   * - 合并 message.mentionedUserIds 与 parts 中的 at id，返回去重数组
   */
  const collectMentionIds = (message: any, parts?: any[]): string[] => {
    const set = new Set<string>();
    if (Array.isArray(message?.mentionedUserIds)) {
      for (let i = 0; i < message.mentionedUserIds.length; i++) {
        const id = message.mentionedUserIds[i];
        if (id != null) set.add(String(id));
      }
    }
    if (Array.isArray(parts)) {
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p && p.type === "at" && p.id) set.add(String(p.id));
      }
    }
    return Array.from(set);
  };

  /* -------------------- buildMessagePreview（主函数） -------------------- */

  type BuildPreviewOptions = { highlightClass?: string; currentUserId?: string | null; asHtml?: boolean };

  /**
   * buildMessagePreview
   * - 返回：{ html, plainText, originalText }
   * - 兼容 parts 格式与 messageBody.text 两种存储方式
   * - 使用 i18n 文案替代固定占位（如 [图片]）
   */
  function buildMessagePreview(message: any, opts: BuildPreviewOptions = {}) {
    const { highlightClass = "mention-highlight", currentUserId = null, asHtml = true } = opts;

    // 解析 content type code（兼容字符串/数字）
    const contentTypeRaw = message?.messageContentType;
    const code = typeof contentTypeRaw === "string" ? parseInt(contentTypeRaw, 10) : Number(contentTypeRaw || 0);

    // 文本消息特殊处理
    if (code === MessageContentType.TEXT.code) {
      const body = message?.messageBody ?? {};
      const parts: any[] | undefined = Array.isArray(body.parts) ? body.parts : undefined;

      // 原始文本（优先 parts）
      const originalText = Array.isArray(parts) ? partsToOriginalText(parts) : String(body.text ?? "");

      // mention 信息
      const mentionAll = !!message?.mentionAll || partsHasAll(parts);
      const mentionedIds = collectMentionIds(message, parts);
      const mentionYou = currentUserId != null && mentionedIds.includes(String(currentUserId));

      // badges（高亮片段）用 span 包裹（html）或纯文本（plain）
      const badgesHtml: string[] = [];
      const badgesPlain: string[] = [];
      if (mentionYou) {
        const text = t("chat.mention.you"); // e.g. "[有人@你]"
        badgesHtml.push(`<span class="${escapeHtml(highlightClass)}">${escapeHtml(text)}</span>`);
        badgesPlain.push(text);
      }
      if (mentionAll) {
        const text = t("chat.mention.all"); // e.g. "[@所有人]"
        badgesHtml.push(`<span class="${escapeHtml(highlightClass)}">${escapeHtml(text)}</span>`);
        badgesPlain.push(text);
      }

      // 构造正文片段（尽量少 new 数组）
      let bodyHtml = "";
      let bodyPlain = "";

      if (Array.isArray(parts) && parts.length) {
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (!p) continue;
          switch (p.type) {
            case "text":
              bodyHtml += escapeHtml(String(p.content ?? ""));
              bodyPlain += String(p.content ?? "");
              break;
            case "image":
              bodyHtml += escapeHtml(t("chat.placeholder.image"));
              bodyPlain += t("chat.placeholder.image");
              break;
            case "video":
              bodyHtml += escapeHtml(t("chat.placeholder.video"));
              bodyPlain += t("chat.placeholder.video");
              break;
            case "audio":
              bodyHtml += escapeHtml(t("chat.placeholder.audio"));
              bodyPlain += t("chat.placeholder.audio");
              break;
            default:
              bodyHtml += escapeHtml(t("chat.placeholder.file"));
              bodyPlain += t("chat.placeholder.file");
          }
        }
      } else {
        const raw = String(body.text ?? "");
        bodyHtml = escapeHtml(raw);
        bodyPlain = raw;
      }

      const prefixHtml = badgesHtml.length ? badgesHtml.join("") + " " : "";
      const prefixPlain = badgesPlain.length ? badgesPlain.join("") + " " : "";

      // asHtml: 返回 html 字段（带 span 的 html），否则返回纯文本为 html 字段（兼容调用方）
      const htmlOut = asHtml ? prefixHtml + bodyHtml : escapeHtml(prefixPlain + bodyPlain);
      const plainOut = (prefixPlain + bodyPlain).replace(MULTI_SPACE_RE, " ").trim();

      return {
        html: htmlOut || escapeHtml(plainOut || ""),
        plainText: plainOut || "",
        originalText: originalText || ""
      };
    }

    // 非文本类型：使用占位映射表（使用 i18n）
    const orig = String(message?.messageBody?.text ?? message?.previewText ?? "");
    const mentionAllNon = !!message?.mentionAll;
    const mentionedNon = Array.isArray(message?.mentionedUserIds) ? message.mentionedUserIds.map(String) : [];
    const mentionYouNon = currentUserId != null && mentionedNon.includes(String(currentUserId));

    const badgesNon: string[] = [];
    if (mentionYouNon) badgesNon.push(t("chat.mention.you"));
    if (mentionAllNon) badgesNon.push(t("chat.mention.all"));
    const prefixPlainNon = badgesNon.length ? badgesNon.join("") + " " : "";

    const txtMap: Record<number, string> = {
      [MessageContentType.IMAGE.code]: t("chat.placeholder.image"),
      [MessageContentType.VIDEO.code]: t("chat.placeholder.video"),
      [MessageContentType.AUDIO.code]: t("chat.placeholder.audio"),
      [MessageContentType.FILE.code]: t("chat.placeholder.file"),
      [MessageContentType.LOCAL.code]: t("chat.placeholder.location"),
      [MessageContentType.GROUP_INVITE?.code ?? -1]: t("chat.placeholder.groupInvite")
    } as any;

    const placeholder = txtMap[code] || t("chat.placeholder.unknown");
    const html = asHtml
      ? escapeHtml(prefixPlainNon) + escapeHtml(placeholder)
      : escapeHtml((prefixPlainNon + placeholder).trim());
    const plainText = (prefixPlainNon + placeholder).trim();

    return { html, plainText, originalText: orig };
  }

  /* -------------------- removeMentionHighlightsFromHtml（优化版） -------------------- */

  /**
   * removeMentionHighlightsFromHtml
   * - 尝试使用 DOM 方法（浏览器环境）做精确移除（性能好）
   * - 在 SSR / 无 DOM 环境下退回到正则处理（谨慎、但足够用于简单场景）
   *
   * options:
   *  - highlightClass?: string (默认 'mention-highlight')
   *  - matchByDataAttr?: boolean (默认 true)
   *  - removeBadges?: boolean (默认 true)
   *  - returnPlainText?: boolean (默认 false)
   */
  function removeMentionHighlightsFromHtml(
    html: string | undefined,
    options?: { highlightClass?: string; matchByDataAttr?: boolean; removeBadges?: boolean; returnPlainText?: boolean }
  ): string {
    const {
      highlightClass = "mention-highlight",
      matchByDataAttr = true,
      removeBadges = true,
      returnPlainText = false
    } = options || {};
    if (!html) return "";

    // 浏览器环境优先走 DOM（更准确）
    if (typeof document !== "undefined") {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;

      // 1) 处理 span.highlights（保留文本或删除 badge）
      const safeClass = (highlightClass || "").replace(/([^\w-])/g, "\\$1");
      const selector = `span.${safeClass}`;
      const highlightNodes = Array.from(wrapper.querySelectorAll(selector));
      const badgeFallbackText = [t("chat.mention.you"), t("chat.mention.all"), t("chat.draft")].map(escapeHtml);
      for (const node of highlightNodes) {
        const txt = node.textContent ?? "";
        const isBadge = badgeFallbackText.some(b => b && txt.includes(b));
        if (removeBadges && isBadge) {
          node.parentNode?.removeChild(node);
        } else {
          node.parentNode?.replaceChild(document.createTextNode(txt), node);
        }
      }

      // 2) 处理 data-mention-id，保留内部文本
      if (matchByDataAttr) {
        const attrNodes = Array.from(wrapper.querySelectorAll("[data-mention-id]"));
        for (const n of attrNodes) {
          const txt = n.textContent ?? "";
          n.parentNode?.replaceChild(document.createTextNode(txt), n);
        }
      }

      // 3) 移除残留 badge 文本（普通文本节点里）
      if (removeBadges) {
        const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, null);
        const toProcess: Text[] = [];
        while (walker.nextNode()) toProcess.push(walker.currentNode as Text);
        const badgeTexts = [t("chat.mention.you"), t("chat.mention.all"), t("chat.draft")].filter(Boolean);
        for (const tnode of toProcess) {
          if (!tnode.nodeValue) continue;
          let v = tnode.nodeValue;
          for (const b of badgeTexts) {
            if (!b) continue;
            v = v.split(b).join("");
          }
          v = v.replace(MULTI_SPACE_RE, " ").trim();
          tnode.nodeValue = v;
        }
      }

      return returnPlainText ? (wrapper.textContent ?? "").replace(MULTI_SPACE_RE, " ").trim() : wrapper.innerHTML;
    }

    // SSR / 无 DOM：使用正则退化处理（较弱但可用）
    try {
      let s = html;

      // 1) 移除带 highlightClass 的 span，保留内部文本，若为 badge 则直接删除
      const clsEscaped = (highlightClass || "").replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const reSpan = new RegExp(
        `<span[^>]*class=["'][^"']*\\b${clsEscaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
        "gi"
      );
      s = s.replace(reSpan, (_m, inner) => {
        if (!inner) return "";
        const plainInner = inner.replace(/<[^>]+>/g, "");
        // 如果 inner 包含任何 badge fallback 文案则删除
        if (removeBadges && BADGE_TEXT_FALLBACK_RE.test(plainInner)) return "";
        return plainInner;
      });

      // 2) 移除带 data-mention-id 的标签（保留内部内容）
      s = s.replace(DATA_MENTION_TAG_RE, (_m, _tag, _a, _b, inner) => inner || "");

      // 3) 移除残留的中文 badge（回退）
      if (removeBadges) s = s.replace(BADGE_TEXT_FALLBACK_RE, "");

      if (returnPlainText)
        return s
          .replace(/<[^>]+>/g, "")
          .replace(MULTI_SPACE_RE, " ")
          .trim();
      return s;
    } catch (e) {
      // 失败则返回原始 html（防止破坏）
      return html;
    }
  }

  /* -------------------- buildUserMap（简洁、安全） -------------------- */

  function buildUserMap(members: any, filterIds?: string[]) {
    const out: Record<string, string> = {};
    if (!members) return out;

    // 处理 JSON 字符串
    if (typeof members === "string") {
      try {
        members = JSON.parse(members);
      } catch {
        return out;
      }
    }

    const add = (id: string, name?: string) => {
      if (!id) return;
      if (filterIds && filterIds.length && !filterIds.includes(id)) return;
      if (!out[id]) out[id] = name ?? "";
    };

    if (Array.isArray(members)) {
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        if (!m) continue;
        const id = (m.userId ?? m.id ?? (typeof m === "string" ? m : undefined)) as string | undefined;
        const name = (m.name ?? m.nick ?? m.nickname ?? (typeof m === "string" ? m : undefined)) as string | undefined;
        if (id) add(String(id), name ? String(name) : "");
      }
      return out;
    }

    if (typeof members === "object") {
      for (const key of Object.keys(members)) {
        const v = members[key];
        const id = (v?.userId ?? v?.id ?? key) as string | undefined;
        const name = (v?.name ?? v?.nick ?? v) as string | undefined;
        if (id) add(String(id), name ? String(name) : "");
      }
      return out;
    }

    return out;
  }

  /* -------------------- buildDraftMessagePreview（保留草稿 badge） -------------------- */

  function buildDraftMessagePreview(chatId: string | number, draftHtml: string) {
    if (!chatId && !draftHtml) return "";
    const plain = stripHtmlToPlain(draftHtml || "");
    const LIMIT = 80;
    const snippet = plain ? (plain.length > LIMIT ? `${plain.slice(0, LIMIT)}...` : plain) : "";
    const draftLabel = escapeHtml(t("chat.draft"));
    const snippetHtml = `<span class="mention-highlight-draft">${draftLabel}</span>&nbsp;${escapeHtml(snippet)}`;
    return snippetHtml;
  }

  /* -------------------- findChatIndex -------------------- */

  function findChatIndex(chatList: Chats[], chatId: string | number) {
    if (!Array.isArray(chatList) || !chatId) return -1;
    for (let i = 0; i < chatList.length; i++) {
      const c = chatList[i];
      if (!c) continue;
      if (c.chatId === chatId || c.id === chatId) return i;
    }
    return -1;
  }

  /**
   * 安全获取 t 函数：
   * - 优先尝试 useI18n()
   * - 如果失败尝试从 global 对象拿到已挂载的 i18n 实例（某些项目把 i18n 写到 globalThis）
   * - 最后降级为本地 small-fallback map（避免抛错）
   */
  function getTranslator() {
    // 尝试 setup 的 useI18n（可能会抛错，如果未安装就会 catch）
    try {
      const { t } = useI18n();
      if (typeof t === "function") return t;
    } catch (err) {
      // ignore
    }

    // 最后回退：最小化的字典（避免 runtime 抛错）
    const FALLBACK: Record<string, string> = {
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

    return (key: string, params?: Record<string, any>) => {
      // 简单支持 params 替换（如果需要可扩展）
      const s = FALLBACK[key] ?? key;
      if (!params) return s;
      let out = s;
      for (const k of Object.keys(params)) {
        out = out.split(`{${k}}`).join(String(params[k]));
      }
      return out;
    };
  }

  /* -------------------- 导出函数（与原接口一致） -------------------- */
  return {
    buildUserMap,
    buildMessagePreview,
    buildDraftMessagePreview,
    removeMentionHighlightsFromHtml,
    findChatIndex
  };
}
