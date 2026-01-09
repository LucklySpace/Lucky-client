/**
 * 缓存数据项接口
 */
interface StorageItem<T = any> {
  value: T;
  expire?: number | null;
}

/**
 * 缓存存储类
 * 支持过期时间、前缀管理、类型安全
 */
export class Storage {
  /**
   * 缓存前缀
   */
  private readonly prefix: string;

  /**
   * 缓存区域 (localStorage 或 sessionStorage)
   */
  private readonly storage: globalThis.Storage;

  constructor(prefix = "", storage: globalThis.Storage = localStorage) {
    this.prefix = prefix;
    this.storage = storage;
  }

  /**
   * 拼接缓存键名: 前缀_key
   * @param key 缓存KEY
   * @returns 完整的缓存键名
   */
  private cacheKey(key: string): string {
    return `${this.prefix}_${key}`;
  }

  /**
   * 获取缓存值
   * @param key 缓存KEY
   * @param def 默认值
   * @returns 缓存值或默认值
   */
  get<T = any>(key: string, def?: T): T {
    try {
      const item = this.storage.getItem(this.cacheKey(key));
      if (!item) return def as T;

      const parsed: StorageItem<T> = JSON.parse(item);
      const { value, expire } = parsed;

      // 检查是否过期
      if (expire !== undefined && expire !== null) {
        if (expire >= Date.now()) {
          return value;
        }
        // 过期则删除
        this.remove(key);
        return def as T;
      }

      return value;
    } catch (error) {
      console.warn(`Storage get error for key "${key}":`, error);
      return def as T;
    }
  }

  /**
   * 设置缓存
   * @param key 缓存KEY
   * @param value 缓存值
   */
  set<T = any>(key: string, value: T): void {
    try {
      const item: StorageItem<T> = { value };
      this.storage.setItem(this.cacheKey(key), JSON.stringify(item));
    } catch (error) {
      console.error(`Storage set error for key "${key}":`, error);
    }
  }

  /**
   * 设置带过期时间的缓存
   * @param key 缓存KEY
   * @param value 缓存值
   * @param expire 过期时间(秒)，null 表示永不过期，默认一天
   */
  setExpire<T = any>(key: string, value: T, expire: number | null = 60 * 60 * 24): void {
    try {
      const item: StorageItem<T> = {
        value,
        expire: expire !== null ? Date.now() + expire * 1000 : null
      };
      this.storage.setItem(this.cacheKey(key), JSON.stringify(item));
    } catch (error) {
      console.error(`Storage setExpire error for key "${key}":`, error);
    }
  }

  /**
   * 删除缓存
   * @param key 缓存KEY
   */
  remove(key: string): void {
    try {
      this.storage.removeItem(this.cacheKey(key));
    } catch (error) {
      console.error(`Storage remove error for key "${key}":`, error);
    }
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    try {
      this.storage.clear();
    } catch (error) {
      console.error("Storage clear error:", error);
    }
  }

  /**
   * 检查键是否存在
   * @param key 缓存KEY
   */
  has(key: string): boolean {
    return this.storage.getItem(this.cacheKey(key)) !== null;
  }
}

export const storage = new Storage("im", localStorage);


/**
 * Cookie 管理类
 * 提供 Cookie 的增删改查操作
 */
export class Cookies {
  /**
   * 设置 Cookie
   * @param key Cookie 键名
   * @param value Cookie 值
   * @param maxAge 过期时间(秒)，默认会话结束
   * @param path Cookie 路径，默认 '/'
   * @param domain Cookie 域名
   * @param secure 是否仅 HTTPS 传输
   */
  set(
    key: string,
    value: string,
    maxAge?: number,
    path: string = "/",
    domain?: string,
    secure: boolean = false
  ): void {
    if (!key) {
      console.warn("Cookie key cannot be empty");
      return;
    }

    let cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    
    if (maxAge !== undefined) {
      cookie += `;max-age=${maxAge}`;
    }
    if (path) {
      cookie += `;path=${path}`;
    }
    if (domain) {
      cookie += `;domain=${domain}`;
    }
    if (secure) {
      cookie += ";secure";
    }

    document.cookie = cookie;
  }

  /**
   * 获取 Cookie
   * @param key Cookie 键名
   * @returns Cookie 值，不存在则返回空字符串
   */
  get(key: string): string {
    if (!key) return "";

    const cookies = document.cookie.split("; ");
    const prefix = `${encodeURIComponent(key)}=`;

    for (const cookie of cookies) {
      if (cookie.startsWith(prefix)) {
        return decodeURIComponent(cookie.substring(prefix.length));
      }
    }

    return "";
  }

  /**
   * 删除 Cookie
   * @param key Cookie 键名
   * @param path Cookie 路径
   * @param domain Cookie 域名
   */
  remove(key: string, path: string = "/", domain?: string): void {
    this.set(key, "", -1, path, domain);
  }

  /**
   * 检查 Cookie 是否存在
   * @param key Cookie 键名
   * @returns 是否存在
   */
  has(key: string): boolean {
    if (!key) return false;
    
    const cookies = document.cookie.split("; ");
    const prefix = `${encodeURIComponent(key)}=`;

    return cookies.some(cookie => cookie.startsWith(prefix));
  }

  /**
   * 清空所有 Cookie
   */
  clearAll(): void {
    const cookies = document.cookie.split("; ");
    
    for (const cookie of cookies) {
      const [key] = cookie.split("=");
      if (key) {
        this.remove(decodeURIComponent(key.trim()));
      }
    }
  }
}

export const cookies = new Cookies();


/**
 * IndexedDB 工具类
 * 提供 Promise 风格的 IndexedDB 操作封装
 */
export class IndexedDBHelper<T = any> {
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly keyPath: string;
  private db: IDBDatabase | null = null;

  constructor(dbName: string, storeName: string, keyPath: string) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.keyPath = keyPath;
  }

  /**
   * 打开数据库连接
   * @param version 数据库版本号，默认 1
   * @returns Promise<IDBDatabase>
   */
  async openDB(version: number = 1): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, version);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: this.keyPath });
          console.info(`IndexedDB: Created object store "${this.storeName}"`);
        }
      };

      request.onsuccess = (event: Event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.info(`IndexedDB: Database "${this.dbName}" opened successfully`);
        resolve(this.db);
      };

      request.onerror = (event: Event) => {
        const error = (event.target as IDBOpenDBRequest).error;
        console.error(`IndexedDB: Failed to open database "${this.dbName}"`, error);
        reject(error);
      };
    });
  }

  /**
   * 添加或更新数据
   * @param data 数据对象
   * @returns Promise<void>
   */
  async putData(data: T): Promise<IDBValidKey> {
    if (!this.db) throw new Error("Database not opened. Call openDB() first.");

    return new Promise<IDBValidKey>((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.put(data);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error("IndexedDB: Error adding/updating data", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 获取数据
   * @param key 键值
   * @returns Promise<T | undefined>
   */
  async getData(key: IDBValidKey): Promise<T | undefined> {
    if (!this.db) throw new Error("Database not opened. Call openDB() first.");

    return new Promise<T | undefined>((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error("IndexedDB: Error retrieving data", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 获取所有数据
   * @returns Promise<T[]>
   */
  async getAllData(): Promise<T[]> {
    if (!this.db) throw new Error("Database not opened. Call openDB() first.");

    return new Promise<T[]>((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error("IndexedDB: Error getting all data", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 删除数据
   * @param key 键值
   * @returns Promise<void>
   */
  async deleteData(key: IDBValidKey): Promise<void> {
    if (!this.db) throw new Error("Database not opened. Call openDB() first.");

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error("IndexedDB: Error deleting data", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 清空对象存储
   * @returns Promise<void>
   */
  async clearStore(): Promise<void> {
    if (!this.db) throw new Error("Database not opened. Call openDB() first.");

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.info(`IndexedDB: Store "${this.storeName}" cleared successfully`);
        resolve();
      };

      request.onerror = () => {
        console.error("IndexedDB: Error clearing store", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 关闭数据库连接
   */
  closeDB(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.info(`IndexedDB: Database "${this.dbName}" connection closed`);
    }
  }
}