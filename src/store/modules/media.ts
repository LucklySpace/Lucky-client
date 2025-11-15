import { defineStore, storeToRefs } from "pinia";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { Store as TauriStore } from "@tauri-apps/plugin-store";
import { convertFileSrc } from "@tauri-apps/api/core";
import { markRaw, ref, computed } from "vue";
import { CacheEnum, StoresEnum } from "@/constants";

/**
 * 媒体缓存 Store（简化优化版）
 *
 * 说明：
 * - mediaMap: key -> 本地 file:// 地址 或 原始 URL（作为回退）
 * - storage: TauriStore 实例（标记为 markRaw，避免响应式处理）
 * - 使用 inflightPromises 避免并发重复下载同一资源
 */

interface State {
  mediaMap: Record<string, string>;
  storage: TauriStore | null;
  targetId: string | null;
}

const inflightPromises = new Map<string, Promise<string>>(); // 并发去重

function safeBase64(input: string) {
  // base64 并替换 URL 不友好字符，作为文件名的一部分
  return btoa(input).replace(/[+/=]/g, "_");
}

function extFromUrl(url: string) {
  try {
    const p = new URL(url).pathname;
    const seg = p.split(".");
    const last = seg.pop() || "";
    return last.includes("/") ? "" : last;
  } catch {
    return "";
  }
}

/**
 * 确保缓存目录存在并返回目录路径
 */
async function ensureCacheDir(): Promise<string> {
  const baseDir = await appCacheDir();
  const cacheDir = await join(baseDir, CacheEnum.IMAGE_CACHE);
  if (!(await exists(cacheDir))) {
    await mkdir(cacheDir);
  }
  return cacheDir;
}

export const useMediaCacheStore = defineStore(
  StoresEnum.MEDIA_CACHE,
  () => {
    // state
    const mediaMap = ref<Record<string, string>>({});
    const storage = ref<TauriStore | null>(null);
    const targetId = ref<string | null>(null);

    // getters
    const getMedia = computed(() => (key: string) => mediaMap.value[key] ?? "");
    const getId = computed(() => () => targetId.value);

    /**
     * 初始化用户存储（优先 load）
     * - id: 用户 id，用于区分不同用户的缓存文件
     */
    const initStorage = async (id: string) => {
      const idHash = safeBase64(id);
      const name = `./media/media-cache-${idHash}.dat`;

      try {
        // 尽量使用 load，若不存在 plugin 会返回一个新 store
        const store = await TauriStore.load(name);
        storage.value = markRaw(store);
        targetId.value = id;

        // 尝试从存储读取 mediaMap（兼容旧版本：可能直接保存了 entries）
        try {
          const saved = (await storage.value.get("mediaMap")) as Record<string, string> | undefined;
          if (saved && typeof saved === "object") {
            mediaMap.value = { ...saved };
          } else {
            // 兼容读取全部 entries（如果之前使用 entries 存储）
            const entries = await storage.value.entries();
            mediaMap.value = entries
              .filter(([_, v]) => typeof v === "string")
              .reduce((map, [k, v]) => ({ ...map, [k]: v as string }), {});
          }
        } catch (e) {
          // 读取失败则保留空 map
          mediaMap.value = {};
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.warn("[MediaCacheStore] load mediaMap fail:", e);
          }
        }
      } catch (e) {
        // store 加载失败（极少情况），保持降级策略
        storage.value = null;
        targetId.value = id;
        mediaMap.value = {};
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error("[MediaCacheStore] initStorage failed:", e);
        }
      }
    };

    /**
     * 持久化 mediaMap（可传单个 key 来只写入单条）
     */
    const persist = async (key?: string) => {
      if (!storage.value) return;
      try {
        if (key) {
          await storage.value.set(key, mediaMap.value[key]);
        } else {
          await storage.value.set("mediaMap", mediaMap.value);
        }
        await storage.value.save();
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error("[MediaCacheStore] persist failed:", e);
        }
      }
    };

    /**
     * 将远程 URL 缓存到本地并返回可在前端使用的路径（convertFileSrc -> file://）
     * - 若文件已存在则直接返回
     */
    const cacheUrl = async (url: string): Promise<string> => {
      try {
        const cacheDir = await ensureCacheDir();

        const ext = extFromUrl(url);
        const filename = safeBase64(url) + (ext ? `.${ext}` : "");
        const filePath = await join(cacheDir, filename);

        // 若存在直接返回转换后的本地路径
        if (await exists(filePath)) {
          return convertFileSrc(filePath);
        }

        // 防止并发重复下载同一 URL（optional: 也可以把 inflight key 用 key 而非 URL）
        if (inflightPromises.has(filePath)) {
          return inflightPromises.get(filePath)!;
        }

        const p = (async () => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
          const buf = await res.arrayBuffer();
          await writeFile(filePath, new Uint8Array(buf));
          return convertFileSrc(filePath);
        })();

        inflightPromises.set(filePath, p);
        try {
          const result = await p;
          return result;
        } finally {
          inflightPromises.delete(filePath);
        }
      } catch (e) {
        // 下载或写入失败：上层可决定使用原始 URL 回退
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[MediaCacheStore] cacheUrl failed, fallback to original URL:", e);
        }
        return url;
      }
    };

    /**
     * 加载并缓存资源（key 通常是消息 id 或 url 的 hash）
     * - 若已存在则直接返回
     */
    const loadMedia = async (key: string, url: string) => {
      // 已缓存或正在缓存时直接返回
      const existing = mediaMap.value[key];
      if (existing) return;

      // 先标记占位（避免短时间内并发触发 UI 闪烁）
      mediaMap.value[key] = "";
      // 并发去重：如果其他地方也调用 loadMedia，先检查 inflightPromises（以 key 为单位）
      if (inflightPromises.has(key)) {
        try {
          const path = await inflightPromises.get(key)!;
          mediaMap.value[key] = path;
          await persist(key);
          return;
        } catch {
          // ignore and proceed to try
        }
      }

      // 将下载 Promise 存入 inflightPromises（用 key 作为标识）
      const promise = (async () => {
        try {
          const local = await cacheUrl(url);
          mediaMap.value[key] = local || url;
        } catch {
          mediaMap.value[key] = url;
        } finally {
          try {
            await persist(key);
          } catch {
            /* ignore persist errors */
          }
        }
        return mediaMap.value[key];
      })();

      inflightPromises.set(key, promise);

      try {
        await promise;
      } finally {
        inflightPromises.delete(key);
      }
    };

    /**
     * 清除单条缓存映射（不删除本地文件）
     */
    const removeKey = (key: string) => {
      if (mediaMap.value[key]) {
        delete mediaMap.value[key];
        persist(); // 异步持久化（不 await）
      }
    };

    /**
     * 清空内存映射与持久化存储（不会删除本地缓存文件）
     */
    const clearAll = async () => {
      mediaMap.value = {};
      if (storage.value) {
        await storage.value.set("mediaMap", {});
        await storage.value.save();
      }
    };

    // 返回 store 实例的内容
    return {
      // state
      mediaMap,
      storage,
      targetId,

      // getters
      getMedia,
      getId,

      // actions
      initStorage,
      persist,
      cacheUrl,
      loadMedia,
      removeKey,
      clearAll
    };
  },
  {
    // 只把 mediaMap 持久化到 sessionStorage（你已有的策略）
    persist: [
      {
        key: `${StoresEnum.MEDIA_CACHE}_session`,
        paths: ["mediaMap"],
        storage: sessionStorage
      }
    ]
  }
);

// type MediaType = 'image' | 'video'

// interface MediaState {
//     status: 'idle' | 'loading' | 'done' | 'error'
//     src?: string
// }

// export const useMediaCacheStore = defineStore('mediaCache', () => {

//     // { [url]: { status, src } }
//     const cache = ref<Record<string, MediaState>>({})

//     /**
//      * 预加载并缓存一条资源（图片或视频）
//      * @param url 资源原始 URL
//      * @param type 'image' | 'video'
//      */
//     async function fetchMedia(url: string, type: MediaType): Promise<MediaState> {

//         // 已经触发过或完成过，直接返回
//         if (cache.value[url]) {
//             return cache.value[url]
//         }

//         // 初始化状态
//         cache.value[url] = { status: 'loading' }
//         try {
//             let localSrc: string

//             if (type === 'image') {
//                 // 调用前面写好的 cacheImage
//                 localSrc = await cacheImage(url)
//             } else {
//                 // 这里假设你实现了类似 cacheVideo 的函数
//                 // localSrc = await cacheVideo(url)
//                 // 暂时先用原始 URL 或 data URI 回落
//                 localSrc = url
//             }

//             cache.value[url] = { status: 'done', src: localSrc }
//         } catch (e) {
//             console.error(`Failed to cache ${type}`, url, e)
//             cache.value[url].status = 'error'
//         }
//         return cache.value[url]
//     }

//     /**
//      * 取已缓存的本地地址（可能还在 loading 或 error）
//      */
//     function getMediaSrc(url: string): string | undefined {
//         return cache.value[url]?.src
//     }

//     /**
//      * 清除某个 URL 的缓存
//      */
//     function clearMedia(url: string) {
//         delete cache.value[url]
//     }

//     /**
//      * 清空所有缓存
//      */
//     function clearAll() {
//         cache.value = {}
//     }

//     return {
//         cache,
//         fetchMedia,
//         getMediaSrc,
//         clearMedia,
//         clearAll,
//     }
// })