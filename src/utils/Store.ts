import { Store as TauriStore } from "@tauri-apps/plugin-store";
import { type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Store - 封装 Tauri Store，提供简单的存取与监听
 */
export class Store {
  private store: TauriStore;

  /**
   * 私有构造，使用默认路径
   */
  constructor() {
    // 数据文件存放在 ${APP_DATA}/store.json
    this.store = new TauriStore("store.json");
  }

  /**
   * 设置 key 的值
   */
  public async set(key: string, value: unknown): Promise<void> {
    await this.store.set(key, value);
  }

  /**
   * 获取 key 的值，若不存在则返回 null
   */
  public async get<T>(key: string): Promise<T | null> {
    return this.store.get<T>(key);
  }

  /**
   * 判断 key 是否存在
   */
  public async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  /**
   * 删除 key，返回 true 表示存在并已删除
   */
  public async delete(key: string): Promise<boolean> {
    const result = await this.store.delete(key);
    await this.save();
    return result;
  }

  /**
   * 清空全部数据
   */
  public async clear(): Promise<void> {
    await this.store.clear();
    await this.save();
  }

  /**
   * 重置到默认（如有）
   */
  public async reset(): Promise<void> {
    await this.store.reset();
    await this.save();
  }

  /**
   * 获取所有 keys
   */
  public async keys(): Promise<string[]> {
    return this.store.keys();
  }

  /**
   * 获取所有 values
   */
  public async values<T>(): Promise<T[]> {
    return this.store.values<T>();
  }

  /**
   * 获取所有 entries
   */
  public async entries<T>(): Promise<Array<[string, T]>> {
    return this.store.entries<T>();
  }

  /**
   * 获取长度
   */
  public async length(): Promise<number> {
    return this.store.length();
  }

  /**
   * 强制从磁盘加载
   */
  public async load(): Promise<void> {
    await this.store.load();
  }

  /**
   * 强制保存到磁盘
   */
  public async save(): Promise<void> {
    await this.store.save();
  }

  /**
   * 监听单个 key 变化
   */
  public async onKeyChange<T>(
    key: string,
    cb: (value: T | null) => void
  ): Promise<UnlistenFn> {
    return this.store.onKeyChange<T>(key, cb);
  }

  /**
   * 监听所有数据变化
   */
  public async onChange<T>(cb: (key: string, value: T | null) => void): Promise<UnlistenFn> {
    return this.store.onChange<T>(cb);
  }
}

export const store = new Store();
