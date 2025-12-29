import Database, { QueryResult } from "@tauri-apps/plugin-sql";
import { mkdir, exists } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

export interface DatabaseManagerOptions {
  /** 选择不同的数据库实例：'default' | 'index' */
  database?: "default" | "index";
  /** 自定义数据库文件名，若不传则从 env 中读取 */
  customPath?: string;
}

/**
 * 数据源工具：支持多实例管理
 */
export class DatabaseManager {
  /** 实例池：根据 key 管理多个实例 */
  private static instances: Map<string, DatabaseManager> = new Map();
  /** 全局用户ID，用于隔离数据库 */
  private static userId: string = "";
  /** 是否已设置用户ID（就绪） */
  public static isReady(): boolean {
    return typeof this.userId === "string" && this.userId.trim().length > 0;
  }
  /** 断言已设置用户ID（默认数据库不允许匿名使用） */
  public static assertReady(): void {
    if (!this.isReady()) {
      throw new Error("Database not initialized: userId required");
    }
  }

  /** 底层连接对象 */
  private conn: Database | null = null;
  /** 当前数据库标识，用于 close */
  private connPath!: string;

  /** 私有构造，强制通过 getInstance 获取 */
  private constructor(private opts: DatabaseManagerOptions) {
  }

  /**
   * 设置全局用户ID并重置连接
   * @param userId 用户ID
   */
  public static async setUserId(userId: string) {
    if (this.userId === userId) return;
    this.userId = userId;
    // 关闭所有现有连接
    for (const instance of this.instances.values()) {
      await instance.close();
    }
    // 清空实例池，下次 getInstance 会创建新实例
    this.instances.clear();
  }

  /**
   * 获取或创建实例
   * @param opts 初次调用可传入配置，后续调用相同 key 时返回已有实例
   */
  public static getInstance(opts: DatabaseManagerOptions = {}): DatabaseManager {
    // 生成唯一 key：优先 customPath，其次 database
    const key = opts.customPath ?? (opts.database === "index" ? "index" : "default");
    if (!this.instances.has(key)) {
      this.instances.set(key, new DatabaseManager(opts));
    }
    return this.instances.get(key)!;
  }

  /**
   * 清除指定实例（或全部）
   * @param opts 可选，指定要清除的实例 key
   */
  public static clearInstance(opts?: DatabaseManagerOptions) {
    if (!opts) {
      // 清空所有实例
      this.instances.clear();
      return;
    }
    const key = opts.customPath ?? (opts.database === "index" ? "index" : "default");
    this.instances.delete(key);
  }

  /**
   * 执行非查询 SQL（INSERT/UPDATE/DELETE），返回底层执行结果
   * @param sql    SQL 语句
   * @param params 占位符参数
   */
  public async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const conn = await this.getConnection();
    return conn.execute(sql, params);
  }

  /**
   * 执行查询 SQL，返回结果数组
   * @param sql    查询语句
   * @param params 占位符参数
   */
  public async query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const conn = await this.getConnection();
    const result: any = await conn.select<T>(sql, params);
    return result || [];
  }

  /** 开始事务 */
  public async beginTransaction(): Promise<void> {
    const conn = await this.getConnection();
    await conn.execute("BEGIN");
  }

  /** 提交事务 */
  public async commit(): Promise<void> {
    const conn = await this.getConnection();
    await conn.execute("COMMIT");
  }

  /** 回滚事务 */
  public async rollback(): Promise<void> {
    const conn = await this.getConnection();
    await conn.execute("ROLLBACK");
  }

  /** 关闭连接并释放资源 */
  public async close(): Promise<void> {
    if (!this.conn) return;
    const conn = await this.getConnection();
    await conn.close(this.connPath);
    this.conn = null;
    // 同时清除实例池中对应实例
    DatabaseManager.clearInstance(this.opts);
  }

  /** 懒加载并返回 Database 连接 */
  private async getConnection(): Promise<Database> {
    if (this.conn) return this.conn;
    
    // 获取原始配置路径
    let dbPath =
      this.opts.customPath ??
      (this.opts.database === "index" ? import.meta.env.VITE_APP_DATABASE_INDEX : import.meta.env.VITE_APP_DATABASE);

    // 未设置 userId 且未指定 customPath，不允许使用默认数据库
    if (!DatabaseManager.isReady() && !this.opts.customPath) {
      throw new Error("Database connection denied: require login and userId");
    }

    // 如果设置了 userId，则需要隔离数据库
    if (DatabaseManager.userId && !this.opts.customPath) {
      // 假设 dbPath 格式为 "sqlite:filename.db" 或 "filename.db"
      const prefix = "sqlite:";
      let fileName = dbPath;
      if (dbPath.startsWith(prefix)) {
        fileName = dbPath.substring(prefix.length);
      }

      // 构造用户专属路径: users/{userId}/{fileName}
      const userDir = `users/${DatabaseManager.userId}`;
      
      // 确保目录存在
      try {
        const baseDir = await appDataDir();
        const fullUserDir = await join(baseDir, userDir);
        const dirExists = await exists(fullUserDir);
        if (!dirExists) {
            await mkdir(fullUserDir, { recursive: true });
        }
      } catch (e) {
        console.error("Failed to create user database directory", e);
      }

      // 更新连接路径
      dbPath = `${prefix}${userDir}/${fileName}`;
    }

    this.connPath = `${dbPath}`;

    this.conn = await Database.load(this.connPath);
    return this.conn;
  }
}
