export class Storage {
  /**
   * 缓存前缀
   */
  prefix = "";

  /**
   *  缓存区域, 默认 localStorage
   */
  storage: any = localStorage;

  constructor(prefix = "", storage: any) {
    this.prefix = prefix;
    this.storage = storage;
  }

  /**
   * 拼接缓存键名  前缀+key
   * @param key 缓存KEY
   * @returns
   */
  cacheKey(key: string) {
    return `${this.prefix}_${key}`;
  }

  /**
   * @param key 缓存KEY
   * @param def 空值返回
   * @returns 键值
   */
  get(key: string, def = "") {
    const item = this.storage.getItem(this.cacheKey(key));
    if (!item) return def;
    try {
      const { value, expire } = JSON.parse(item);
      // 判断有无时间，有则处理是否过期返回，无则直接返回
      if (expire) {
        // 在有效期内直接返回
        if (expire === null || expire >= Date.now()) {
          return value;
        }
        this.remove(key);
      } else {
        return value;
      }
    } catch (e) {

    }
    return def;
  }


  /**
   * 设置缓存
   * @param key  缓存KEY
   * @param value 缓存值
   */
  set(key: string, value: any) {
    this.storage.setItem(
      this.cacheKey(key),
      JSON.stringify({ value })
    );
  }


  /**
   * 设置过期缓存
   * @param  key 缓存KEY
   * @param  value 缓存值
   * @param  expire 缓存时间单位秒,默认一天
   */
  setExpire(key: string, value: any, expire: number | null = 60 * 60 * 24) {
    this.storage.setItem(
      this.cacheKey(key),
      JSON.stringify({
        value,
        expire: expire !== null ? new Date().getTime() + expire * 1000 : null
      })
    );
  }

  remove(key: string) {
    this.storage.removeItem(this.cacheKey(key));
  }

  clear() {
    this.storage.clear();
  }
}

export const storage = new Storage("im", localStorage);


/**
 * @file cookie
 * @param {get} 获取cookie
 * @param {remove} 删除cookie
 * @param {set} 添加cookie
 */
export class Cookies {

  constructor() {
  }

  /**
   * 添加cookie
   * @param key
   * @param value
   * @param overSeconds
   */
  set(key: any, value: string, overSeconds?: number) {
    document.cookie = `${key}=${value};max-age=${overSeconds}`;
  }

  /**
   * 删除cookie
   * @param cookieKey
   */
  remove(key: any) {
    this.set(key, "", -1);
  }

  /**
   * 获取cookie
   * @param key
   * @returns
   */
  get(key: string) {
    const cookies = document.cookie;
    const list = cookies.split("; "); // 解析出名/值对列表
    for (let i = 0; i < list.length; i++) {
      const arr = list[i].split("="); // 解析出名和值
      if (arr[0] == key) {
        return decodeURIComponent(arr[1]);
      } // 对cookie值解码
    }
    return "";
  }

  isCookieKey(key: string) {
    const arr = document.cookie.split(";");
    for (let i = 0; i < arr.length; i++) {
      const arr2 = arr[i].split("=");
      if (arr2[0].trim() == key) {
        return true;
      }
    }
    return false;
  }

}

export const cookies = new Cookies();


/**
 * IndexedDB 工具类
 */
export class IndexedDBHelper {

  dbName: string;
  storeName: string;
  keyPath: string;
  db: any;

  constructor(dbName: string, storeName: string, keyPath: string) {
    this.dbName = dbName; // IndexedDB 数据库名称
    this.storeName = storeName; // 对象存储名称
    this.keyPath = keyPath; // 索引键路径
    this.db = null; // 数据库连接
  }

  // 打开数据库连接
  openDB() {
    const request = indexedDB.open(this.dbName, 1); // 版本号为 1

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(this.storeName)) {
        db.createObjectStore(this.storeName, { keyPath: this.keyPath }); // 创建对象存储
      }
    };

    request.onsuccess = (event: any) => {
      this.db = event.target.result; // 存储数据库连接
      console.log("Database opened successfully");
    };

    request.onerror = (event: any) => {
      console.error("Database error:", event.target.error);
    };
  }

  // 添加或更新数据
  putData(data: any) {
    const transaction = this.db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);
    const request = store.put(data);

    request.onsuccess = () => {
      console.log("Data added/updated successfully");
    };

    request.onerror = (event: any) => {
      console.error("Error adding/updating data:", event.target.error);
    };
  }

  // 从数据库中获取数据
  getData(key: string) {
    const transaction = this.db.transaction([this.storeName]);
    const store = transaction.objectStore(this.storeName);
    const request = store.get(key);

    request.onsuccess = (event: any) => {
      console.log("Data retrieved successfully", event.target.result);
    };

    request.onerror = (event: any) => {
      console.error("Error retrieving data:", event.target.error);
    };
  }

  // 删除数据
  deleteData(key: string) {
    const transaction = this.db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);
    const request = store.delete(key);

    request.onsuccess = () => {
      console.log("Data deleted successfully");
    };

    request.onerror = (event: any) => {
      console.error("Error deleting data:", event.target.error);
    };
  }

  // 清空对象存储
  clearStore() {
    const transaction = this.db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);
    const request = store.clear();

    request.onsuccess = () => {
      console.log("Store cleared successfully");
    };

    request.onerror = (event: any) => {
      console.error("Error clearing store:", event.target.error);
    };
  }

  // 关闭数据库连接
  closeDB() {
    if (this.db) {
      this.db.close();
      console.log("Database connection closed");
    }
  }
}

// // 使用示例
// const dbHelper = new IndexedDBHelper('myDatabase', 'myObjectStore', 'id'); // 假设使用 'id' 作为键路径
// dbHelper.openDB();
// // 执行操作...
// dbHelper.closeDB();