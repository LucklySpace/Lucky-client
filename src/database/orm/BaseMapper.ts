import { DatabaseManager } from "./core/DatabaseManager";
import { SchemaGenerator } from "./core/SchemaGenerator";
import { QueryBuilder, SqlFragment } from "./query/QueryBuilder";
import { ColumnMeta, Metadata } from "./annotation/Decorators";
import XMLSQLParser from "./parser/XMLSQLParser";

export interface PageResult<T> {
  records?: T[] | null;
  total?: number;
  page?: number;
  size?: number;
}

// 日志
const log = useLogger();

/**
 * 通用 CRUD Mapper，T 必须是带了 @Entity/@Column/@PrimaryKey 的类
 */
export class BaseMapper<T extends Record<string, any>> {
  protected tableName: string; // 表名
  protected pkCol: ColumnMeta; // 主键
  protected cols: ColumnMeta[]; // 列
  protected database: DatabaseManager; // 数据源
  protected sqlMap: Map<string, string> = new Map(); // sql语句映射

  /**
   * @param ctor 目标实体的 class  引用，用于读取装饰器元数据
   */
  constructor(protected ctor: new () => T) {
    // 获取数据源
    this.database = DatabaseManager.getInstance();
    // 读取 @Entity 对应的表名
    this.tableName = Reflect.getMetadata(Metadata.TABLE, ctor);

    // 读取所有 @Column
    this.cols = Reflect.getMetadata(Metadata.COLUMNS, ctor) || [];

    // 读取 @PrimaryKey
    const pkMeta = Reflect.getMetadata(Metadata.PRIMARY_KEY, ctor);

    this.pkCol = this.cols.find(c => c.property === pkMeta.property)!;

    this.ensureTable();
  }

  /**
   * 插入实体，返回新生成的自增主键
   */
  async insert(entity: T | Partial<T>): Promise<any> {
    const names = this.cols.map(c => c.columnName).join(", ");
    const placeholders = this.cols.map(() => "?").join(", ");
    const params = this.cols.map(c => entity[c.property]);

    const res = await this.database.execute(
      `INSERT INTO ${this.tableName} (${names}) VALUES (${placeholders})`,
      params
    );

    return res;
  }

  /**
   * 批量插入（只插入 this.cols 中定义的列，使用参数化，支持分批）
   * @param data 要插入的实体数组
   * @param extraData 当实体缺失某列字段时可提供的补充字段（按 property 名匹配）
   * @returns 成功提交的记录数（估算）
   */
  async batchInsert(data: Array<Partial<T>>, extraData?: Partial<T>, batchSize = 200): Promise<number> {
    if (!data || data.length === 0) return 0;

    // 确保使用 mapper 定义的列（按 column meta 顺序）
    const colsMeta = Array.isArray(this.cols) ? this.cols : [];
    if (colsMeta.length === 0) {
      log?.prettyWarn?.("database", "batchInsert: no target columns found, skip");
      return 0;
    }

    const columnNames = colsMeta.map(c => c.columnName);
    const props = colsMeta.map(c => c.property); // property 对应实体字段名

    let totalInserted = 0;

    try {
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);

        // 每行占位符： (?,?,...)
        const rowPlaceholders = `(${props.map(() => "?").join(",")})`;

        const placeholders = batch.map(() => rowPlaceholders).join(", ");

        // 参数扁平化：按 props 顺序取值，优先 item[prop]，其次 extraData[prop]，否则 null
        const params: unknown[] = [];
        for (const item of batch) {
          for (const prop of props) {
            const val = (item as any)[prop];
            if (typeof val !== "undefined") {
              params.push(val);
            } else if (extraData && typeof (extraData as any)[prop] !== "undefined") {
              params.push((extraData as any)[prop]);
            } else {
              params.push(null);
            }
          }
        }

        const sql = `INSERT INTO ${this.tableName} (${columnNames.join(",")}) VALUES ${placeholders}`;

        await this.database.execute(sql, params);

        totalInserted += batch.length;
      }
    } catch (err) {
      log?.prettyError?.("database", "batchInsert error", err);
      // 抛出或返回已插入数量，视你的调用约定；这里选择抛出以便上层感知失败
      throw err;
    }

    log?.colorLog?.(
      "database",
      `batchInsert (executor) inserted ${totalInserted} rows into ${this.tableName}`,
      "success"
    );
    return totalInserted;
  }

  /**
   * 根据主键删除，返回受影响行数
   */
  async deleteById(id: unknown, columnName: string = this.pkCol.columnName): Promise<any> {
    const res = await this.database.execute(`DELETE FROM ${this.tableName} WHERE ${columnName} = ?`, [id]);
    // @ts-ignore changes
    return res;
  }

  /**
   * 根据主键更新，返回受影响行数
   */
  async updateById(id: number | string, entity: T | Partial<T>): Promise<any> {
    const sets: string[] = [];
    const params: unknown[] = [];

    // 遍历列定义（this.cols），但只对 entity 明确提供的字段生成 set 子句
    for (const col of this.cols) {
      // 跳过主键列
      if (col.property === this.pkCol.property) continue;

      // 仅当 entity 明确包含该属性（hasOwnProperty）且值 !== undefined 时才更新
      // 这样可以允许你传入 null（将写入 null），但会跳过未提供的字段
      if (!Object.prototype.hasOwnProperty.call(entity, col.property)) continue;
      const value = (entity as any)[col.property];
      if (value === undefined) continue;

      sets.push(`${col.columnName} = ?`);
      params.push(value);
    }

    // 如果没有任何要更新的字段，直接返回（避免执行无效的 UPDATE 语句）
    if (sets.length === 0) {
      // 这里返回与 database.execute 相似的“空更新”形态；根据你的 DB wrapper 可能需要调整
      return Promise.resolve({ affectedRows: 0, warning: "no fields to update" });
    }

    // 最后把主键加入参数
    params.push(id);

    const sql = `UPDATE ${this.tableName} SET ${sets.join(", ")} WHERE ${this.pkCol.columnName} = ?`;

    // 执行并返回结果（保持原返回契约）
    const res = await this.database.execute(sql, params);
    return res;
  }

  /**
   * 根据主键查询单条
   */
  async selectById(id: any): Promise<T | null> {
    const row: any = await this.database.query<T>(
      `SELECT * FROM ${this.tableName} WHERE ${this.pkCol.columnName} = ?`,
      [id]
    );

    return row?.length == 1 ? row[0] : null;
  }

  /**
   * 根据id查询本地数据判断执行插入或更新
   * @param insertData 插入或更新数据
   */
  async insertOrUpdate(insertData: T | Partial<T>): Promise<void> {
    let id = (insertData as any)[this.pkCol.columnName];
    if (id) {
      let entity = await this.selectById(id);
      if (entity) {
        await this.updateById(id, insertData);
      } else {
        await this.insert(insertData);
      }
    }
  }

  /**
   * 根据 QueryBuilder 查询列表或无条件查询全部
   */
  async selectList(qb?: QueryBuilder<T>): Promise<T[] | null> {
    if (qb) {
      const frag: SqlFragment = qb.build(this.tableName);
      log.prettyPrimary("execute sql:", frag);
      return this.database.query<T>(frag.sql, frag.params);
    }
    return this.database.query<T>(`SELECT * FROM ${this.tableName}`);
  }

  /**
   * 根据id查询数据
   * @param {any[]} ids id数组
   * @returns
   */
  async selectByIds(ids: any[], field: string | undefined = undefined, order: string = "asc"): Promise<T[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE ${this.pkCol.columnName} in (${ids
      .map(id => `'${id}'`)
      .join(",")}) `;

    if (field && order) {
      sql += `order by ${field} ${order}`;
    }
    log.prettyPrimary("execute sql:", sql);
    return this.database.query(sql);
  }

  /**
   * 统计总数
   */
  async count(qb?: QueryBuilder<T>): Promise<number> {
    const frag: SqlFragment = qb
      ? qb.buildCount(this.tableName)
      : { sql: `SELECT COUNT(*) as cnt FROM ${this.tableName}`, params: [] };

    const rows = await this.database.query<any>(frag.sql, frag.params);
    if (!Array.isArray(rows) || rows.length === 0) return 0;

    const first = rows[0];

    // 常见字段名优先级： cnt -> count -> first value
    const maybeCnt = first?.cnt ?? first?.count ?? first?.["COUNT(*)"] ?? Object.values(first)[0];

    const n = Number(maybeCnt);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * 删除表
   * @returns
   */
  async deleteTable(): Promise<any> {
    const sql = `DROP TABLE IF EXISTS ${this.tableName}`;
    return this.database.execute(sql);
  }

  /**
   * 清空表
   * @returns
   */
  async truncateTable(): Promise<any> {
    const sql = `TRUNCATE TABLE ${this.tableName}`;
    return this.database.execute(sql);
  }

  /**
   * 使用条件构造器查询
   * @returns
   */
  async query(builder: QueryBuilder<T>): Promise<T[]> {
    const { sql, params } = builder.build(this.tableName);
    return this.database.query<T>(sql, params);
  }

  /**
   * 使用条件构造器执行
   * @returns
   */
  async execute(builder: QueryBuilder<T>): Promise<T[]> {
    const { sql, params } = builder.build(this.tableName);
    return this.database.query<T>(sql, params);
  }

  /**
   * 加载xml内容，并解析存储到sqlmap容器
   * @param {string} xmlText xml内容
   */
  async loadSqlByText(xmlText: string) {
    let _this = this;
    // 在浏览器中解析XML字符串
    const xmlSQLParser = new XMLSQLParser(xmlText);
    _this.sqlMap = xmlSQLParser.getSQLMap();
    // Log.prettySuccess("Load xml Sql:", _this.sqlMap);
  }

  /***
   * 查询 xml 中 sql
   */
  async querySql(sqlName: string, params?: any): Promise<any> {
    if (this.sqlMap.size === 0) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return this.querySql(sqlName, params);
    }
    const sqlTemplate = this.sqlMap.get(sqlName);
    if (!sqlTemplate) throw new Error(`SQL with name ${sqlName} not found in XML`);
    const sql = params ? this.replaceParams(sqlTemplate, params) : sqlTemplate;
    return this.database.query(sql);
  }

  /**
   * 执行 xml 中 sql
   * @param {string} sqlName xml中映射的sql名称
   * @param {any} params 参数
   * @returns 执行结果
   */
  async executeSql(sqlName: string, params?: any): Promise<any> {
    if (this.sqlMap.size === 0) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return this.executeSql(sqlName, params);
    }
    const sqlTemplate = this.sqlMap.get(sqlName);
    if (!sqlTemplate) throw new Error(`SQL with name ${sqlName} not found in XML`);
    const sql = params ? this.replaceParams(sqlTemplate, params) : sqlTemplate;
    return this.database.execute(sql);
  }

  /**
   * 分页查询，返回 records/total/page/size
   */
  async selectPage(qb: QueryBuilder<T>, page: number, size: number): Promise<PageResult<T>> {
    //await this.ensureTable();
    const offset = (page - 1) * size;
    qb.limit(size).offset(offset);
    const [records, total] = await Promise.all([this.selectList(qb), this.count(qb)]);
    return { records, total, page, size };
  }

  /**
   * 确保表结构已创建
   */
  protected async ensureTable() {
    await SchemaGenerator.createTableFor(this.ctor);
  }

  /**
   * 替换 SQL 语句中的参数占位符
   * @param {string}  sql SQL 语句
   * @param {T}  params 替换参数的映射
   * @returns 替换后的 SQL 语句
   */
  protected replaceParams(sql: string, params: T): string {
    return sql.replace(/#\{(\w+)\}/g, (match, key) => {
      const value = (params as any)[key];
      return value !== undefined ? this.formatValue(value) : match;
    });
  }

  protected formatValue(value: any): string {
    if (typeof value == "string") {
      return `'${value}'`;
    } else if (typeof value == "number") {
      return value.toString();
    } else if (typeof value == "boolean") {
      return value ? "true" : "false";
    } else if (value instanceof Date) {
      return `'${value.toISOString()}'`; // Format the date as an ISO string
    } else if (value == null || value == undefined) {
      return "NULL";
    } else {
      return `'${value.toString()}'`;
    }
  }
}
