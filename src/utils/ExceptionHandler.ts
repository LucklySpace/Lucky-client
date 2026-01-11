/**
 * 全局异常处理器
 * 类似 Java 的 @ExceptionHandler / @ControllerAdvice
 * 
 * 使用方式：
 * 1. 直接包装异步函数：await ExceptionHandler.execute(() => api.xxx())
 * 2. 使用装饰器模式：const safeFn = ExceptionHandler.wrap(fn)
 * 3. 注册全局异常处理：ExceptionHandler.registerHandler(ErrorType, handler)
 */

type ErrorHandler = (error: Error, context?: ErrorContext) => void | Promise<void>;
type ErrorPredicate = (error: Error) => boolean;

interface ErrorContext {
    /** 操作名称 */
    operation?: string;
    /** 附加数据 */
    data?: any;
    /** 是否静默处理（不触发全局处理器） */
    silent?: boolean;
    /** 自定义回退值 */
    fallback?: any;
}

interface HandlerEntry {
    predicate: ErrorPredicate;
    handler: ErrorHandler;
    priority: number;
}

/** 业务异常基类 */
export class BusinessError extends Error {
    constructor(
        message: string,
        public readonly code?: string | number,
        public readonly data?: any
    ) {
        super(message);
        this.name = "BusinessError";
    }
}

/** 网络异常 */
export class NetworkError extends BusinessError {
    constructor(message = "网络请求失败", data?: any) {
        super(message, "NETWORK_ERROR", data);
        this.name = "NetworkError";
    }
}

/** 认证异常 */
export class AuthError extends BusinessError {
    constructor(message = "认证失败", data?: any) {
        super(message, "AUTH_ERROR", data);
        this.name = "AuthError";
    }
}

/** 验证异常 */
export class ValidationError extends BusinessError {
    constructor(message = "数据验证失败", data?: any) {
        super(message, "VALIDATION_ERROR", data);
        this.name = "ValidationError";
    }
}

class ExceptionHandlerManager {
    private handlers: HandlerEntry[] = [];
    private defaultHandler: ErrorHandler = (err) => {
        console.error("[ExceptionHandler] Unhandled error:", err);
    };
    private logger: any = console;

    /** 设置日志器 */
    setLogger(logger: any): this {
        this.logger = logger;
        return this;
    }

    /** 设置默认异常处理器 */
    setDefaultHandler(handler: ErrorHandler): this {
        this.defaultHandler = handler;
        return this;
    }

    /**
     * 注册异常处理器
     * @param predicate 匹配条件（错误类型或自定义判断函数）
     * @param handler 处理函数
     * @param priority 优先级（数字越大越先执行）
     */
    registerHandler(
        predicate: ErrorPredicate | (new (...args: any[]) => Error),
        handler: ErrorHandler,
        priority = 0
    ): this {
        const pred: ErrorPredicate =
            typeof predicate === "function" && predicate.prototype instanceof Error
                ? (err) => err instanceof (predicate as new (...args: any[]) => Error)
                : (predicate as ErrorPredicate);

        this.handlers.push({ predicate: pred, handler, priority });
        this.handlers.sort((a, b) => b.priority - a.priority);
        return this;
    }

    /** 清除所有处理器 */
    clearHandlers(): this {
        this.handlers = [];
        return this;
    }

    /**
     * 处理异常
     * @param error 异常对象
     * @param context 上下文信息
     */
    async handle(error: Error, context?: ErrorContext): Promise<void> {
        if (context?.silent) return;

        const entry = this.handlers.find((h) => h.predicate(error));
        const handler = entry?.handler ?? this.defaultHandler;

        try {
            await handler(error, context);
        } catch (handlerError) {
            this.logger.error?.("[ExceptionHandler] Handler threw error:", handlerError);
        }
    }

    /**
     * 执行异步操作并处理异常
     * @param fn 要执行的函数
     * @param context 上下文信息
     * @returns 执行结果或 fallback 值
     */
    async execute<T>(
        fn: () => T | Promise<T>,
        context?: ErrorContext
    ): Promise<T | undefined> {
        try {
            return await fn();
        } catch (error) {
            await this.handle(error as Error, context);
            return context?.fallback;
        }
    }

    /**
     * 包装函数，自动处理异常
     * @param fn 原始函数
     * @param contextOrOperation 上下文或操作名称
     */
    wrap<T extends (...args: any[]) => any>(
        fn: T,
        contextOrOperation?: ErrorContext | string
    ): (...args: Parameters<T>) => Promise<ReturnType<T> | undefined> {
        const ctx: ErrorContext =
            typeof contextOrOperation === "string"
                ? { operation: contextOrOperation }
                : contextOrOperation ?? {};

        return async (...args: Parameters<T>) => {
            return this.execute(() => fn(...args), { ...ctx, data: args });
        };
    }

    /**
     * 创建安全执行器（带自定义 fallback）
     * @param fallback 默认返回值
     */
    safe<T>(fallback: T) {
        return {
            execute: <R>(fn: () => R | Promise<R>, context?: Omit<ErrorContext, "fallback">) =>
                this.execute(fn, { ...context, fallback: fallback as any }) as Promise<R | T>,
            wrap: <F extends (...args: any[]) => any>(fn: F, context?: Omit<ErrorContext, "fallback">) =>
                this.wrap(fn, { ...context, fallback: fallback as any })
        };
    }

    /**
     * 断言函数，条件不满足时抛出异常
     */
    assert(condition: any, message: string, ErrorClass = BusinessError): asserts condition {
        if (!condition) {
            throw new ErrorClass(message);
        }
    }

    /**
     * 创建带重试的执行器
     * @param maxRetries 最大重试次数
     * @param delay 重试延迟（毫秒）
     */
    withRetry(maxRetries = 3, delay = 1000) {
        return {
            execute: async <T>(
                fn: () => T | Promise<T>,
                context?: ErrorContext
            ): Promise<T | undefined> => {
                let lastError: Error | undefined;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        return await fn();
                    } catch (error) {
                        lastError = error as Error;
                        this.logger.warn?.(
                            `[ExceptionHandler] Attempt ${attempt}/${maxRetries} failed:`,
                            error
                        );

                        if (attempt < maxRetries) {
                            await new Promise((r) => setTimeout(r, delay * attempt));
                        }
                    }
                }

                await this.handle(lastError!, context);
                return context?.fallback;
            }
        };
    }
}

/** 全局异常处理器实例 */
export const ExceptionHandler = new ExceptionHandlerManager();

/** 便捷方法：安全执行（返回 undefined 作为 fallback） */
export const safeExecute = ExceptionHandler.execute.bind(ExceptionHandler);

/** 便捷方法：包装函数 */
export const wrapSafe = ExceptionHandler.wrap.bind(ExceptionHandler);

/** 便捷方法：断言 */
export const assert = ExceptionHandler.assert.bind(ExceptionHandler);

export default ExceptionHandler;

