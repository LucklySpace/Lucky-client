import Database, { QueryResult } from "@tauri-apps/plugin-sql";

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
  /** 底层连接对象 */
  private conn: Database | null = null;
  /** 当前数据库标识，用于 close */
  private connPath!: string;

  /** 私有构造，强制通过 getInstance 获取 */
  private constructor(private opts: DatabaseManagerOptions) {
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
    // 决定使用哪个路径
    const dbPath =
      this.opts.customPath ??
      (this.opts.database === "index" ? import.meta.env.VITE_APP_DATABASE_INDEX : import.meta.env.VITE_APP_DATABASE);

    this.connPath = `${dbPath}`;

    this.conn = await Database.load(this.connPath);
    return this.conn;
  }
}
