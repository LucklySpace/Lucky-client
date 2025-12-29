import { DatabaseManager } from "./DatabaseManager";
import { ColumnMeta, Metadata } from "../annotation/Decorators";

export class SchemaGenerator {

  // 动态获取当前数据库实例
  protected static get database(): DatabaseManager {
    // 优先从 window 取
    const GlobalDB = (window as any).DatabaseManager as typeof DatabaseManager;
    return GlobalDB ? GlobalDB.getInstance() : DatabaseManager.getInstance();
  }

  /** 根据实体装饰器元数据创建表 */
  public static async createTableFor(ctor: Function) {

    // 表名
    const table: string = Reflect.getMetadata(Metadata.TABLE, ctor);
    // 主键
    const pk: { property: string; auto: boolean } = Reflect.getMetadata(Metadata.PRIMARY_KEY, ctor) || {
      property: "id",
      auto: false
    };
    // 列名
    const cols: ColumnMeta[] = Reflect.getMetadata(Metadata.COLUMNS, ctor) || [];

    // 主键列
    const pkMeta = cols.find(c => c.property === pk.property);

    if (!pkMeta) throw new Error(`PrimaryKey property ${pk.property} not decorated as @Column`);

    const parts: string[] = [];

    for (const col of cols) {
      let part = `${col.columnName} ${col.type}`;
      if (col.property === pk.property) {
        part += " PRIMARY KEY";
        if (pk.auto) part += " AUTOINCREMENT";
      }
      if (!col.nullable) part += " NOT NULL";
      parts.push(part);
    }

    const sql = `CREATE TABLE IF NOT EXISTS ${table} (${parts.join(", ")})`;

    await this.database.execute(sql, []);

    // 创建完成后，尝试为已存在表补齐缺失列（向后兼容）
    try {
      await this.addMissingColumnsFor(this.database, table, cols);
    } catch (e) {
      // 仅记录，不阻塞启动
      // eslint-disable-next-line no-console
      console.warn(`[schema] addMissingColumnsFor(${table}) warning:`, (e as any)?.message || e);
    }
  }

  /**
   * 为已存在的数据表补齐缺失列（仅新增，且不处理删除/类型变更）。
   * - 仅当列在实体有定义、且当前表结构缺失时，执行 ALTER TABLE ... ADD COLUMN ...
   * - 对于非空列（nullable=false），这里不强制补默认值，由上层写入时保证。
   */
  private static async addMissingColumnsFor(
    database: DatabaseManager,
    table: string,
    cols: ColumnMeta[]
  ) {
    // 查询现有表结构
    const pragmaRows = await database.query<any>(`PRAGMA table_info(${table})`);
    const existingCols = new Set((pragmaRows || []).map((r: any) => String(r?.name)));

    // 找出缺失列并追加
    for (const col of cols) {
      if (!existingCols.has(col.columnName)) {
        let ddl = `ALTER TABLE ${table} ADD COLUMN ${col.columnName} ${col.type}`;
        if (!col.nullable) {
          // 对非空列追加 NOT NULL（如需默认值，可在此按类型附加 DEFAULT）
          ddl += " NOT NULL";
        }
        await database.execute(ddl, []);
      }
    }

    // 无需兼容历史 alias 字段，统一使用 remark
  }
}
