import Database, { QueryResult } from "@tauri-apps/plugin-sql";

export interface DatabaseManagerOptions {
  /** 选择不同的数据库实例：'default' | 'index' */
  database?: "default" | "index";
  /** 自定义数据库文件名，若不传则从 env 中读取 */
  customPath?: string;
}

/**
 * 数据源工具
 */
export class DatabaseManager {
  /** 单例引用 */
  private static instance: DatabaseManager;
  /** 底层连接对象 */
  private conn: Database | null = null;
  /** 当前数据库标识，用于 close */
  private connPath!: string;

  private constructor(private opts: DatabaseManagerOptions) {
  }

  /**
   * 获取单例
   * @param opts 初次调用可传入配置，后续调用无效
   */
  public static getInstance(opts: DatabaseManagerOptions = {}): DatabaseManager {
    if (!this.instance) {
      this.instance = new DatabaseManager(opts);
    }
    return this.instance;
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
