/**
 * @file 统一错误类型定义
 * @description 定义应用中所有错误类型，提供清晰的错误分类和处理机制
 * @date 2025-01-15
 */

/**
 * 错误严重级别
 */
export enum ErrorSeverity {
  // 低严重度（如非核心功能警告）
  LOW = "low",
  // 中严重度（如数据校验失败）
  MEDIUM = "medium",
  // 高严重度（如接口调用失败）
  HIGH = "high",
  // 致命错误（如系统崩溃）
  CRITICAL = "critical",
}

/**
 * 错误类别
 */
export enum ErrorCategory {
  // 网络错误
  NETWORK = "network",
  // 鉴权错误
  AUTH = "auth",
  // 校验错误
  VALIDATION = "validation",
  // 数据库错误
  DATABASE = "database",
  // 业务逻辑错误
  BUSINESS = "business",
  // 系统操作
  SYSTEM = "system",
  // 未知错误
  UNKNOWN = "unknown",
}

/**
 * 全局错误捕获配置
 */
export interface ErrorCaptureConfig {
  // 捕获Vue内部错误
  enableVueError: boolean;
  // 捕获Promise错误
  enablePromiseError: boolean;
  // 捕获全局脚本错误
  enableScriptError: boolean;

  // 可考虑增加对TauriHttp的选项
  // TODO ...
}

/**
 * 基础应用错误类
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly category: ErrorCategory = ErrorCategory.UNKNOWN,
    public readonly severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    public readonly details?: Record<string, any>,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * 转换为JSON对象（用于日志和传输）
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      details: this.details,
      stack: this.stack,
      originalError: this.originalError?.message,
    };
  }
}

/**
 * 网络错误
 */
export class NetworkError extends AppError {
  constructor(
    message: string = "网络请求失败",
    details?: Record<string, any>,
    originalError?: Error
  ) {
    super(message, "NETWORK_ERROR", ErrorCategory.NETWORK, ErrorSeverity.MEDIUM, details, originalError);
    this.name = "NetworkError";
  }
}

/**
 * 认证错误
 */
export class AuthError extends AppError {
  constructor(
    message: string = "认证失败",
    details?: Record<string, any>,
    originalError?: Error
  ) {
    super(message, "AUTH_ERROR", ErrorCategory.AUTH, ErrorSeverity.HIGH, details, originalError);
    this.name = "AuthError";
  }
}

/**
 * 权限错误
 */
export class PermissionError extends AppError {
  constructor(
    message: string = "权限不足",
    details?: Record<string, any>
  ) {
    super(message, "PERMISSION_ERROR", ErrorCategory.AUTH, ErrorSeverity.HIGH, details);
    this.name = "PermissionError";
  }
}

/**
 * 验证错误
 */
export class ValidationError extends AppError {
  constructor(
    message: string = "数据验证失败",
    public readonly field?: string,
    details?: Record<string, any>
  ) {
    super(message, "VALIDATION_ERROR", ErrorCategory.VALIDATION, ErrorSeverity.LOW, details);
    this.name = "ValidationError";
  }
}

/**
 * 数据库错误
 */
export class DatabaseError extends AppError {
  constructor(
    message: string = "数据库操作失败",
    details?: Record<string, any>,
    originalError?: Error
  ) {
    super(message, "DATABASE_ERROR", ErrorCategory.DATABASE, ErrorSeverity.HIGH, details, originalError);
    this.name = "DatabaseError";
  }
}

/**
 * 业务逻辑错误
 */
export class BusinessError extends AppError {
  constructor(
    message: string,
    code: string = "BUSINESS_ERROR",
    details?: Record<string, any>
  ) {
    super(message, code, ErrorCategory.BUSINESS, ErrorSeverity.MEDIUM, details);
    this.name = "BusinessError";
  }
}

/**
 * 系统错误
 */
export class SystemError extends AppError {
  constructor(
    message: string = "系统错误",
    details?: Record<string, any>,
    originalError?: Error
  ) {
    super(message, "SYSTEM_ERROR", ErrorCategory.SYSTEM, ErrorSeverity.CRITICAL, details, originalError);
    this.name = "SystemError";
  }
}

/**
 * WebSocket 错误
 */
export class WebSocketError extends AppError {
  constructor(
    message: string = "WebSocket 连接错误",
    details?: Record<string, any>,
    originalError?: Error
  ) {
    super(message, "WEBSOCKET_ERROR", ErrorCategory.NETWORK, ErrorSeverity.HIGH, details, originalError);
    this.name = "WebSocketError";
  }
}

/**
 * 文件操作错误
 */
export class FileError extends AppError {
  constructor(
    message: string = "文件操作失败",
    details?: Record<string, any>,
    originalError?: Error
  ) {
    super(message, "FILE_ERROR", ErrorCategory.SYSTEM, ErrorSeverity.MEDIUM, details, originalError);
    this.name = "FileError";
  }
}

/**
 * 错误工厂 - 用于创建各种类型的错误
 */
export class ErrorFactory {
  static network(message?: string, details?: Record<string, any>, originalError?: Error): NetworkError {
    return new NetworkError(message, details, originalError);
  }

  static auth(message?: string, details?: Record<string, any>, originalError?: Error): AuthError {
    return new AuthError(message, details, originalError);
  }

  static validation(message?: string, field?: string, details?: Record<string, any>): ValidationError {
    return new ValidationError(message, field, details);
  }

  static database(message?: string, details?: Record<string, any>, originalError?: Error): DatabaseError {
    return new DatabaseError(message, details, originalError);
  }

  static business(message: string, code?: string, details?: Record<string, any>): BusinessError {
    return new BusinessError(message, code, details);
  }

  static system(message?: string, details?: Record<string, any>, originalError?: Error): SystemError {
    return new SystemError(message, details, originalError);
  }

  static websocket(message?: string, details?: Record<string, any>, originalError?: Error): WebSocketError {
    return new WebSocketError(message, details, originalError);
  }

  static file(message?: string, details?: Record<string, any>, originalError?: Error): FileError {
    return new FileError(message, details, originalError);
  }

  /**
   * 从未知错误创建适当的错误对象
   */
  static fromUnknown(error: unknown, defaultMessage = "未知错误"): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      // 根据错误消息判断错误类型
      const message = error.message.toLowerCase();
      if (message.includes("network") || message.includes("fetch")) {
        return ErrorFactory.network(error.message, {}, error);
      }
      if (message.includes("auth") || message.includes("token")) {
        return ErrorFactory.auth(error.message, {}, error);
      }
      if (message.includes("validation") || message.includes("invalid")) {
        return ErrorFactory.validation(error.message);
      }
      if (message.includes("database") || message.includes("sql")) {
        return ErrorFactory.database(error.message, {}, error);
      }
      if (message.includes("websocket")) {
        return ErrorFactory.websocket(error.message, {}, error);
      }

      return ErrorFactory.system(error.message, {}, error);
    }

    return ErrorFactory.system(defaultMessage, { originalError: error });
  }
}

export default ErrorFactory;
