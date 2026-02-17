/**
 * 图片/头像缓存 Hook
 * - 图片缓存和头像缓存分离
 * - 索引按 hash 前缀分片（256 片）
 * - 倒排索引：hash -> localPath
 */

import { ref, computed, type Ref, type ComputedRef } from "vue";
import { appCacheDir, appDataDir, join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { exists, mkdir, writeFile, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { storage } from "@/utils/Storage";
import SparkMD5 from "spark-md5";
import { logger } from "@/hooks/useLogger";

// ===================== 类型 =====================

type CacheType = "image" | "avatar";

interface ShardIndex {
  [hash: string]: string; // hash -> localPath
}

// 支持的图片扩展名
const VALID_EXTS = /^\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;

// ===================== 分片缓存管理器 =====================

class ShardedCacheManager {
  private userId = "";
  private cacheBaseDir = "";
  private indexBaseDir = "";
  private initPromise: Promise<void> | null = null;
  private inflight = new Map<string, Promise<string>>();

  // 内存中加载的分片索引 (prefix -> index)
  private shards = new Map<string, ShardIndex>();
  private dirtyShards = new Set<string>(); // 需要持久化的分片

  constructor(private readonly type: CacheType) { }

  // ==================== 初始化 ====================

  async init(userId?: string): Promise<void> {
    const uid = userId || storage.get("userId") || "default";
    if (this.userId === uid && this.cacheBaseDir) return;
    if (this.initPromise && this.userId === uid) return this.initPromise;
    this.initPromise = this._init(uid);
    return this.initPromise;
  }

  private async _init(uid: string): Promise<void> {
    this.userId = uid;
    this.shards.clear();
    this.dirtyShards.clear();

    // 缓存目录: appCacheDir/media/{userId}/{type}
    const cacheBase = await appCacheDir();
    this.cacheBaseDir = await join(cacheBase, `media/${uid}`, this.type);

    // 索引目录: appDataDir/media/{userId}/index/{type}
    const dataBase = await appDataDir();
    this.indexBaseDir = await join(dataBase, `media/${uid}/index`, this.type);

    // 确保目录存在
    await this.ensureDir(this.cacheBaseDir);
    await this.ensureDir(this.indexBaseDir);
  }

  // ==================== 核心方法 ====================

  /** 是否已初始化 */
  private get isReady(): boolean {
    return !!(this.cacheBaseDir && this.indexBaseDir);
  }

  /** 是否可缓存（必须有有效后缀） */
  private isCacheable(url: string): boolean {
    return !!this.getExt(url);
  }

  /** 获取本地缓存路径（同步，仅查内存索引） */
  getLocal(url: string): string | null {
    if (!url || !this.isReady || !this.isCacheable(url)) return null;
    const hash = this.hash(url);
    const prefix = hash.slice(0, 2);
    const shard = this.shards.get(prefix);
    return shard?.[hash] || null;
  }

  /** 验证缓存是否有效，无效则清除 */
  async validateCache(url: string): Promise<string | null> {
    const local = this.getLocal(url);
    if (!local) return null;

    // 从 file:// URL 提取本地路径并验证
    try {
      // convertFileSrc 返回的是 asset:// 或 https://asset.localhost/ 格式
      // 需要重新构建路径来检查
      const hash = this.hash(url);
      const prefix = hash.slice(0, 2);
      const filename = hash + this.getExt(url);
      const filePath = await join(this.cacheBaseDir, prefix, filename);

      if (await exists(filePath)) {
        return local;
      }

      // 缓存失效，清除索引
      this.removeShard(prefix, hash);
      await this.persistShard(prefix);
      return null;
    } catch {
      return null;
    }
  }

  /** 缓存文件（异步） */
  async cache(url: string): Promise<string> {
    if (!url) return "";

    // 无后缀不缓存
    if (!this.isCacheable(url)) return url;

    // 确保已初始化
    await this.init();
    if (!this.isReady) return url;

    const hash = this.hash(url);
    const prefix = hash.slice(0, 2);

    // 先加载分片
    await this.loadShard(prefix);

    // 已缓存，验证有效性
    const shard = this.shards.get(prefix);
    if (shard?.[hash]) {
      const valid = await this.validateCache(url);
      if (valid) return valid;
    }

    // 并发控制
    if (this.inflight.has(hash)) return this.inflight.get(hash)!;

    const promise = this._download(url, hash, prefix);
    this.inflight.set(hash, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(hash);
    }
  }

  /** 预加载分片（优化首次查询） */
  async preloadShard(url: string): Promise<void> {
    if (!url || !this.isCacheable(url)) return;
    await this.init();
    if (!this.isReady) return;
    const prefix = this.hash(url).slice(0, 2);
    await this.loadShard(prefix);
  }

  // ==================== 内部方法 ====================

  private async _download(url: string, hash: string, prefix: string): Promise<string> {
    if (!this.isReady) return url;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();

      // 保存文件: {cacheBaseDir}/{prefix}/{hash}.{ext}
      const subDir = await join(this.cacheBaseDir, prefix);
      await this.ensureDir(subDir);

      const filename = hash + this.getExt(url);
      const filePath = await join(subDir, filename);
      await writeFile(filePath, new Uint8Array(buf));

      // 更新索引
      const localSrc = convertFileSrc(filePath);
      this.updateShard(prefix, hash, localSrc);
      await this.persistShard(prefix);

      return localSrc;
    } catch (e) {
      logger.warn(`[${this.type}Cache] Failed:`, url, e);
      return url;
    }
  }

  private async loadShard(prefix: string): Promise<void> {
    if (this.shards.has(prefix) || !this.isReady) return;

    const indexPath = await join(this.indexBaseDir, `${prefix}.json`);
    try {
      if (await exists(indexPath)) {
        const content = await readTextFile(indexPath);
        this.shards.set(prefix, JSON.parse(content));
      } else {
        this.shards.set(prefix, {});
      }
    } catch {
      this.shards.set(prefix, {});
    }
  }

  private updateShard(prefix: string, hash: string, localPath: string): void {
    let shard = this.shards.get(prefix);
    if (!shard) {
      shard = {};
      this.shards.set(prefix, shard);
    }
    shard[hash] = localPath;
    this.dirtyShards.add(prefix);
  }

  private removeShard(prefix: string, hash: string): void {
    const shard = this.shards.get(prefix);
    if (shard && shard[hash]) {
      delete shard[hash];
      this.dirtyShards.add(prefix);
    }
  }

  private async persistShard(prefix: string): Promise<void> {
    if (!this.dirtyShards.has(prefix) || !this.isReady) return;

    const shard = this.shards.get(prefix);
    if (!shard) return;

    const indexPath = await join(this.indexBaseDir, `${prefix}.json`);
    await writeTextFile(indexPath, JSON.stringify(shard));
    this.dirtyShards.delete(prefix);
  }

  // ==================== 工具方法 ====================

  private hash(url: string): string {
    return SparkMD5.hash(url);
  }

  private getExt(url: string): string {
    try {
      const path = new URL(url).pathname;
      const dot = path.lastIndexOf(".");
      if (dot === -1) return "";
      const ext = path.slice(dot).toLowerCase();
      return VALID_EXTS.test(ext) ? ext : "";
    } catch {
      return "";
    }
  }

  private async ensureDir(dir: string): Promise<void> {
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
  }

  /** 清除所有缓存 */
  async clear(): Promise<void> {
    this.shards.clear();
    this.dirtyShards.clear();
  }
}

// ===================== 单例 =====================

const imageCache = new ShardedCacheManager("image");
const avatarCache = new ShardedCacheManager("avatar");

// ===================== 图片缓存 Hook =====================

export function useImageCache(url: Ref<string> | ComputedRef<string> | string) {
  const urlRef = typeof url === "string" ? ref(url) : url;

  const src = computed(() => {
    const raw = urlRef.value;
    if (!raw) return "";
    return imageCache.getLocal(raw) || raw;
  });

  const cacheOnLoad = () => {
    const raw = urlRef.value;
    if (raw && !imageCache.getLocal(raw)) {
      imageCache.cache(raw);
    }
  };

  return { src, cacheOnLoad };
}

// ===================== 头像缓存 Hook =====================

export function useAvatar(avatar: Ref<string | undefined> | (() => string | undefined)) {
  const getUrl = typeof avatar === "function" ? avatar : () => avatar.value;
  
  const avatarSrc = computed(() => {
    const url = getUrl()?.trim();
    if (!url) return "";
    return avatarCache.getLocal(url) || url;
  });

  const onAvatarLoad = () => {
    const url = getUrl()?.trim();
    if (url && !avatarCache.getLocal(url)) {
      avatarCache.cache(url);
    }
  };

  return { avatarSrc, onAvatarLoad };
}

// ===================== 公共 API =====================

/** 初始化图片缓存 */
export const initImageCache = (userId?: string) => imageCache.init(userId);

/** 初始化头像缓存 */
export const initAvatarCache = (userId?: string) => avatarCache.init(userId);

/** 初始化所有缓存 */
export const initAllCache = async (userId?: string) => {
  await Promise.all([imageCache.init(userId), avatarCache.init(userId)]);
};

/** 预缓存图片 */
export const cacheImage = async (url: string) => {
  await imageCache.init();
  return imageCache.cache(url);
};

/** 预缓存头像 */
export const cacheAvatar = async (url: string) => {
  await avatarCache.init();
  return avatarCache.cache(url);
};

/** 清除图片缓存 */
export const clearImageCache = () => imageCache.clear();

/** 清除头像缓存 */
export const clearAvatarCache = () => avatarCache.clear();

/** 清除所有缓存 */
export const clearAllCache = async () => {
  await Promise.all([imageCache.clear(), avatarCache.clear()]);
};
