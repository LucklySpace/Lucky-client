/**
 * @file 全局错误处理器
 * @description 提供统一的错误处理机制，包括错误日志、用户通知和错误上报
 * @date 2025-01-15
 */

import { useLogger } from "@/hooks/useLogger";
import { ElMessage, ElNotification } from "element-plus";
import type { AppError } from "./ErrorTypes";

/**
 * 错误处理上下文
 */
interface HandleErrorContext {
  /** 操作名称 */
  operation?: string;
  /** 是否显示用户通知 */
  showNotification?: boolean;
  /** 是否静默处理（不记录日志） */
  silent?: boolean;
  /** 自定义通知消息 */
  customMessage?: string;
  /** 附加数据 */
  data?: Record<string, any>;
}

/**
 * 用户友好的错误消息映射
 */
const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: "网络连接失败，请检查网络设置",
  AUTH_ERROR: "登录已过期，请重新登录",
  PERMISSION_ERROR: "您没有权限执行此操作",
  VALIDATION_ERROR: "输入数据格式不正确",
  DATABASE_ERROR: "数据保存失败，请稍后重试",
  WEBSOCKET_ERROR: "连接已断开，正在重新连接...",
  FILE_ERROR: "文件操作失败，请检查文件权限",
  SYSTEM_ERROR: "系统错误，请稍后重试",
};

class ErrorHandler {
  private logger = useLogger();

  /**
   * 处理错误
   */
  handle(error: Error | AppError, context: HandleErrorContext = {}): void {
    const {
      operation,
      showNotification = true,
      silent = false,
      customMessage,
      data,
    } = context;

    // 静默模式不处理
    if (silent) return;

    // 记录错误日志
    this.logError(error, operation, data);

    // 显示用户通知
    if (showNotification) {
      this.showErrorNotification(error, customMessage);
    }
  }

  /**
   * 记录错误日志
   */
  private logError(error: Error, operation?: string, data?: Record<string, any>): void {
    const errorInfo: Record<string, any> = {
      operation,
      message: error.message,
      name: error.name,
    };

    // 添加额外信息
    if ("code" in error) {
      errorInfo.code = (error as AppError).code;
      errorInfo.category = (error as AppError).category;
      errorInfo.severity = (error as AppError).severity;
    }

    if (data) {
      errorInfo.data = data;
    }

    if (error.stack) {
      errorInfo.stack = error.stack;
    }

    // 根据错误级别选择日志方法
    if ("severity" in error) {
      const severity = (error as AppError).severity;
      switch (severity) {
        case "critical":
        case "high":
          this.logger.prettyError("ErrorHandler", `严重错误: ${operation || "未知操作"}`, errorInfo);
          break;
        case "medium":
          this.logger.prettyWarn("ErrorHandler", `警告: ${operation || "未知操作"}`, errorInfo);
          break;
        default:
          this.logger.prettyInfo("ErrorHandler", `信息: ${operation || "未知操作"}`, errorInfo);
      }
    } else {
      this.logger.prettyError("ErrorHandler", `错误: ${operation || "未知操作"}`, errorInfo);
    }
  }

  /**
   * 显示错误通知
   */
  private showErrorNotification(error: Error, customMessage?: string): void {
    const message = customMessage || this.getUserFriendlyMessage(error);
    const errorCode = "code" in error ? (error as AppError).code : undefined;

    // 根据错误严重程度选择通知方式
    if ("severity" in error && (error as AppError).severity === "critical") {
      ElNotification({
        title: "严重错误",
        message,
        type: "error",
        duration: 0, // 不自动关闭
        showClose: true,
      });
    } else {
      ElMessage({
        message,
        type: "error",
        duration: 3000,
        showClose: true,
      });
    }
  }

  /**
   * 获取用户友好的错误消息
   */
  private getUserFriendlyMessage(error: Error): string {
    if ("code" in error) {
      const errorCode = (error as AppError).code;
      return USER_FRIENDLY_MESSAGES[errorCode] || error.message;
    }

    // 根据错误名称判断
    const errorName = error.name.toLowerCase();
    if (errorName.includes("network")) {
      return USER_FRIENDLY_MESSAGES.NETWORK_ERROR;
    }
    if (errorName.includes("auth")) {
      return USER_FRIENDLY_MESSAGES.AUTH_ERROR;
    }
    if (errorName.includes("validation")) {
      return USER_FRIENDLY_MESSAGES.VALIDATION_ERROR;
    }
    if (errorName.includes("database")) {
      return USER_FRIENDLY_MESSAGES.DATABASE_ERROR;
    }

    return error.message || "操作失败，请稍后重试";
  }

  /**
   * 异步执行并处理错误
   */
  async execute<T>(
    fn: () => T | Promise<T>,
    context: HandleErrorContext = {}
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      this.handle(error as Error, context);
      return undefined;
    }
  }

  /**
   * 包装函数，自动处理错误
   */
  wrap<T extends (...args: any[]) => any>(
    fn: T,
    context?: HandleErrorContext
  ): (...args: Parameters<T>) => Promise<ReturnType<T> | undefined> {
    return async (...args: Parameters<T>) => {
      return this.execute(() => fn(...args), context);
    };
  }

  /**
   * 断言，条件不满足时抛出错误
   */
  assert(condition: any, message: string, ErrorClass = Error): asserts condition {
    if (!condition) {
      throw new ErrorClass(message);
    }
  }
}

/** 全局错误处理器实例 */
export const errorHandler = new ErrorHandler();

/** 便捷方法：处理错误 */
export const handleError = errorHandler.handle.bind(errorHandler);

/** 便捷方法：安全执行 */
export const safeExecute = errorHandler.execute.bind(errorHandler);

/** 便捷方法：包装函数 */
export const wrapSafe = errorHandler.wrap.bind(errorHandler);

/** 便捷方法：断言 */
export const assert = errorHandler.assert.bind(errorHandler);

export default errorHandler;
