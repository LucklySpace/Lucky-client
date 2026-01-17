/**
 * @file 输入清理和安全工具
 * @description 提供输入验证和清理功能，防止XSS和注入攻击
 * @date 2025-01-15
 */

import DOMPurify from "dompurify";

// ==================== HTML 清理 ====================

/**
 * DOMPurify 配置
 */
const PURIFY_CONFIG = {
  // 允许的标签
  ALLOWED_TAGS: [
    "p",
    "br",
    "b",
    "strong",
    "i",
    "em",
    "u",
    "a",
    "span",
    "div",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "code",
    "pre",
    "img",
  ],
  // 允许的属性
  ALLOWED_ATTR: [
    "href",
    "title",
    "target",
    "rel",
    "class",
    "id",
    "style",
    "src",
    "alt",
    "data-*",
  ],
  // 允许的URI协议
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

/**
 * 清理HTML字符串，防止XSS攻击
 */
export function sanitizeHtml(html: string, options = {}): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  const config = { ...PURIFY_CONFIG, ...options };
  return DOMPurify.sanitize(html, config);
}

/**
 * 清理文本内容（移除所有HTML标签）
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  // 先移除所有HTML标签
  let cleaned = text.replace(/<[^>]*>/g, "");

  // 再转义特殊字符
  cleaned = escapeHtml(cleaned);

  return cleaned;
}

/**
 * 转义HTML特殊字符
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };

  return text.replace(/[&<>"'/]/g, (char) => escapeMap[char] || char);
}

/**
 * 反转义HTML特殊字符
 */
export function unescapeHtml(html: string): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  const unescapeMap: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#x27;": "'",
    "&#x2F;": "/",
    "&#39;": "'",
  };

  return html.replace(/&(amp|lt|gt|quot|#x27|#x2F|#39);/g, (match) => unescapeMap[match] || match);
}

// ==================== URL 清理 ====================

/**
 * 清理URL，防止JavaScript注入
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== "string") {
    return "";
  }

  // 移除危险协议
  const dangerous = ["javascript:", "data:", "vbscript:", "file:"];
  const lowerUrl = url.toLowerCase().trim();

  for (const protocol of dangerous) {
    if (lowerUrl.startsWith(protocol)) {
      return "about:blank";
    }
  }

  // 验证URL格式
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.href;
  } catch {
    return "about:blank";
  }
}

/**
 * 验证并清理href属性
 */
export function sanitizeHref(href: string): string {
  const cleanedUrl = sanitizeUrl(href);
  return cleanedUrl === "about:blank" ? "" : cleanedUrl;
}

// ==================== 属性清理 ====================

/**
 * 清理对象的所有字符串属性
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  options = {}
): T {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  const sanitized = {} as T;

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];

      if (typeof value === "string") {
        // 根据属性名选择清理方式
        if (key.toLowerCase().includes("html")) {
          sanitized[key] = sanitizeHtml(value, options) as T[Extract<keyof T, string>];
        } else {
          sanitized[key] = sanitizeText(value) as T[Extract<keyof T, string>];
        }
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = sanitizeObject(value, options);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}

/**
 * 清理数组中的所有对象
 */
export function sanitizeArray<T extends Record<string, any>>(
  arr: T[],
  options = {}
): T[] {
  if (!Array.isArray(arr)) {
    return arr;
  }

  return arr.map((item) => sanitizeObject(item, options));
}

// ==================== 输入验证 ====================

/**
 * 验证用户名
 */
export function validateUsername(username: string): boolean {
  if (!username || typeof username !== "string") {
    return false;
  }

  // 用户名规则：4-20位，字母数字下划线
  const regex = /^[a-zA-Z0-9_]{4,20}$/;
  return regex.test(username);
}

/**
 * 验证密码强度
 */
export function validatePassword(password: string): {
  valid: boolean;
  strength: "weak" | "medium" | "strong";
  issues: string[];
} {
  const issues: string[] = [];

  if (!password || typeof password !== "string") {
    return { valid: false, strength: "weak", issues: ["密码不能为空"] };
  }

  if (password.length < 6) {
    issues.push("密码长度至少6位");
  }

  if (password.length > 50) {
    issues.push("密码长度不能超过50位");
  }

  if (!/[a-z]/.test(password)) {
    issues.push("密码必须包含小写字母");
  }

  if (!/[A-Z]/.test(password)) {
    issues.push("密码必须包含大写字母");
  }

  if (!/[0-9]/.test(password)) {
    issues.push("密码必须包含数字");
  }

  // 计算强度
  let strength: "weak" | "medium" | "strong" = "weak";
  if (issues.length === 0 && password.length >= 8) {
    strength = "strong";
  } else if (issues.length <= 1) {
    strength = "medium";
  }

  return {
    valid: issues.length === 0,
    strength,
    issues,
  };
}

/**
 * 验证手机号
 */
export function validatePhone(phone: string): boolean {
  if (!phone || typeof phone !== "string") {
    return false;
  }

  const regex = /^1[3-9]\d{9}$/;
  return regex.test(phone);
}

/**
 * 验证邮箱
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== "string") {
    return false;
  }

  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// ==================== 文件名清理 ====================

/**
 * 清理文件名，防止路径遍历攻击
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== "string") {
    return "unnamed";
  }

  // 移除危险字符和路径遍历字符
  let cleaned = fileName
    .replace(/[<>:"|?*\x00-\x1f]/g, "") // 移除Windows不允许的字符
    .replace(/\.\.+/g, "") // 移除路径遍历
    .replace(/[\/\\]/g, "") // 移除路径分隔符
    .trim();

  // 限制文件名长度
  if (cleaned.length > 255) {
    cleaned = cleaned.substring(0, 255);
  }

  // 如果清空了，返回默认名称
  if (!cleaned) {
    cleaned = "unnamed";
  }

  return cleaned;
}

/**
 * 验证文件扩展名
 */
export function validateFileExtension(fileName: string, allowedExtensions: string[]): boolean {
  if (!fileName || typeof fileName !== "string") {
    return false;
  }

  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension) {
    return false;
  }

  return allowedExtensions.map((ext) => ext.toLowerCase()).includes(extension);
}

// ==================== SQL 注入防护 ====================

/**
 * 清理SQL查询参数（基本防护）
 * 注意：这只是基础防护，应该使用参数化查询
 */
export function sanitizeSqlParam(param: string): string {
  if (!param || typeof param !== "string") {
    return "";
  }

  // 移除常见的SQL注入模式
  return param
    .replace(/['"\\]/g, "") // 移除引号和反斜杠
    .replace(/--/g, "") // 移除SQL注释
    .replace(/;/g, "") // 移除语句分隔符
    .replace(/\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b/gi, "") // 移除SQL关键字
    .trim();
}

// ==================== 命令注入防护 ====================

/**
 * 清理命令行参数，防止命令注入
 */
export function sanitizeCommandLine(command: string): string {
  if (!command || typeof command !== "string") {
    return "";
  }

  // 移除危险的shell字符
  return command
    .replace(/[;&|`$(){}[\]<>]/g, "") // 移除shell特殊字符
    .replace(/\.\./g, "") // 移除路径遍历
    .trim();
}

// ==================== JSON 清理 ====================

/**
 * 安全解析JSON（防止原型污染）
 */
export function safeJsonParse<T = any>(json: string, defaultValue: T): T {
  if (!json || typeof json !== "string") {
    return defaultValue;
  }

  try {
    const parsed = JSON.parse(json);

    // 检查原型污染
    if (hasPrototypePollution(parsed)) {
      return defaultValue;
    }

    return parsed;
  } catch {
    return defaultValue;
  }
}

/**
 * 检查对象是否存在原型污染
 */
function hasPrototypePollution(obj: any): boolean {
  if (!obj || typeof obj !== "object") {
    return false;
  }

  // 检查__proto__或constructor.prototype
  if ("__proto__" in obj || ("constructor" in obj && "prototype" in obj.constructor)) {
    return true;
  }

  // 递归检查嵌套对象
  for (const key in obj) {
    if (typeof obj[key] === "object" && hasPrototypePollution(obj[key])) {
      return true;
    }
  }

  return false;
}

// ==================== 导出 ====================

export default {
  // HTML清理
  sanitizeHtml,
  sanitizeText,
  escapeHtml,
  unescapeHtml,

  // URL清理
  sanitizeUrl,
  sanitizeHref,

  // 属性清理
  sanitizeObject,
  sanitizeArray,

  // 输入验证
  validateUsername,
  validatePassword,
  validatePhone,
  validateEmail,

  // 文件名清理
  sanitizeFileName,
  validateFileExtension,

  // SQL注入防护
  sanitizeSqlParam,

  // 命令注入防护
  sanitizeCommandLine,

  // JSON清理
  safeJsonParse,
};
