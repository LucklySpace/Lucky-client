/**
 * 日志 Hook（简化版）
 * - 控制台保留原始对象便于展开
 * - 写入 tauri plugin-log 时安全序列化
 * - 日志文件: lucky-client-{year}-{month}-{day}.log (需在 Rust 端配置)
 */

import {
  debug as tauriDebug,
  error as tauriError,
  info as tauriInfo,
  trace as tauriTrace,
  warn as tauriWarn,
  type LogOptions
} from "@tauri-apps/plugin-log";

// ===================== 类型 =====================

type LogLevel = "primary" | "success" | "trace" | "debug" | "info" | "warn" | "error";

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
    seen.delete(val); // reset for new serialize
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

// ===================== 写入 Tauri =====================

function writeTauri(level: LogLevel, msg: string, opts?: LogOptions) {
  TAURI_LOG[level]?.(msg, opts)?.catch(() => {});
}

// ===================== 核心方法 =====================

function log(args: unknown[], level: LogLevel = "info", opts?: LogOptions) {
  const color = COLORS[level];
  const [first, ...rest] = args;

  // 控制台输出（保留对象原型）
  if (typeof first === "string") {
    console.log(`%c${first}`, `color:${color};border:1px solid ${color};padding:1px 4px;border-radius:4px`, ...rest);
  } else {
    console.log(...args);
  }

  // 写入 Tauri
  writeTauri(level, toStr(args), opts);
}

function pretty(title: string, datas: unknown[], level: LogLevel = "info", opts?: LogOptions) {
  const color = COLORS[level];

  // 写入 Tauri
  writeTauri(level, `${title}: ${toStr(datas)}`, opts);

  // 控制台分组
  console.group(`%c${title}`, `background:${color};color:#fff;padding:2px 6px;border-radius:3px`);
  if (datas.length === 1 && typeof datas[0] === "object") {
    Array.isArray(datas[0]) ? console.table(datas[0]) : console.dir(datas[0]);
  } else {
    console.log(...datas);
  }
  console.groupEnd();
}

function colorLog(hint: string, contents: unknown[], level: LogLevel = "info", opts?: LogOptions) {
  const color = COLORS[level];

  // 控制台输出
  console.log(
    `%c${hint}%c`,
    `background:${color};color:#fff;padding:2px 6px;border-radius:3px 0 0 3px`,
    `border:1px solid ${color};color:${color};padding:2px 6px;border-radius:0 3px 3px 0`,
    ...contents
  );

  // 写入 Tauri
  writeTauri(level, `[${hint}] ${toStr(contents)}`, opts);
}

// ===================== 导出 =====================

export function useLogger() {
  return {
    // 基础
    log: (...args: unknown[]) => log(args, "info"),
    pretty: (title: string, ...datas: unknown[]) => pretty(title, datas, "info"),
    colorLog: (hint: string, ...contents: unknown[]) => colorLog(hint, contents, "info"),

    // 级别
    trace: (...args: unknown[]) => log(args, "trace"),
    debug: (...args: unknown[]) => log(args, "debug"),
    info: (...args: unknown[]) => log(args, "info"),
    warn: (...args: unknown[]) => log(args, "warn"),
    error: (...args: unknown[]) => log(args, "error"),

    // Pretty 变体
    prettyPrimary: (title: string, ...datas: unknown[]) => pretty(title, datas, "primary"),
    prettySuccess: (title: string, ...datas: unknown[]) => pretty(title, datas, "success"),
    prettyTrace: (title: string, ...datas: unknown[]) => pretty(title, datas, "trace"),
    prettyInfo: (title: string, ...datas: unknown[]) => pretty(title, datas, "info"),
    prettyWarn: (title: string, ...datas: unknown[]) => pretty(title, datas, "warn"),
    prettyDebug: (title: string, ...datas: unknown[]) => pretty(title, datas, "debug"),
    prettyError: (title: string, ...datas: unknown[]) => pretty(title, datas, "error")
  };
}
