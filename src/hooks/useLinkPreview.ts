import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { ref, watch, type Ref } from "vue";
import { logger } from "@/hooks/useLogger";

// ==================== 类型定义 ====================

export interface LinkMeta {
  url: string;
  title: string;
  description?: string;
  icon?: string;
  image?: string;
  siteName?: string;
}

interface CacheEntry {
  data: LinkMeta;
  timestamp: number;
}

// ==================== 配置 ====================

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时
const FETCH_TIMEOUT = 8000;
const cache = new Map<string, CacheEntry>();

// ==================== 工具函数 ====================

/** URL 正则 */
const URL_REGEX = /^(https?:\/\/)?([a-z\d]([a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(:\d+)?(\/[^\s]*)?$/i;

/** 检测是否为纯 URL */
export const isPureUrl = (text: string): boolean => {
  const trimmed = text?.trim();
  return !!trimmed && URL_REGEX.test(trimmed) && !trimmed.includes(" ") && !trimmed.includes("\n");
};

/** 规范化 URL */
const normalizeUrl = (url: string): string => {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/** 提取域名 */
export const extractDomain = (url: string): string => {
  try {
    return new URL(normalizeUrl(url)).hostname;
  } catch {
    return url;
  }
};

/** 获取 favicon URL */
const getFaviconUrl = (url: string): string => {
  const domain = extractDomain(url);
  // 使用 Google Favicon 服务作为备选
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
};

/** 带超时的 fetch（使用 Tauri HTTP 插件绕过 CORS） */
const fetchWithTimeout = async (url: string, timeout: number): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await tauriFetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      connectTimeout: timeout
    });
    return res;
  } finally {
    clearTimeout(id);
  }
};

/** 解析 HTML 获取元信息 */
const parseHtmlMeta = (html: string, url: string): LinkMeta => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const baseUrl = normalizeUrl(url);

  // 辅助函数：获取 meta 内容
  const getMeta = (selectors: string[]): string | undefined => {
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      const content = el?.getAttribute("content") || el?.textContent;
      if (content?.trim()) return content.trim();
    }
    return undefined;
  };

  // 辅助函数：解析相对 URL
  const resolveUrl = (path?: string): string | undefined => {
    if (!path) return undefined;
    try {
      return new URL(path, baseUrl).href;
    } catch {
      return path;
    }
  };

  // 提取标题
  const title = getMeta([
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    "title"
  ]) || extractDomain(url);

  // 提取描述
  const description = getMeta([
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
    'meta[name="description"]'
  ]);

  // 提取图标
  const iconPath = getMeta([
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]'
  ])?.replace(/^content:/, "") || doc.querySelector('link[rel*="icon"]')?.getAttribute("href");

  const icon = resolveUrl(iconPath ?? undefined) || getFaviconUrl(url);

  // 提取预览图
  const imagePath = getMeta([
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]'
  ]);
  const image = resolveUrl(imagePath);

  // 提取站点名称
  const siteName = getMeta([
    'meta[property="og:site_name"]',
    'meta[name="application-name"]'
  ]);

  return { url: baseUrl, title, description, icon, image, siteName };
};

// ==================== 核心函数 ====================

/** 获取链接元信息 */
export const fetchLinkMeta = async (url: string): Promise<LinkMeta> => {
  const normalizedUrl = normalizeUrl(url);
  const cacheKey = normalizedUrl.toLowerCase();

  // 检查缓存
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // 创建降级结果
  const createFallback = (): LinkMeta => ({
    url: normalizedUrl,
    title: extractDomain(url),
    icon: getFaviconUrl(url)
  });

  try {
    const res = await fetchWithTimeout(normalizedUrl, FETCH_TIMEOUT);

    // 检查响应状态
    if (!res.ok) {
      logger.warn(`[LinkPreview] HTTP ${res.status} for ${normalizedUrl}`);
      const fallback = createFallback();
      cache.set(cacheKey, { data: fallback, timestamp: Date.now() });
      return fallback;
    }

    // 检查内容类型
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      const fallback = createFallback();
      cache.set(cacheKey, { data: fallback, timestamp: Date.now() });
      return fallback;
    }

    const html = await res.text();
    const meta = parseHtmlMeta(html, normalizedUrl);

    // 缓存结果
    cache.set(cacheKey, { data: meta, timestamp: Date.now() });
    return meta;
  } catch (err) {
    logger.warn(`[LinkPreview] Error fetching ${normalizedUrl}:`, err);
    const fallback = createFallback();
    cache.set(cacheKey, { data: fallback, timestamp: Date.now() });
    return fallback;
  }
};

// ==================== Hook ====================

export interface UseLinkPreviewOptions {
  /** 是否自动加载 */
  autoLoad?: boolean;
  /** 是否启用缓存 */
  enableCache?: boolean;
}

export interface UseLinkPreviewReturn {
  meta: Ref<LinkMeta | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  load: (url?: string) => Promise<void>;
}

export function useLinkPreview(
  url: Ref<string> | string,
  options: UseLinkPreviewOptions = {}
): UseLinkPreviewReturn {
  const { autoLoad = true } = options;

  const meta = ref<LinkMeta | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const urlRef = typeof url === "string" ? ref(url) : url;

  const load = async (overrideUrl?: string) => {
    const targetUrl = overrideUrl || urlRef.value;
    if (!targetUrl || !isPureUrl(targetUrl)) {
      meta.value = null;
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      meta.value = await fetchLinkMeta(targetUrl);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "加载失败";
      meta.value = null;
    } finally {
      loading.value = false;
    }
  };

  // 自动加载
  if (autoLoad) {
    watch(urlRef, () => load(), { immediate: true });
  }

  return { meta, loading, error, load };
}

/** 清理过期缓存 */
export const cleanExpiredCache = () => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
};

export default useLinkPreview;

