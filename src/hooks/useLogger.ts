/**
 * 统一日志模块
 * - 支持开关：VITE_LOG_ENABLED（false 时关闭控制台与文件输出）
 * - 支持级别：VITE_LOG_LEVEL = trace | debug | info | warn | error
 * - 控制台保留原始对象便于展开，写入 tauri plugin-log 时安全序列化
 * - 可在任意处使用：import { logger } from '@/hooks/useLogger'
 */

import {
  debug as tauriDebug,
  error as tauriError,
  info as tauriInfo,
  trace as tauriTrace,
  warn as tauriWarn,
  type LogOptions
} from "@tauri-apps/plugin-log";

// ===================== 配置（环境变量） =====================

/** 是否启用日志（生产环境建议 .env 中设为 false） */
const LOG_ENABLED = import.meta.env.VITE_LOG_ENABLED !== "false";

const VALID_LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error"];
/** 最小输出级别：只输出 >= 该级别的日志 */
const LOG_LEVEL: LogLevel = (() => {
  const v = String(import.meta.env.VITE_LOG_LEVEL || "debug").toLowerCase();
  return VALID_LEVELS.includes(v as LogLevel) ? (v as LogLevel) : "debug";
})();

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  primary: 2,
  success: 2
};

function shouldOutput(level: LogLevel): boolean {
  if (!LOG_ENABLED) return false;
  const rank = LEVEL_RANK[level] ?? 2;
  const minRank = LEVEL_RANK[LOG_LEVEL] ?? 1;
  return rank >= minRank;
}

// ===================== 类型 =====================

export type LogLevel = "primary" | "success" | "trace" | "debug" | "info" | "warn" | "error";

// ===================== 常量 =====================

const COLORS: Record<LogLevel, string> = {
  primary: "#2d8cf0",
  success: "#19be6b",
  trace: "#66ccff",
  debug: "#5c6bc0",
  info: "#2d8cf0",
  warn: "#faad14",
  error: "#f5222d"
};

const TAURI_LOG: Record<string, (msg: string, opts?: LogOptions) => Promise<void>> = {
  trace: tauriTrace,
  debug: tauriDebug,
  info: tauriInfo,
  warn: tauriWarn,
  error: tauriError,
  primary: tauriInfo,
  success: tauriInfo
};

// ===================== 序列化 =====================

const seen = new WeakSet();

function serialize(val: unknown): string {
  if (val == null) return String(val);
  if (typeof val !== "object") return String(val);
  if (val instanceof Error) return val.stack || val.message;
  try {
    seen.delete(val);
    return JSON.stringify(val, (_, v) => {
      if (v !== null && typeof v === "object") {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      if (typeof v === "bigint" || typeof v === "symbol") return v.toString();
      return v;
    });
  } catch {
    return String(val);
  }
}

const toStr = (args: unknown[]) => args.map(serialize).join(" ");

function writeTauri(level: LogLevel, msg: string, opts?: LogOptions) {
  if (!LOG_ENABLED) return;
  TAURI_LOG[level]?.(msg, opts)?.catch(() => {});
}

// ===================== 核心输出（内部） =====================

function doLog(args: unknown[], level: LogLevel = "info", opts?: LogOptions) {
  if (!shouldOutput(level)) return;
  const color = COLORS[level];
  const [first, ...rest] = args;
  if (typeof first === "string") {
    console.log(
      `%c${first}`,
      `color:${color};border:1px solid ${color};padding:1px 4px;border-radius:4px`,
      ...rest
    );
  } else {
    console.log(...args);
  }
  writeTauri(level, toStr(args), opts);
}

function doPretty(title: string, datas: unknown[], level: LogLevel = "info", opts?: LogOptions) {
  if (!shouldOutput(level)) return;
  const color = COLORS[level];
  writeTauri(level, `${title}: ${toStr(datas)}`, opts);
  console.group(`%c${title}`, `background:${color};color:#fff;padding:2px 6px;border-radius:3px`);
  if (datas.length === 1 && typeof datas[0] === "object") {
    Array.isArray(datas[0]) ? console.table(datas[0]) : console.dir(datas[0]);
  } else {
    console.log(...datas);
  }
  console.groupEnd();
}

function doColorLog(hint: string, contents: unknown[], level: LogLevel = "info", opts?: LogOptions) {
  if (!shouldOutput(level)) return;
  const color = COLORS[level];
  console.log(
    `%c${hint}%c`,
    `background:${color};color:#fff;padding:2px 6px;border-radius:3px 0 0 3px`,
    `border:1px solid ${color};color:${color};padding:2px 6px;border-radius:0 3px 3px 0`,
    ...contents
  );
  writeTauri(level, `[${hint}] ${toStr(contents)}`, opts);
}

// ===================== 对外 Logger 对象 =====================

export const logger = {
  log: (...args: unknown[]) => doLog(args, "info"),
  pretty: (title: string, ...datas: unknown[]) => doPretty(title, datas, "info"),
  colorLog: (hint: string, ...contents: unknown[]) => doColorLog(hint, contents, "info"),

  trace: (...args: unknown[]) => doLog(args, "trace"),
  debug: (...args: unknown[]) => doLog(args, "debug"),
  info: (...args: unknown[]) => doLog(args, "info"),
  warn: (...args: unknown[]) => doLog(args, "warn"),
  error: (...args: unknown[]) => doLog(args, "error"),

  prettyPrimary: (title: string, ...datas: unknown[]) => doPretty(title, datas, "primary"),
  prettySuccess: (title: string, ...datas: unknown[]) => doPretty(title, datas, "success"),
  prettyTrace: (title: string, ...datas: unknown[]) => doPretty(title, datas, "trace"),
  prettyInfo: (title: string, ...datas: unknown[]) => doPretty(title, datas, "info"),
  prettyWarn: (title: string, ...datas: unknown[]) => doPretty(title, datas, "warn"),
  prettyDebug: (title: string, ...datas: unknown[]) => doPretty(title, datas, "debug"),
  prettyError: (title: string, ...datas: unknown[]) => doPretty(title, datas, "error")
};

/** 是否已启用日志（便于业务层判断） */
export function isLogEnabled(): boolean {
  return LOG_ENABLED;
}

/** 当前最小日志级别 */
export function getLogLevel(): LogLevel {
  return LOG_LEVEL;
}

// ===================== Hook 导出 =====================

export function useLogger() {
  return logger;
}
