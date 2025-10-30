// src/directives/v-dompurify.ts
/**
 * v-dompurify 指令（Vue 3 + TypeScript）
 *
 * 特性（优化点）：
 * - 工厂 createDomPurifyDirective(options) 可配置：cacheSize, defaultAsync, fallbackToRaw, globalConfig
 * - 支持绑定两种形式：
 *     v-dompurify="rawHtml"
 *     v-dompurify="{ html, config?, async?, placeholderEscaped? }"
 * - 可选 LRU 缓存（cacheSize > 0 启用）
 * - 支持异步 sanitize（requestIdleCallback 优先），异步模式下可先显示转义文本占位
 * - 明确要求在浏览器环境使用（不做 SSR 兼容）
 *
 * 依赖：npm install dompurify
 */

import { Directive, DirectiveBinding } from "vue";
import type * as DOMPurifyType from "dompurify";
import createDOMPurify from "dompurify";

/* -------------------- 类型 -------------------- */
type DirectiveValue =
  | string
  | {
  html?: string;
  config?: DOMPurifyType.Config;
  async?: boolean; // 覆盖默认异步行为
  placeholderEscaped?: boolean; // 异步模式下是否先显示转义后的文本占位（默认 false）
};

export interface DirectiveOptions {
  cacheSize?: number; // <=0 表示不启用缓存
  defaultAsync?: boolean; // 指令默认是否使用异步 sanitize
  fallbackToRaw?: boolean; // sanitize 失败时是否返回原文（true）或返回空字符串（false 更安全）
  globalConfig?: DOMPurifyType.Config; // 传给 DOMPurify 的全局配置
}

/* -------------------- 简易 LRU 缓存 -------------------- */
class LRUCache {
  private map = new Map<string, string>();
  private cap: number;

  constructor(capacity = 200) {
    this.cap = Math.max(1, capacity);
  }

  get(key: string) {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    // 更新使用顺序：删除后重新 set 到末尾
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, val: string) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, val);
    if (this.map.size > this.cap) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey ?? "");
    }
  }

  clear() {
    this.map.clear();
  }
}

/* -------------------- 全局内部状态（由工厂初始化） -------------------- */
let _purify: DOMPurifyType.DOMPurify | null = null;
let _cache: LRUCache | null = null;
let _defaultAsync = false;
let _fallbackToRaw = false;
let _globalConfig: DOMPurifyType.Config | undefined;

/* -------------------- 工具：确保 DOMPurify 实例（浏览器） -------------------- */
function ensurePurify(): DOMPurifyType.DOMPurify {
  if (_purify) return _purify;
  if (typeof window === "undefined") {
    // 我们不做 SSR 支持，明确抛出以便开发者知晓
    throw new Error("v-dompurify 指令仅在浏览器环境下使用（window 未定义）。");
  }
  _purify = createDOMPurify(window) as unknown as DOMPurifyType.DOMPurify;
  if (_globalConfig) {
    try {
      _purify.setConfig(_globalConfig);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[v-dompurify] setConfig error:", e);
      }
    }
  }
  return _purify;
}

/* -------------------- 辅助：生成缓存键（包含 config 简单序列化） -------------------- */
/**
 * 说明：
 *  - 若你的 config 含函数或非可序列化项，JSON.stringify 可能丢失信息。
 *  - 这是一个实用折中方案：在需要严格区分 config 时，请自行提供更强的 key 生成器（例如 hash）
 */
function makeCacheKey(html: string, cfg?: DOMPurifyType.Config) {
  if (!cfg) return html;
  try {
    // 为减少不同 key 顺序导致差异，尽量对 cfg 做序列化（此处不做深度排序以保持简单）
    return html + "||cfg:" + JSON.stringify(cfg);
  } catch {
    return html;
  }
}

/* -------------------- 同步 sanitize（带可选缓存） -------------------- */
function sanitizeSync(html: string, cfg?: DOMPurifyType.Config): string {
  const raw = html || "";
  const key = makeCacheKey(raw, cfg);
  if (_cache) {
    const hit = _cache.get(key);
    if (hit !== undefined) return hit;
  }
  const purify = ensurePurify();
  try {
    const out = purify.sanitize(raw, cfg) as string;
    _cache?.set(key, out);
    return out;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[v-dompurify] sanitizeSync error:", e);
    }
    return _fallbackToRaw ? raw : "";
  }
}

/* -------------------- 异步 sanitize（requestIdleCallback 优先） -------------------- */
function sanitizeAsync(html: string, cfg?: DOMPurifyType.Config): Promise<string> {
  return new Promise(resolve => {
    const task = () => {
      try {
        const out = sanitizeSync(html, cfg);
        resolve(out);
      } catch {
        resolve(_fallbackToRaw ? html || "" : "");
      }
    };
    if (typeof (window as any) !== "undefined" && "requestIdleCallback" in window) {
      (window as any).requestIdleCallback(task, { timeout: 50 });
    } else {
      // 16ms 延时避免阻塞渲染（接近一帧）
      setTimeout(task, 16);
    }
  });
}

/* -------------------- 解析指令绑定值 -------------------- */
function resolveBinding(binding: DirectiveBinding): {
  html: string;
  cfg?: DOMPurifyType.Config;
  async?: boolean;
  placeholderEscaped?: boolean;
} {
  const val = binding.value as DirectiveValue;
  if (!val) return { html: "" };
  if (typeof val === "string") return { html: val };
  return { html: val.html || "", cfg: val.config, async: val.async, placeholderEscaped: !!val.placeholderEscaped };
}

/* -------------------- 工厂：创建定制化指令 -------------------- */
export function createDomPurifyDirective(options?: DirectiveOptions): Directive {
  // 初始化全局状态（可被后续 createDomPurifyDirective 多次调用覆盖）
  _cache = options && options.cacheSize && options.cacheSize > 0 ? new LRUCache(options.cacheSize) : null;
  _defaultAsync = !!(options && options.defaultAsync);
  _fallbackToRaw = !!(options && options.fallbackToRaw);
  _globalConfig = options && options.globalConfig;

  // 预创建实例（如果在浏览器中会立即创建并设置 config）
  try {
    if (typeof window !== "undefined") ensurePurify();
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[v-dompurify] createDomPurifyDirective ensurePurify failed:", e);
    }
  }

  const directive: Directive = {
    beforeMount(el: HTMLElement, binding: DirectiveBinding) {
      const { html, cfg, async, placeholderEscaped } = resolveBinding(binding);
      const useAsync = async ?? _defaultAsync;

      if (useAsync) {
        // 异步时先显示占位（如果用户想要转义占位，可设置 placeholderEscaped: true）
        if (placeholderEscaped && html) {
          // 将原始 HTML 转为纯文本占位，避免插入未 sanitize 的 HTML
          el.textContent = stripTags(html);
        } else {
          // 默认先清空
          el.innerHTML = "";
        }

        sanitizeAsync(html, cfg).then(sanitized => {
          // 当指令多次更新时，旧的 Promise 可能后到；为简单实现我们直接覆盖
          el.innerHTML = sanitized;
        });
      } else {
        // 同步路径
        el.innerHTML = sanitizeSync(html, cfg);
      }
    },

    updated(el: HTMLElement, binding: DirectiveBinding) {
      // 值未变则直接跳过（简单优化）
      if (binding.oldValue === binding.value) return;
      const { html, cfg, async, placeholderEscaped } = resolveBinding(binding);
      const useAsync = async ?? _defaultAsync;

      if (useAsync) {
        if (placeholderEscaped && html) {
          el.textContent = stripTags(html);
        } else {
          el.innerHTML = "";
        }
        sanitizeAsync(html, cfg).then(sanitized => {
          el.innerHTML = sanitized;
        });
      } else {
        el.innerHTML = sanitizeSync(html, cfg);
      }
    }

    // unmounted: 无需清理内部状态（若使用 addHook，建议在应用层统一管理生命周期）
  };

  return directive;
}

/* -------------------- 默认导出指令（使用默认选项：无缓存、同步） -------------------- */
/**
 * 方便直接注册： app.directive('dompurify', vDomPurify)
 * 如果你需要定制（如启用缓存或默认异步），请使用 createDomPurifyDirective(options)
 */
export const vDomPurify: Directive = createDomPurifyDirective({
  cacheSize: 0, // 默认不启用缓存
  defaultAsync: false,
  fallbackToRaw: false
});

/* -------------------- 辅助函数 -------------------- */
function stripTags(html = ""): string {
  // 简单将 HTML 转为纯文本，用作占位（用于 placeholderEscaped 场景）
  // 注意：此函数不会执行任何 XSS 清理，仅把标记剥离
  try {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  } catch {
    const re: RegExp = new RegExp("</?[^>]+(>|$)", "g");
    //return html.replace(/<\/?[^>]+(>|$)/g, "");
    return html.replace(re, "");
  }
}

/* -------------------- 暴露测试 / 运行时工具 -------------------- */
/**
 * 清空缓存（当你在运行时修改 globalConfig 或 addHook 后，请调用此函数以避免使用旧缓存）
 */
export function clearDomPurifyCache() {
  _cache?.clear();
}

/**
 * 重置内部状态（仅测试用）
 */
export function __resetDomPurifyForTest() {
  _purify = null;
  _cache = null;
  _defaultAsync = false;
  _fallbackToRaw = false;
  _globalConfig = undefined;
}
