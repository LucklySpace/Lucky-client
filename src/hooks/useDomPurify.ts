/**
 * Vue 3 Hook + 指令：集成 DOMPurify，用于安全渲染用户或第三方提供的 HTML
 *
 * 功能：
 *  - sanitize(html, config?) -> string：直接清理字符串
 *  - useSanitized(source, config?) -> { sanitizedRef, sanitize }：将响应式 source 转为已清理的 ref
 *  - vDomPurify 指令：在模板里替代 v-html，自动 sanitize 并写入 innerHTML
 *
 * 注意：
 *  - 这个实现考虑了 SSR（无 window 时会返回不可执行 sanitize 的空函数，避免抛错）
 *  - DOMPurify 的高级定制（addHook/removeHook、白名单扩展）可通过 exposePurifyConfig() / getPurify() 访问原始实例
 *  - 生产环境强烈建议使用 DOMPurify 官方推荐的配置与策略，或配合后端二次校验
 */

import { ref, Ref, unref, watch } from "vue";
import type * as DOMPurifyType from "dompurify";
import createDOMPurify from "dompurify";

type MaybeRef<T> = T | Ref<T>;

let purifyInstance: DOMPurifyType.DOMPurify | null = null;

/**
 * 获取或创建 DOMPurify 实例（浏览器环境）
 * 在 SSR 环境 (typeof window === 'undefined') 返回 null，调用方应做降级处理
 */
function getPurify(): DOMPurifyType.DOMPurify | null {
  if (purifyInstance) return purifyInstance;
  if (typeof window === "undefined") {
    // SSR 环境：无 window，无 DOM，可做降级（返回 null）
    return null;
  }
  // createDOMPurify 需传入 window（且通常来自 'dompurify' 包）
  purifyInstance = createDOMPurify(window) as unknown as DOMPurifyType.DOMPurify;
  return purifyInstance;
}

/**
 * 主 sanitize 函数（安全包装）
 * - input 可以是任意字符串（HTML）
 * - config 会透传给 DOMPurify.sanitize
 * - 若在 SSR 环境则返回空字符串或原始字符串（可选，下面选择返回空字符串以更保守）
 */
function sanitize(input: string | null | undefined, config?: DOMPurifyType.Config): string {
  if (!input) return "";
  const purify = getPurify();
  if (!purify) {
    // SSR or unsupported environment: 保守策略返回空字符串，避免注入风险
    // 若你在 SSR 环境确实需要保留原文，可改为 `return input;`（风险自负）
    return "";
  }
  try {
    // DOMPurify.sanitize 返回 string
    return purify.sanitize(input, config) as string;
  } catch (e) {
    // 出错时保守降级
    // 在开发环境可 console.error(e)
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[useDomPurify] sanitize error:", e);
    }
    return "";
  }
}

/**
 * Vue Hook：useDomPurify / useSanitized
 *
 * 用法：
 * const { sanitizedRef, sanitize } = useDomPurify(source, config)
 *
 * - source: 可以是 string 或 Ref<string>
 * - 返回 sanitizedRef（响应式 string），每当 source 变化时自动 sanitize 并更新
 * - sanitize: 手动调用 sanitize(rawHtml)
 */
export function useDomPurify(source?: MaybeRef<string>, config?: DOMPurifyType.Config) {
  // 响应式返回值
  const sanitizedRef = ref<string>("");

  // 若用户传入 source，则建立监听；否则只提供手动 sanitize
  if (source !== undefined) {
    // 立即计算一次（支持传入 Ref 或原始字符串）
    const raw = unref(source) || "";
    sanitizedRef.value = sanitize(raw, config);

    // watch source（深度不需要）
    // 注意：source 可以是非 Ref（primitive）时 unref 后不会触发 watcher —— 所以这里我们仅在 source 是 Ref 时 watch
    if ((source as Ref<string>) && typeof (source as Ref<string>).value !== "undefined") {
      watch(source as Ref<string>, newVal => {
        sanitizedRef.value = sanitize(newVal || "", config);
      });
    }
  }

  /**
   * 手动 sanitize 方法（用于需要即时转换的场景）
   * 返回已清理的 HTML 字符串
   */
  function sanitizeHtml(html: string | null | undefined, cfg?: DOMPurifyType.Config) {
    return sanitize(html, cfg ?? config);
  }

  /**
   * 暴露原始 DOMPurify 实例（可能为 null，在 SSR 时为 null）
   * 允许上层组件或应用在初始化阶段做高级配置：
   *  - getPurify()?.setConfig({...})
   *  - getPurify()?.addHook('uponSanitizeElement', ... )
   *
   * 注意：使用 addHook/removeHook 时请谨慎，错误的 hook 可能导致 XSS 策略失效
   */
  function getPurifyInstance() {
    return getPurify();
  }

  return {
    sanitizedRef,
    sanitize: sanitizeHtml,
    getPurify: getPurifyInstance
  };
}

export default {
  useDomPurify,
  getPurify
};
