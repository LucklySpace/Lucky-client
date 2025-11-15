import { App } from "vue";
// 异常上报接口
import api from "@/api/index";

export default {
  install: (app: App) => {
    //registerGlobalErrorHandler(app);
  }
};

/**
 * 注册全局错误捕获器
 * - 捕获 Vue 组件渲染/生命周期内抛出的错误
 * - 捕获全局未处理的异常（window.onerror）
 * - 捕获未处理的 Promise 拒绝（window.onunhandledrejection）
 * - 将错误详情上报给后端，同时在控制台输出
 * https://www.exception.site/article/12951
 */
function registerGlobalErrorHandler(app: App): void {
  // 保留原有的 errorHandler（如果有）
  const originalHandler = app.config.errorHandler;

  // 1. Vue 组件内错误捕获
  app.config.errorHandler = (error, instance, info) => {
    // 组件名称
    const componentName = instance?.$options.name || "AnonymousComponent";

    const payload = buildErrorPayload(error, {
      component: componentName,
      info
    });

    // 控制台输出
    console.error(`[Vue Error] [${componentName}] [${info}]`, error);

    // 异步上报，防止阻塞渲染
    reportError(payload);

    // 调用原始 handler，保持行为链
    if (originalHandler) {
      try {
        originalHandler(error, instance, info);
      } catch (e) {
        console.warn("[ErrorHandler] original handler threw:", e);
      }
    }
  };

  // 2. 浏览器未捕获异常
  window.addEventListener("error", event => {
    // 过滤资源加载错误（如果不需要可删）
    const error = event.error || new Error(`ResourceError: ${event.message}`);
    const payload = buildErrorPayload(error, {
      source: "window.onerror",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });

    console.error("[Uncaught Error]", error);
    reportError(payload);
  });

  // 3. 未处理的 Promise 拒绝
  window.addEventListener("unhandledrejection", event => {
    const error = event.reason instanceof Error ? event.reason : new Error(JSON.stringify(event.reason));
    const payload = buildErrorPayload(error, {
      source: "unhandledrejection"
    });

    console.error("[Unhandled Promise Rejection]", error);
    reportError(payload);
  });
}

/**
 * 构建上报所需的标准化错误对象
 */
function buildErrorPayload(error: any, extra: Record<string, any>): Record<string, any> {
  return {
    message: error.message,
    stack: error.stack,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    ...extra
  };
}

/**
 * 调用后端上报接口，包含错误降级和限流（可选）
 */
async function reportError(payload: Record<string, any>) {
  try {
    await api.ExceptionReport(payload);
  } catch (reportErr) {
    // 如果上报失败，打印警告但不抛出
    console.warn("[ErrorReport] 上报失败", reportErr, "原始 payload:", payload);
  }
}
