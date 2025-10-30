import { DatabaseManager } from "./DatabaseManager";
import { ColumnMeta, Metadata } from "../annotation/Decorators";

export class SchemaGenerator {
  /** 根据实体装饰器元数据创建表 */
  public static async createTableFor(ctor: Function) {
    // 获取数据源
    const database: DatabaseManager = DatabaseManager.getInstance();
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

    await database.execute(sql, []);
  }
}
