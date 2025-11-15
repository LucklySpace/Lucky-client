import {
  debug as tauriDebug,
  error as tauriError,
  info as tauriInfo,
  type LogOptions,
  trace as tauriTrace,
  warn as tauriWarn
} from "@tauri-apps/plugin-log";
import { useIdleTaskExecutor } from "./useIdleTaskExecutor";

const { addTask } = useIdleTaskExecutor({ maxWorkTimePerIdle: 12 });

/**
 * 日志 Hook 封装（支持任意参数）
 * - 在控制台上保留 JS 对象原型，便于展开（console.log(obj)）
 * - 写入 tauri plugin-log 时将参数安全序列化为一条字符串，处理循环引用与 Error
 */
export function useLogger() {
  /**
   * 通用日志方法（支持任意数量参数）
   * @param args 要打印的任意参数（支持 string | object | Error | number ...）
   * @param level 日志等级
   * @param background 是否用背景色样式（默认 false）
   * @param options tauri plugin-log options
   */
  const log = async (args: unknown[], level: LogType = "info", background = false, options?: LogOptions) => {
    // 在控制台里输出（保留原始对象以便展开）
    // 当包含样式时，把第一个参数格式化为带样式的字符串，其余参数原样传入
    const style = getStyle(level, background);
    if (typeof args[0] === "string") {
      // 使用样式输出第一个字符串，后面参数原样输出
      // eslint-disable-next-line no-console
      console.log(`%c ${args[0]}`, style, ...args.slice(1));
    } else {
      // 如果第一个不是字符串，直接打印所有原始参数
      // eslint-disable-next-line no-console
      console.log(...args);
    }

    addTask(
      () => {
        writeToTauriLog(level, safeSerializeArgs(args), options);
      },
      { priority: 1, timeout: 10000 }
    );
  };

  /**
   * 分组打印复杂对象（title 和任意数量 data）
   * @param title 标题
   * @param datas 要打印的数据项（可以是多个）
   * @param level 日志等级
   * @param options tauri log options
   */
  const pretty = async (title: string, datas: unknown[], level: LogType = "info", options?: LogOptions) => {
    // 写到 tauri
    await writeToTauriLog(level, `${title}: ${safeSerializeArgs(datas)}`, options);

    const color = COLOR_MAP[level] ?? COLOR_MAP.info;
    // 控制台分组显示，保留原始 object 方便展开
    // eslint-disable-next-line no-console
    console.group(`%c ${title}`, `background:${color};color:#fff;padding:2px 6px;border-radius:3px;`);
    if (datas.length === 1 && typeof datas[0] === "object") {
      // 如果只有一个对象，使用 dir/table 更友好
      if (Array.isArray(datas[0])) {
        // eslint-disable-next-line no-console
        console.table(datas[0] as any);
      } else {
        // eslint-disable-next-line no-console
        console.dir(datas[0] as any);
      }
    } else {
      // 多个参数逐个输出，保留原型
      // eslint-disable-next-line no-console
      console.log(...datas);
    }
    // eslint-disable-next-line no-console
    console.groupEnd();
  };

  /**
   * 带前缀彩色提示的打印（hint 为前缀，content 可为多个参数）
   * @param hint 前缀文本
   * @param contents 任意数量的内容参数
   * @param level 日志级别
   * @param options tauri log options
   */
  const colorLog = async (hint: string, contents: unknown[], level: LogType = "info", options?: LogOptions) => {
    const color = COLOR_MAP[level] ?? COLOR_MAP.info;
    const hintStyle = `
      background: ${color};
      color: white;
      border-radius: 3px 0 0 3px;
      padding: 2px 6px;
    `;
    const contentStyle = `
      border: 1px solid ${color};
      color: ${color};
      padding: 2px 6px;
      border-radius: 0 3px 3px 0;
    `;
    // 控制台保留原始对象
    // eslint-disable-next-line no-console
    console.log(`%c${hint}%c`, hintStyle, contentStyle, ...contents);

    addTask(
      () => {
        // 写到 tauri
        writeToTauriLog(level, `[${hint}] ${safeSerializeArgs(contents)}`, options);
      },
      { priority: 1, timeout: 10000 }
    );
  };

  // 对外 API：接收可变参数
  return {
    log: async (...args: unknown[]) => log(args, "info", false),
    pretty: async (title: string, ...datas: unknown[]) => pretty(title, datas, "info"),
    colorLog: async (hint: string, ...contents: unknown[]) => colorLog(hint, contents, "info"),

    trace: async (...args: unknown[]) => log(args, "trace"),
    debug: async (...args: unknown[]) => log(args, "debug"),
    info: async (...args: unknown[]) => log(args, "info"),
    warn: async (...args: unknown[]) => log(args, "warn"),
    error: async (...args: unknown[]) => log(args, "error"),

    prettyPrimary: async (title: string, ...datas: unknown[]) => pretty(title, datas, "primary"),
    prettySuccess: async (title: string, ...datas: unknown[]) => pretty(title, datas, "success"),
    prettyTrace: async (title: string, ...datas: unknown[]) => pretty(title, datas, "trace"),
    prettyInfo: async (title: string, ...datas: unknown[]) => pretty(title, datas, "info"),
    prettyWarn: async (title: string, ...datas: unknown[]) => pretty(title, datas, "warn"),
    prettyDebug: async (title: string, ...datas: unknown[]) => pretty(title, datas, "debug"),
    prettyError: async (title: string, ...datas: unknown[]) => pretty(title, datas, "error")
  };
}

/* ---------------------- 辅助函数和类型 ---------------------- */

/** 日志等级类型 */
type LogType = "primary" | "success" | "trace" | "debug" | "info" | "warn" | "error";

/** 颜色映射 */
const COLOR_MAP: Record<LogType, string> = {
  primary: "#2d8cf0",
  success: "#19be6b",
  trace: "#66ccff",
  debug: "#5c6bc0",
  info: "#2d8cf0",
  warn: "#faad14",
  error: "#f5222d"
};

/** 仅在开发模式并且在浏览器环境下才写入 tauri log */
const shouldWrite = import.meta.env.MODE === "development" && typeof window !== "undefined";

/**
 * 将任意参数数组安全序列化为单条字符串（用于写入 tauri plugin-log）
 * - 处理 Error 对象（优先使用 stack）
 * - 处理循环引用（使用 WeakSet）
 * - 对象转换失败时降级为 toString()
 */
function safeSerializeArgs(args: unknown[]): string {
  const parts = args.map(a => safeSerialize(a));
  return parts.join(" ");
}

/** 单个值的安全序列化 */
function safeSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) {
    return value.stack || value.message || String(value);
  }
  try {
    return JSON.stringify(value, getCircularReplacer(), 2);
  } catch {
    // 兜底
    try {
      return String(value);
    } catch {
      return "[unserializable]";
    }
  }
}

/** JSON.stringify 循环引用处理器 */
function getCircularReplacer() {
  const seen = new WeakSet();
  return function(_: any, value: any) {
    if (value !== null && typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    // 转换 BigInt 等不可序列化项
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "symbol") return value.toString();
    return value;
  };
}

/**
 * 将日志写入 Tauri plugin-log（只在 shouldWrite 时生效）
 * @param level 日志等级
 * @param message 合并后的单行消息
 * @param options tauri log options
 */
async function writeToTauriLog(level: LogType, message: string, options?: LogOptions) {
  if (!shouldWrite) return;
  try {
    switch (level) {
      case "trace":
        return await tauriTrace(message, options);
      case "debug":
        return await tauriDebug(message, options);
      case "info":
        return await tauriInfo(message, options);
      case "warn":
        return await tauriWarn(message, options);
      case "error":
        return await tauriError(message, options);
      default:
        return await tauriInfo(message, options);
    }
  } catch (e) {
    // 写入 Tauri 日志失败不抛出（仅在开发时使用）
    // eslint-disable-next-line no-console
    console.warn("writeToTauriLog error", e);
  }
}

/** 根据等级返回控制台样式 */
function getStyle(level: LogType, background = false) {
  const color = COLOR_MAP[level] ?? COLOR_MAP.info;
  return background
    ? `background:${color};color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;`
    : `color:${color};padding:1px 4px;border:1px solid ${color};border-radius:4px;`;
}
