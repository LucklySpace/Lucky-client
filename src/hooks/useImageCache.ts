/*
Composable Hook: useImageCache.ts
Tauri2 + Vue3
将远程图片 URL 缓存到本地并返回可用于 <img> 的 src
*/

import { Ref, ref, unref, watch } from "vue";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { CacheEnum } from "@/constants";

type UrlInput = string | Ref<string> | (() => string);

/**
 * 内存级缓存（本模块单例）
 * - memCache: url -> 可用的浏览器 src（convertFileSrc 结果）
 * - inflight: url -> 正在执行的缓存 Promise，避免并发重复下载
 */
const memCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/**
 * 将本地绝对路径转换为浏览器可用的 src
 * 使用 Tauri 提供的 convertFileSrc，避免直接拼接 file:// 引起的平台差异
 * 可选附加时间戳参数用于强制刷新（缓存破坏）
 */
function toImgSrc(path: string, bust = false): string {
  const src = convertFileSrc(path);
  return bust ? `${src}?t=${Date.now()}` : src;
}

/**
 * 解析输入为最终 URL 字符串
 * - 支持 string / Ref<string> / () => string
 */
function resolveUrl(input: UrlInput): string {
  if (typeof input === "function") return input() || "";
  const v = unref(input as any) as string;
  return v || "";
}

/**
 * 调用后端命令缓存图片到本地，并返回本地绝对路径
 * - 使用 Rust 命令 cache_image_to_path（已在 tauri::generate_handler 注册）
 * - 命令负责：创建目录、生成文件名（sha256）、下载与落盘、返回文件绝对路径
 */
async function cacheImageToLocal(url: string): Promise<string> {
  const base = await appCacheDir();
  const dir = await join(base, CacheEnum.IMAGE_CACHE);
  const path = await invoke<string>("cache_image_to_path", {
    url,
    cache_base: dir
  });
  return path;
}

/**
 * 获取图片的本地 src（带并发控制与内存缓存）
 * - 先读内存缓存；无则合并并发请求；失败时回退到原始 URL
 */
async function getLocalSrc(url: string, bust = false): Promise<string> {
  if (!url) return "";
  const cached = memCache.get(url);
  if (cached) return bust ? `${cached}?t=${Date.now()}` : cached;

  const ongoing = inflight.get(url);
  if (ongoing) {
    const localPath = await ongoing;
    const src = toImgSrc(localPath, bust);
    memCache.set(url, src);
    return src;
  }

  const p = (async () => {
    try {
      const localPath = await cacheImageToLocal(url);
      return localPath;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, p);
  try {
    const localPath = await p;
    const src = toImgSrc(localPath, bust);
    memCache.set(url, src);
    return src;
  } catch (e) {
    console.error("Image cache error:", e);
    return url; // 回退到原始 URL
  }
}

/**
 * useImageCache
 * @param input - 远程图片 URL（支持 string / Ref<string> / () => string）
 * @param options - 可选项：{ bust?: boolean } 是否附加时间戳强制刷新
 * @returns { localSrc, refresh } - 响应式本地 src 与手动刷新函数
 *
 * 使用说明：
 * - 接收响应式输入，url 变化时自动重新缓存
 * - 返回的 localSrc 可直接用于 <img :src="localSrc" />
 */
export function useImageCache(
  input: UrlInput,
  options?: { bust?: boolean }
) {
  const bust = Boolean(options?.bust);
  const localSrc = ref<string>("");
  let seq = 0; // 竞态序列，用于忽略过期请求

  // 初始值
  localSrc.value = resolveUrl(input);

  // 监听 url 变化并更新缓存
  watch(
    () => resolveUrl(input),
    async (url) => {
      if (!url) {
        localSrc.value = "";
        return;
      }
      const mySeq = ++seq;
      const src = await getLocalSrc(url, bust);
      if (mySeq === seq) {
        localSrc.value = src;
      }
    },
    { immediate: true }
  );

  /**
   * 手动刷新当前 url 对应的 src（忽略内存缓存）
   */
  async function refresh() {
    const url = resolveUrl(input);
    if (!url) return;
    // 删除内存缓存，触发重新缓存
    memCache.delete(url);
    const mySeq = ++seq;
    const src = await getLocalSrc(url, true);
    if (mySeq === seq) {
      localSrc.value = src;
    }
  }

  return { localSrc, refresh };
}

/**
 <template>
   <img :src="localSrc" alt="Cached Image" />
 </template>

 <script setup lang="ts">
 import { ref } from 'vue'
 import { useImageCache } from '@/hooks/useImageCache'

 const src = ref('https://example.com/image.jpg')
 const { localSrc, refresh } = useImageCache(src, { bust: false })

 // 可在需要时手动刷新
 // await refresh()
 </script>
 */
