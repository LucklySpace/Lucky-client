import Database from "@tauri-apps/plugin-sql";

/**
 * 数据库连接池
 */
class ConnectionPool {
  private pool: any[] = [];
  private maxPoolSize: number;
  private dbPath: string;

  constructor(dbPath: string, maxPoolSize = 5) {
    this.dbPath = dbPath;
    this.maxPoolSize = maxPoolSize;
  }

  public async getConnection() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }

    if (this.pool.length < this.maxPoolSize) {
      const connection = await this.createConnection();
      return connection;
    }

    throw new Error("Connection pool limit reached");
  }

  public releaseConnection(connection: any) {
    this.pool.push(connection);
  }

  private async createConnection() {
    return await Database.load(this.dbPath);
  }
}

export default class Sqlite {

  private connectionPool: ConnectionPool;

  constructor(database: string = "default") {

    let dbPath: any;

    // 指定索引库
    if (database == "index") {
      dbPath = import.meta.env.VITE_APP_DATABASE_INDEX;
    }
    // 指定数据库
    if (database == "default") {
      dbPath = import.meta.env.VITE_APP_DATABASE;
    }

    this.connectionPool = new ConnectionPool(dbPath);
  }

  async execute(sql: string, params: any[] = []) {
    const connection = await this.connectionPool.getConnection();
    try {
      return await connection.execute(sql, params);
    } catch (error) {
      console.error("Error executing execute:", error);
      throw error;
    } finally {
      this.connectionPool.releaseConnection(connection);
    }
  }

  async query(sql: string, params: any[] = []) {
    const connection = await this.connectionPool.getConnection();
    try {
      return await connection.select(sql, params);
    } catch (error) {
      console.error("Error executing query:", error);
      return [];
      //throw error;
    } finally {
      this.connectionPool.releaseConnection(connection);
    }
  }


  async beginTransaction() {
    const connection = await this.connectionPool.getConnection();
    try {
      return await connection.execute("BEGIN TRANSACTION;", []);
    } catch (error) {
      console.error("Error executing execute:", error);
      throw error;
    } finally {
      this.connectionPool.releaseConnection(connection);
    }
  }

  async commit() {
    const connection = await this.connectionPool.getConnection();
    try {
      return await connection.execute("COMMIT;", []);
    } catch (error) {
      console.error("Error executing execute:", error);
      throw error;
    } finally {
      this.connectionPool.releaseConnection(connection);
    }
  }

  async rollback() {
    const connection = await this.connectionPool.getConnection();
    try {
      return await connection.execute("ROLLBACK;", []);
    } catch (error) {
      console.error("Error executing execute:", error);
      throw error;
    } finally {
      this.connectionPool.releaseConnection(connection);
    }
  }
}


