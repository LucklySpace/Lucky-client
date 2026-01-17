/**
 * @file 公共工具函数
 * @description 提供常用的工具函数，避免代码重复
 * @date 2025-01-15
 */

import { ElMessage } from "element-plus";
import type { AppError } from "./ErrorTypes";

// ==================== 数据转换工具 ====================

/**
 * 安全解析JSON
 */
export function safeParseJSON<T = any>(str: string, defaultValue: T): T {
  if (!str || typeof str !== "string") {
    return defaultValue;
  }

  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

/**
 * 安全字符串化JSON
 */
export function safeStringifyJSON(obj: any, defaultValue = "{}"): string {
  if (obj === null || obj === undefined) {
    return defaultValue;
  }

  try {
    return JSON.stringify(obj);
  } catch {
    return defaultValue;
  }
}

/**
 * 深度克隆对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (obj instanceof Array) {
    return obj.map((item) => deepClone(item)) as T;
  }

  if (typeof obj === "object") {
    const clonedObj = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        (clonedObj as any)[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }

  return obj;
}

// ==================== 数据验证工具 ====================

/**
 * 检查值是否为空
 */
export function isEmpty(value: any): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }

  return false;
}

/**
 * 检查值是否非空
 */
export function isNotEmpty(value: any): boolean {
  return !isEmpty(value);
}

/**
 * 检查是否为有效URL
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    new URL(url.startsWith("http") ? url : `https://${url}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查是否为有效邮箱
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 检查是否为有效手机号（中国大陆）
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

// ==================== 数组/对象操作工具 ====================

/**
 * 数组去重
 */
export function uniqueArray<T>(arr: T[], key?: keyof T): T[] {
  if (!key) {
    return [...new Set(arr)];
  }

  const seen = new Set();
  return arr.filter((item) => {
    const k = item[key];
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
}

/**
 * 数组分组
 */
export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((result, item) => {
    const groupKey = String(item[key]);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

/**
 * 数组排序
 */
export function sortBy<T>(arr: T[], key: keyof T, order: "asc" | "desc" = "asc"): T[] {
  return [...arr].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (aVal < bVal) {
      return order === "asc" ? -1 : 1;
    }
    if (aVal > bVal) {
      return order === "asc" ? 1 : -1;
    }
    return 0;
  });
}

/**
 * 获取对象指定路径的值
 */
export function getByPath(obj: any, path: string): any {
  if (!obj || !path) {
    return obj;
  }

  const keys = path.split(".");
  let result = obj;

  for (const key of keys) {
    if (result === null || result === undefined) {
      return undefined;
    }
    result = result[key];
  }

  return result;
}

/**
 * 设置对象指定路径的值
 */
export function setByPath(obj: any, path: string, value: any): void {
  if (!obj || !path) {
    return;
  }

  const keys = path.split(".");
  const lastKey = keys.pop()!;
  let target = obj;

  for (const key of keys) {
    if (!(key in target)) {
      target[key] = {};
    }
    target = target[key];
  }

  target[lastKey] = value;
}

/**
 * 删除对象指定路径的值
 */
export function deleteByPath(obj: any, path: string): void {
  if (!obj || !path) {
    return;
  }

  const keys = path.split(".");
  const lastKey = keys.pop()!;
  let target = obj;

  for (const key of keys) {
    if (!(key in target)) {
      return;
    }
    target = target[key];
  }

  delete target[lastKey];
}

// ==================== 字符串工具 ====================

/**
 * 生成随机字符串
 */
export function randomString(length = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 截断字符串
 */
export function truncate(str: string, maxLength: number, suffix = "..."): string {
  if (!str || str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength) + suffix;
}

/**
 * 首字母大写
 */
export function capitalize(str: string): string {
  if (!str) {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * 驼峰转下划线
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * 下划线转驼峰
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// ==================== 数字工具 ====================

/**
 * 生成范围内的随机数
 */
export function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * 格式化数字（添加千位分隔符）
 */
export function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ==================== 时间工具 ====================

/**
 * 格式化时间戳
 */
export function formatTimestamp(timestamp: number | string, format = "YYYY-MM-DD HH:mm:ss"): string {
  const date = new Date(timestamp);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return format
    .replace("YYYY", String(year))
    .replace("MM", month)
    .replace("DD", day)
    .replace("HH", hours)
    .replace("mm", minutes)
    .replace("ss", seconds);
}

/**
 * 获取相对时间（如"3分钟前"）
 */
export function getRelativeTime(timestamp: number | string): string {
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const diff = now - time;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < minute) {
    return "刚刚";
  } else if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`;
  } else if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`;
  } else if (diff < week) {
    return `${Math.floor(diff / day)}天前`;
  } else if (diff < month) {
    return `${Math.floor(diff / week)}周前`;
  } else if (diff < year) {
    return `${Math.floor(diff / month)}个月前`;
  } else {
    return `${Math.floor(diff / year)}年前`;
  }
}

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== 函数工具 ====================

/**
 * 函数防抖
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * 函数节流
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastTime >= delay) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 重试函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delay?: number; backoff?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delay = 1000, backoff = 2 } = options;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      await delay(delay * Math.pow(backoff, i));
    }
  }

  throw new Error("重试失败");
}

// ==================== UI 工具 ====================

/**
 * 显示成功消息
 */
export function showSuccess(message: string, duration = 3000): void {
  ElMessage({
    message,
    type: "success",
    duration,
  });
}

/**
 * 显示错误消息
 */
export function showError(message: string, duration = 3000): void {
  ElMessage({
    message,
    type: "error",
    duration,
  });
}

/**
 * 显示警告消息
 */
export function showWarning(message: string, duration = 3000): void {
  ElMessage({
    message,
    type: "warning",
    duration,
  });
}

/**
 * 显示信息消息
 */
export function showInfo(message: string, duration = 3000): void {
  ElMessage({
    message,
    type: "info",
    duration,
  });
}

// ==================== 类型守卫 ====================

/**
 * 检查是否为AppError
 */
export function isAppError(error: any): error is AppError {
  return error && typeof error === "object" && "code" in error && "category" in error;
}

/**
 * 检查是否为空值
 */
export function isNullable(value: any): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * 检查是否为非空值
 */
export function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

// ==================== 导出 ====================

export default {
  // 数据转换
  safeParseJSON,
  safeStringifyJSON,
  deepClone,

  // 数据验证
  isEmpty,
  isNotEmpty,
  isValidUrl,
  isValidEmail,
  isValidPhone,

  // 数组/对象操作
  uniqueArray,
  groupBy,
  sortBy,
  getByPath,
  setByPath,
  deleteByPath,

  // 字符串
  randomString,
  truncate,
  capitalize,
  camelToSnake,
  snakeToCamel,

  // 数字
  randomInRange,
  formatFileSize,
  formatNumber,

  // 时间
  formatTimestamp,
  getRelativeTime,
  delay,

  // 函数
  debounce,
  throttle,
  retry,

  // UI
  showSuccess,
  showError,
  showWarning,
  showInfo,

  // 类型守卫
  isAppError,
  isNullable,
  isNonNullable,
};
