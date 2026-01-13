/**
 * 字符串工具函数
 */

// ===================== URL 处理 =====================

/**
 * URL 匹配正则
 * 匹配格式：协议://域名/路径?查询#锚点
 * 支持：http, https, ftp, ftps 或无协议
 */
const URL_REGEX = /(?:(?:https?|ftps?):\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?::\d{1,5})?(?:\/[^\s<>'"]*)?/gi;

/**
 * 判断是否为有效的 URL 格式
 */
export function isValidUrl(str: string): boolean {
  if (!str || typeof str !== "string") return false;
  try {
    const testUrl = str.includes("://") ? str : `https://${str}`;
    new URL(testUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * 将字符串中的 URL 转为 <a> 标签（安全版本）
 * @param str 输入字符串（已经过 HTML 转义）
 * @returns 处理后的 HTML 字符串
 */
export function urlToLink(str: string): string {
  if (!str || typeof str !== "string") return "";

  return str.replace(URL_REGEX, (match) => {
    // 验证匹配是否为有效 URL
    if (!isValidUrl(match)) return match;

    // 转义 URL 中的特殊字符用于 href 属性
    const safeHref = encodeURI(match.includes("://") ? match : `https://${match}`);

    return `<a href="${safeHref}" data-url="${escapeHtml(match)}" class="text-link" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });
}

// ===================== 字符串清理 =====================

type TrimType = "both" | "left" | "right";

/**
 * 去除字符串空白
 * @param str 输入字符串
 * @param type 清理类型：'both' 两端（默认）, 'left' 左侧, 'right' 右侧
 */
export function trim(str: string, type: TrimType = "both"): string {
  if (!str || typeof str !== "string") return "";

  switch (type) {
    case "left":
      return str.replace(/^\s+/, "");
    case "right":
      return str.replace(/\s+$/, "");
    case "both":
    default:
      return str.trim();
  }
}

// ===================== 手机号处理 =====================

/**
 * 隐藏用户手机号中间四位
 * @param phone 手机号
 */
export function hidePhone(phone: string): string {
  if (!phone || typeof phone !== "string") return "";
  return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

// ===================== 文本高亮 =====================

/**
 * 文本 替换@信息
 * @param text 文本
 * @param color 高亮颜色
 */
export function textReplaceMention(text: string, color = "#EE9028"): string {
  if (!text || typeof text !== "string") return "";
  return text.replace(/@[\w\u4e00-\u9fa5]+/g, (match) => {
    return `<span style="color:${color};">${match}</span>`;
  });
}

/**
 * 文本关键词高亮
 * @param keyword 关键词
 * @param text 文本
 * @param color 高亮颜色
 */
export function textToHighlight(keyword: string, text: string, color = "yellow"): string {
  if (!text || typeof text !== "string") return "";
  if (!keyword) return escapeHtml(text);

  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regExp = new RegExp(escapedKeyword, "g");
  return escapeHtml(text).replace(regExp, `<span style="background:${color};">${escapeHtml(keyword)}</span>`);
}

// ===================== HTML 转义 =====================

/**
 * HTML 转义，防止 XSS
 */
export function escapeHtml(s: string): string {
  if (!s || typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===================== 高亮工具 =====================

/**
 * 构建用于高亮的正则（去重、按长度降序、转义特殊字符）
 * 返回 null 表示没有有效 token
 */
export function buildHighlightRegex(tokensArr: string[]): RegExp | null {
  if (!Array.isArray(tokensArr)) return null;

  // 去重、trim、过滤空
  const uniq = [...new Set(tokensArr.map((t) => String(t).trim()).filter(Boolean))];
  if (uniq.length === 0) return null;

  // 按长度降序，避免短 token 覆盖长 token
  uniq.sort((a, b) => b.length - a.length);

  // 转义 regex 特殊字符
  const escaped = uniq.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  try {
    return new RegExp(`(${escaped.join("|")})`, "gu");
  } catch {
    return null;
  }
}

/**
 * 根据 tokens 高亮文本（先做 HTML 转义）
 * @param text 原始文本
 * @param tokensArr token 列表
 * @param tag 高亮元素标签，默认 'mark'
 */
export function highlightTextByTokens(text: string, tokensArr: string[], tag = "mark"): string {
  const safeText = escapeHtml(String(text ?? ""));
  if (!safeText || !Array.isArray(tokensArr) || tokensArr.length === 0) {
    return safeText;
  }

  const rx = buildHighlightRegex(tokensArr);
  if (!rx) return safeText;

  return safeText.replace(rx, `<${tag}>$1</${tag}>`);
}

// ===================== 文件工具 =====================

/**
 * 获取文件后缀名
 * @param fileName 文件名
 */
export function fileSuffix(fileName: string): string {
  if (!fileName || typeof fileName !== "string") return "";
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

// ===================== 消息内容提取 =====================

/**
 * 从 payload（对象或 JSON 字符串）中提取指定字段
 * @param payload 输入数据
 * @param fieldPath 字段路径，如 "text", "content.text", "parts[0].text"
 */
export function extractFieldAsString(payload: unknown, fieldPath: string | null = "text"): string | null {
  // 尝试解析为对象
  const parsed = tryParseJson(payload);
  if (parsed == null) return null;

  // 无路径时返回整体字符串表示
  if (!fieldPath) {
    return typeof parsed === "object" ? safeStringify(parsed) : String(parsed);
  }

  // parsed 是字符串且需要字段提取，无法继续
  if (typeof parsed === "string") return null;

  const val = getByPath(parsed, fieldPath);
  if (val == null) return null;

  return typeof val === "object" ? safeStringify(val) : String(val);
}

/**
 * 从 messageBody 中提取文本字段
 * @param payload 输入数据
 * @param fieldPath 优先字段路径
 */
export function extractMessageText(payload: unknown, fieldPath: string | null = "text"): string {
  // 优先尝试指定字段
  const primary = extractFieldAsString(payload, fieldPath);
  if (primary) return primary;

  // 尝试后备字段
  const fallbacks = ["text", "content", "message", "body"];
  for (const f of fallbacks) {
    if (f === fieldPath) continue;
    const v = extractFieldAsString(payload, f);
    if (v) return v;
  }

  // payload 是字符串则直接返回
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  return "";
}

// ===================== 内部工具函数 =====================

/**
 * 尝试将输入解析为 JS 对象
 */
function tryParseJson(input: unknown): unknown {
  if (input == null) return null;
  if (typeof input === "object") return input;
  if (typeof input !== "string") return input;

  const s = input.trim();
  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }
  return s;
}

/**
 * 按路径获取对象属性值
 * 支持 "a.b[0].c" 格式
 */
function getByPath(obj: unknown, path: string): unknown {
  if (obj == null || !path) return obj;

  const segments = path.split(".");
  let cur: unknown = obj;

  for (const seg of segments) {
    if (cur == null || typeof cur !== "object") return null;

    // 支持数组索引，如 parts[0]
    const arrayMatch = seg.match(/^([^\[\]]+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, idx] = arrayMatch;
      cur = (cur as Record<string, unknown>)[key];
      if (!Array.isArray(cur)) return null;
      cur = cur[Number(idx)];
    } else {
      cur = (cur as Record<string, unknown>)[seg];
    }
  }

  return cur;
}

/**
 * 安全的 JSON 序列化
 */
function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}
