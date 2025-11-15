import { onBeforeUnmount, ref } from "vue";
import Database from "@tauri-apps/plugin-sql";
import { useLogger } from "./useLogger";

/**
 * Sqlite Hook 返回的接口
 */
export interface SqliteHook {
  /** 执行不返回结果的 SQL，如 INSERT/UPDATE/DELETE */
  execute(sql: string, params?: unknown[]): Promise<unknown>;

  /** 执行查询，返回所有记录 */
  query<T = any[]>(sql: string, params?: unknown[]): Promise<T>;

  /** 开始事务 */
  begin(): Promise<void>;

  /** 提交事务 */
  commit(): Promise<void>;

  /** 回滚事务 */
  rollback(): Promise<void>;

  /** 手动关闭数据库连接（组件卸载时也会自动调用） */
  close(): Promise<void>;
}

/**
 * useSqlite：构造 SQLite 访问 Hook
 *
 * @param database 'default' | 'index' —— 选择不同 env 配置
 */
export function useSqlite(database: "default" | "index" = "default"): SqliteHook {
  // 日志
  const log = useLogger();

  // 根据参数读取环境变量配置路径
  const dbPath = database === "index"
    ? import.meta.env.VITE_APP_DATABASE_INDEX
    : import.meta.env.VITE_APP_DATABASE;

  // 缓存唯一连接实例，确保惰性加载
  const connRef = ref<Database | null>(null);

  /** 获取 Connection 实例，首次调用自动 load */
  async function getConnection(): Promise<Database> {
    if (connRef.value) return connRef.value;
    const conn = await Database.load(`sqlite:${dbPath}`);
    connRef.value = conn;
    return conn;
  }

  /**
   * 执行 SQL 语句，无返回结果
   * @param sql SQL 字符串
   * @param params 可选参数数组
   */
  async function execute(sql: string, params: unknown[] = []) {
    const conn = await getConnection();
    return conn.execute(sql, params);
  }

  /**
   * 执行查询，返回所有结果记录数组
   * @param sql SQL 查询
   * @param params 可选参数
   */
  async function query<T = any[]>(sql: string, params: unknown[] = []): Promise<T> {
    try {
      const conn = await getConnection();
      return await conn.select<T>(sql, params);
    } catch (e) {
      log.error("useSqlite query error:", e);
      return [] as T;
    }
  }

  /** 开始事务 */
  async function begin() {
    const conn = await getConnection();
    await conn.execute("BEGIN");
  }

  /** 提交事务 */
  async function commit() {
    const conn = await getConnection();
    await conn.execute("COMMIT");
  }

  /** 回滚事务 */
  async function rollback() {
    const conn = await getConnection();
    await conn.execute("ROLLBACK");
  }

  /**
   * 手动关闭连接，释放资源
   * 通常由组件卸载时调用，自动触发
   */
  async function close() {
    if (connRef.value) {
      const conn = await getConnection();
      conn.close();
      connRef.value = null;
    }
  }

  // 组件卸载自动关闭连接
  onBeforeUnmount(() => {
    close().catch(err => log.error("useSqlite close error:", err));
  });

  // 返回接口
  return { execute, query, begin, commit, rollback, close };
}

