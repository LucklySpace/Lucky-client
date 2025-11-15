// tauri-store.ts（优化版）
// 说明：对 @tauri-apps/plugin-store 的封装，提供内存缓存、批量防抖写入、单例安全初始化。
// 使用前建议在应用启动时调用 getTauriStore() 初始化一次（例如 main.ts）。

import { Store, StoreOptions } from "@tauri-apps/plugin-store";

/**
 * TauriStore
 * - 单例模式（通过 getInstance / getTauriStore 获取）
 * - 内存缓存（memory），读操作优先读取内存（快速）
 * - 写操作合并到 pendingWrites 并防抖批量写入磁盘（减少 IO）
 * - save 操作串行化，避免并发 save 导致竞态
 */
export class TauriStore {
  private static _initPromise: Promise<TauriStore> | null = null;
  private store!: Store;
  private memory: Record<string, any> = {}; // 内存缓存
  private pendingWrites: Map<string, any> = new Map(); // 待写入项（包括删除：value === undefined）
  private saveTimer: ReturnType<typeof setTimeout> | null = null; // 防抖定时器
  private savingPromise: Promise<void> | null = null; // 正在写入时的 Promise（用于串行化）
  private fileName: string = "app-config.dat";
  private debounceMs: number = 200; // 默认防抖时间（可按需改）

  // 私有构造函数，外部请使用 create 或 getInstance
  private constructor() {
  }

  // 单例控制
  private static _instance: TauriStore | null = null;

  /**
   * 获取已初始化的单例（如果尚未初始化会抛错）
   * 推荐使用 getTauriStore() 工厂方法，它会自动初始化
   */
  static get instance(): TauriStore | null {
    return TauriStore._instance;
  }

  /**
   * 初始化并返回实例（内部 double-check 单例）
   * @param fileName 存储文件名
   * @param options StoreOptions
   * @param debounceMs 防抖时间 ms（写入合并）
   */
  static async create(fileName = "app-config.dat", options?: StoreOptions, debounceMs = 200): Promise<TauriStore> {
    // 防止重复初始化
    if (TauriStore._instance) return TauriStore._instance;

    if (TauriStore._initPromise) {
      // 如果已有初始化在进行中，等待它完成
      return TauriStore._initPromise;
    }

    TauriStore._initPromise = (async () => {
      const inst = new TauriStore();
      inst.fileName = fileName;
      inst.debounceMs = debounceMs;
      // 1) 加载 Store（可能会创建文件）
      inst.store = await Store.load(fileName, options);
      // 2) 将已有条目缓存到内存，避免后续频繁磁盘 IO
      const entries = await inst.store.entries();
      entries.forEach(([key, value]) => {
        inst.memory[key] = value;
      });
      // 设置单例
      TauriStore._instance = inst;
      // 清除 init promise，后续直接返回实例
      TauriStore._initPromise = null;
      return inst;
    })();

    return TauriStore._initPromise;
  }

  /**
   * 异步获取 key（优先从内存拿）
   */
  async get(key: string): Promise<any | null> {
    // 直接返回内存缓存的克隆值，避免外部修改内存对象
    if (key in this.memory) return deepClone(this.memory[key]);
    // 若内存中没有（理论上已加载全部 entries），尝试从 store 读取（兜底）
    try {
      const val = await this.store.get(key);
      if (val !== undefined) {
        this.memory[key] = val;
        return deepClone(val);
      }
      return null;
    } catch (e) {
      console.warn("[TauriStore] get error", e);
      return null;
    }
  }

  /**
   * 异步设置 key 并保存到磁盘（会合并防抖）
   */
  async set(key: string, value: any): Promise<void> {
    // 更新内存
    this.memory[key] = value;
    // 合并到 pendingWrites（最新的覆盖旧的）
    this.pendingWrites.set(key, deepClone(value));
    this.scheduleSave();
  }

  /**
   * 异步删除 key（会合并防抖）
   */
  async remove(key: string): Promise<void> {
    delete this.memory[key];
    // 使用 undefined 标记为删除
    this.pendingWrites.set(key, undefined);
    this.scheduleSave();
  }

  /**
   * 同步读取内存缓存（不会访问磁盘）
   * 返回 null 表示不存在
   */
  getSync(key: string): any | null {
    const v = this.memory[key];
    return v === undefined ? null : deepClone(v);
  }

  /**
   * 同步设置：立即修改内存并在后台异步保存（非阻塞）
   */
  setSync(key: string, value: any): void {
    this.memory[key] = value;
    this.pendingWrites.set(key, deepClone(value));
    this.scheduleSave();
  }

  /**
   * 同步删除：修改内存并在后台异步保存
   */
  removeSync(key: string): void {
    delete this.memory[key];
    this.pendingWrites.set(key, undefined);
    this.scheduleSave();
  }

  /**
   * 强制立即将 pendingWrites 写入磁盘（等待完成）
   * 常用于退出/卸载前确保持久化
   */
  async flush(): Promise<void> {
    // 如果已有 pendingWrites 或 timer，取消定时器并立即写
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this._doSavePending();
  }

  /**
   * 获取所有内存键（只读）
   */
  keys(): string[] {
    return Object.keys(this.memory);
  }

  /**
   * 清空 store（内存 + 磁盘）
   * 注意：会立即保存（调用 store.clear + save）
   */
  async clearAll(): Promise<void> {
    this.memory = {};
    this.pendingWrites.clear();
    // 直接调用 store.clear && save
    try {
      await this.store.clear();
      await this.store.save();
    } catch (e) {
      console.warn("[TauriStore] clearAll error", e);
    }
  }

  /**  ---------------- 内部实现方法 ---------------- */

  // 安排防抖写入
  private scheduleSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this._doSavePending().catch(e => {
        console.warn("[TauriStore] save error", e);
      });
      this.saveTimer = null;
    }, this.debounceMs);
  }

  // 执行写入（串行化）
  private async _doSavePending(): Promise<void> {
    // 如果已有保存进行中，等它完成后再尝试（串行化）
    if (this.savingPromise) {
      await this.savingPromise;
      // 可能在等待期间有新 pendingWrites，继续走下面逻辑以处理新数据
    }

    // 如果没有待保存的数据，直接返回
    if (this.pendingWrites.size === 0) return;

    // 构建要写入的快照并清空 pendingWrites（防止在保存期间多次写）
    const writes: Array<[string, any]> = [];
    for (const [k, v] of this.pendingWrites.entries()) {
      writes.push([k, v]);
    }
    this.pendingWrites.clear();

    // 串行保存：先设置每一项，然后调用一次 save()
    this.savingPromise = (async () => {
      try {
        for (const [k, v] of writes) {
          if (v === undefined) {
            // 删除
            try {
              await this.store.delete(k);
            } catch (e) {
              // log but continue
              console.warn(`[TauriStore] delete key "${k}" failed`, e);
            }
          } else {
            // 写入值（直接存入 JS 对象）
            try {
              await this.store.set(k, v);
            } catch (e) {
              console.warn(`[TauriStore] set key "${k}" failed`, e);
            }
          }
        }
        // 所有 set/delete 完成后统一 save()，把修改刷盘
        await this.store.save();
      } catch (e) {
        console.warn("[TauriStore] _doSavePending error", e);
      } finally {
        // 保存完成，清理 savingPromise
        this.savingPromise = null;
      }
    })();

    await this.savingPromise;
  }
}

/** 深拷贝工具：优先 structuredClone */
function deepClone<T>(v: T): T {
  // @ts-ignore
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

/** 单例便利方法：在 app 启动时调用以初始化 */
let _tauriStorePromise: Promise<TauriStore> | null = null;

export async function getTauriStore(
  fileName = import.meta.env.VITE_APP_STORE,
  options?: StoreOptions
): Promise<TauriStore> {
  if (TauriStore.instance) return TauriStore.instance;
  if (!_tauriStorePromise) {
    _tauriStorePromise = TauriStore.create(fileName, options);
    // 初始化完成后清理 promise（让后续直接返回实例）
    try {
      const inst = await _tauriStorePromise;
      _tauriStorePromise = null;
      return inst;
    } catch (e) {
      _tauriStorePromise = null;
      throw e;
    }
  }
  return _tauriStorePromise;
}

/**
 * tauriStorage：兼容 StorageLike（localStorage 风格）的适配器
 * 注意：local 使用的是同步 getItem/setItem 接口（Pinia persist 插件可能会以同步方式调用）
 * 因此这里提供同步行为基于内存缓存（getSync / setSync）。
 *
 * 强烈建议在应用启动早期调用 await getTauriStore() 以完成初始化，
 * 否则在第一次使用 tauriStorage.getItem 时会返回 null 并发出警告。
 */
export const tauriStorage = {
  getItem(key: string): string | null {
    const inst = TauriStore.instance;
    if (!inst) {
      console.warn("[tauriStorage] 尚未初始化，请在应用启动时调用 await getTauriStore()");
      return null;
    }
    const val = inst.getSync(key);
    return val == null ? null : JSON.stringify(val);
  },
  setItem(key: string, value: string): void {
    const inst = TauriStore.instance;
    if (!inst) {
      console.warn("[tauriStorage] 尚未初始化，请在应用启动时调用 await getTauriStore()");
      return;
    }
    // value 是字符串（localStorage 风格），尝试 parse
    let parsed: any;
    try {
      parsed = JSON.parse(value);
    } catch {
      // 如果不是 JSON 字符串，就直接存字符串
      parsed = value;
    }
    inst.setSync(key, parsed);
  },
  removeItem(key: string): void {
    const inst = TauriStore.instance;
    if (!inst) {
      console.warn("[tauriStorage] 尚未初始化，请在应用启动时调用 await getTauriStore()");
      return;
    }
    inst.removeSync(key);
  }
};
