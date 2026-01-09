/**
 * 将字符串中的 URL 转为 <a> 标签
 * @param str 输入字符串
 * @returns 处理后的 HTML 字符串
 */
export function urlToLink(str: string): string {
  const re: RegExp =
    /((ftp|http|https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?)/g;
  return str.replace(re, function (website) {
    return (
      "<a href='" +
      website +
      "' style='text-decoration: none; cursor: pointer;' target='_blank'>" +
      website +
      "</a>"
    );
  });
}

/**
 * 去除字符串控制
 *
 * @param {String} str
 */
export function trim(str: string, type = null) {
  if (type) {
    return str.replace(/(^\s*)|(\s*$)/g, "");
  } else if (type == "l") {
    return str.replace(/(^\s*)/g, "");
  } else {
    return str.replace(/(\s*$)/g, "");
  }
}

/**
 * 隐藏用户手机号中间四位
 *
 * @param {String} phone  手机号
 */
export function hidePhone(phone: string) {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

/**
 * Url 替换超链接
 *
 * @param {String} text 文本
 */
export function textReplaceLink(text: string) {
  const re: RegExp = new RegExp("(ftp|http|https?://)?([a-zA-Z0-9-]+.)+[a-zA-Z]{2,}(/[^s]*)?", "g");
  // const re: RegExp = /((ftp|http|https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?)/g;
  return text.replace(re, function(website) {
    return (
      "<a href='" + website + "' style='text-decoration: none; cursor: pointer;' target='_blank'>" + website + "</a>"
    );
  });
}

/**
 * 文本 替换@信息
 *
 * @param {String} text 文本
 * @param {String} color 超链接颜色
 */
export function textReplaceMention(text: string, color: string = "#EE9028") {
  return text.replace(new RegExp(/@\S+/, "g"), ($0, _$1) => {
    return `<span style="color:${color};">${$0}</span>`;
  });
}

/**
 * 文本关键词高亮
 * @param keyword 关键词
 * @param text 文本
 * @param color  高亮颜色
 * @returns
 */
export function textToHighlight(keyword: string, text: string, color: string = "yellow") {
  const regExp = new RegExp(keyword, "g");
  return text.replace(regExp, `<span style="background: ${color};">${keyword}</span>`);
}

/**
 * Escape HTML for safe display
 */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 构建用于高亮的正则（去重、按长度降序、转义特殊字符）
 * 返回 null 表示没有有效 token
 */
export function buildHighlightRegex(tokensArr: string[]): RegExp | null {
  if (!Array.isArray(tokensArr)) return null;

  // 去重、trim、过滤空
  const uniq = Array.from(new Set(tokensArr.map(t => String(t).trim()).filter(Boolean)));

  if (uniq.length === 0) return null;

  // 按长度降序，避免短 token 覆盖长 token（例如： '高' 与 '高考'）
  uniq.sort((a, b) => b.length - a.length);

  // 转义 regex 特殊字符
  const escaped = uniq.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  // 使用全局和 unicode 标志，中文无需忽略大小写
  try {
    return new RegExp(`(${escaped.join("|")})`, "gu");
  } catch (e) {
    // 若正则构造失败（极端字符），退回 null
    return null;
  }
}

/**
 * 根据 tokens 高亮文本（先做 HTML 转义）
 * - text: 原始文本
 * - tokensArr: token 列表（会被去重/排序/转义）
 * - tag: 可选，高亮元素标签，默认 'mark'（也可以传 'b'、'span' 等）
 */
export function highlightTextByTokens(text: string, tokensArr: string[], tag: string = "mark"): string {
  if (!text) return escapeHtml(String(text));
  if (!Array.isArray(tokensArr) || tokensArr.length === 0) return escapeHtml(String(text));

  const html = escapeHtml(String(text));
  const rx = buildHighlightRegex(tokensArr);
  if (!rx) return html;

  // 包裹匹配项（注意：替换内容已经是 HTML 转义过的）
  return html.replace(rx, `<${tag}>$1</${tag}>`);
}

/**
 * 获取文件后缀名
 *
 * @param {String} fileName
 */
export function fileSuffix(fileName: string) {
  let ext = fileName.split(".");

  return ext[ext.length - 1];
}

/**
 * 从 payload（对象或 JSON 字符串或普通字符串）中提取指定字段的内容（返回 string 或 null）
 * - payload: 可能为对象、也可能为 JSON 字符串，或直接是纯文本字符串
 * - fieldPath: 点路径或带数组索引的路径，例如 "text", "content.text", "parts[0].text"
 *
 * 使用示例：
 *   const raw = '{"text":"hello","meta":{"lang":"zh"}}';
 *   const t = extractFieldAsString(raw, "text"); // "hello"
 *
 * 注意：该函数不会抛异常（内部捕获），若无法解析或字段不存在则返回 null。
 */
export function extractFieldAsString(payload: any, fieldPath: string | null = "text"): string | null {
  // 内部：把 payload 解析为 JS 对象（如果可能）
  function tryParse(input: any): any {
    if (input == null) return null;
    if (typeof input === "object") return input;
    if (typeof input === "string") {
      const s = input.trim();
      // 如果看起来像 JSON 对象/数组就尝试解析
      if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
        try {
          return JSON.parse(s);
        } catch {
          // 解析失败，返回原始字符串（由上层决定如何处理）
          return s;
        }
      }
      // 不是 JSON，直接返回字符串
      return s;
    }
    // 其它类型（number/boolean），直接返回原始值
    return input;
  }

  // 内部：从对象里按路径取值，支持 "a.b[0].c" 风格
  function getByPath(obj: any, path: string): any {
    if (obj == null) return null;
    if (!path) return obj;

    const segments = path.split(".");
    let cur: any = obj;

    for (const seg of segments) {
      if (cur == null) return null;

      // 支持数组索引，如 parts[0]
      const arrayMatch = seg.match(/^([^\[\]]+)\[(\d+)\]$/);
      if (arrayMatch) {
        const key = arrayMatch[1];
        const idx = Number(arrayMatch[2]);
        cur = cur[key];
        if (!Array.isArray(cur)) return null;
        cur = cur[idx];
      } else {
        // 普通属性
        cur = cur[seg];
      }
    }

    return cur;
  }

  try {
    const parsed = tryParse(payload);

    // 如果 fieldPath 为空或 null，则希望返回整体文本/字符串表示
    if (!fieldPath) {
      // 如果解析结果是对象/array，尝试返回 JSON 字符串（简洁版），否则返回字符串值
      if (parsed == null) return null;
      if (typeof parsed === "object") {
        try {
          return JSON.stringify(parsed);
        } catch {
          return String(parsed);
        }
      }
      return String(parsed);
    }

    // 如果 parsed 是字符串（未解析为对象），直接处理：
    if (typeof parsed === "string") {
      // 当请求字段不为空且 payload 是纯文本字符串（非 JSON），通常无法取到字段，返回 null
      return null;
    }

    const val = getByPath(parsed, fieldPath);
    if (val == null) return null;

    // 如果取到的是对象/数组，返回 JSON 字符串；否则返回字符串
    if (typeof val === "object") {
      try {
        return JSON.stringify(val);
      } catch {
        return String(val);
      }
    }
    return String(val);
  } catch {
    // 严谨起见：任何异常都返回 null（调用方决定降级处理）
    return null;
  }
}

/**
 * 更方便的包装：专门用于从 messageBody 中取文本字段（常用 'text'）
 * - 如果无法取到指定字段，会尝试一些常用后备字段（例如：'text','content','message'）
 * - 最终返回字符串（如果都没有则返回空串）
 */
export function extractMessageText(payload: any, fieldPath: string | null = "text"): string {
  // 优先尝试指定字段
  const primary = extractFieldAsString(payload, fieldPath);
  if (primary) return primary;

  // 尝试一些后备字段（常见命名）
  const fallbacks = ["text", "content", "message", "body"];
  for (const f of fallbacks) {
    if (f === fieldPath) continue;
    const v = extractFieldAsString(payload, f);
    if (v) return v;
  }

  // 如果 payload 本身是字符串（非 JSON），直接返回原始文本
  if (typeof payload === "string" && payload.trim()) return payload.trim();

  // 全部失败，返回空串（调用方可以选择显示占位）
  return "";
}
