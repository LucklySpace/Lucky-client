export interface SqlFragment {
  sql: string;
  params: unknown[];
}

// 条件单元类型
type Condition = {
  sql: string;
  params: unknown[];
  connector?: "AND" | "OR"; // 与前一条件连接词（第一项可为 undefined）
};

abstract class AbstractWrapper<T> {
  protected selectFields: string[] = [];
  protected conditions: Condition[] = [];

  eq(column: keyof T, value: any): this {
    const col = String(column);
    if (!this.isSafeIdentifier(col)) return this;
    this.pushCondition(`${col} = ?`, [value]);
    return this;
  }

  gt(column: keyof T, value: any): this {
    const col = String(column);
    if (!this.isSafeIdentifier(col)) return this;
    this.pushCondition(`${col} > ?`, [value]);
    return this;
  }

  lt(column: keyof T, value: any): this {
    const col = String(column);
    if (!this.isSafeIdentifier(col)) return this;
    this.pushCondition(`${col} < ?`, [value]);
    return this;
  }

  between(column: keyof T, start: any, end: any): this {
    const col = String(column);
    if (!this.isSafeIdentifier(col)) return this;
    this.pushCondition(`${col} BETWEEN ? AND ?`, [start, end]);
    return this;
  }

  like(column: keyof T, value: string): this {
    const col = String(column);
    if (!this.isSafeIdentifier(col) || value == null) return this;
    this.pushCondition(`${col} LIKE ?`, [`%${value}%`]);
    return this;
  }

  in(column: keyof T, values: any[]): this {
    const col = String(column);
    if (!this.isSafeIdentifier(col)) return this;

    // 空数组处理：没有要匹配的值 -> 永假条件（或可选择跳过）
    if (!Array.isArray(values) || values.length === 0) {
      // 使用 0=1 保证此条件为 false
      this.pushCondition("0 = 1", []);
      return this;
    }

    const placeholders = values.map(() => "?").join(", ");
    this.pushCondition(`${col} IN (${placeholders})`, values);
    return this;
  }

  /**
   * match：接收完整的 match 表达式，不自动添加通配符；
   * 若 matchExpr 为空或仅空白则跳过（避免无意义的 MATCH ? ）
   */
  match(column: keyof T, matchExpr: string | undefined): this {
    const col = String(column);
    if (!this.isSafeIdentifier(col)) return this;
    if (!matchExpr || typeof matchExpr !== "string" || !(matchExpr = matchExpr.trim())) return this;
    this.pushCondition(`${col} MATCH ?`, [matchExpr]);
    return this;
  }

  /**
   * col IS NULL
   */
  isNull(column: keyof T): this {
    const col = String(column);
    if (!this.isSafeIdentifier(col)) return this;
    this.pushCondition(`${col} IS NULL`, []);
    return this;
  }

  /**
   * col IS NOT NULL
   */
  isNotNull(column: keyof T): this {
    const col = String(column);
    if (!this.isSafeIdentifier(col)) return this;
    this.pushCondition(`${col} IS NOT NULL`, []);
    return this;
  }

  /**
   * (col IS NULL OR col = '')
   */
  isNullOrEmpty(column: keyof T): this {
    const col = String(column);
    if (!this.isSafeIdentifier(col)) return this;
    this.pushCondition(`(${col} IS NULL OR ${col} = '')`, []);
    return this;
  }

  // -------- 新增：判空 / 非空 helpers --------

  /**
   * (col IS NOT NULL AND col <> '')
   */
  isNotNullAndNotEmpty(column: keyof T): this {
    const col = String(column);
    if (!this.isSafeIdentifier(col)) return this;
    this.pushCondition(`(${col} IS NOT NULL AND ${col} <> '')`, []);
    return this;
  }

  // 嵌套：and / or -- 利用子查询生成的 WHERE 片段（不带 WHERE 前缀）
  and(fn: (query: AbstractWrapper<T>) => void): this {
    const sub = this.createSubQuery();
    try {
      fn(sub);
    } catch {
      // 忽略回调内部异常，防止中断主流程
    }
    const { sql, params } = sub.getWhereClause();
    if (sql) this.pushCondition(`(${sql})`, params, this.conditions.length > 0 ? "AND" : undefined);
    return this;
  }

  or(fn: (query: AbstractWrapper<T>) => void): this {
    const sub = this.createSubQuery();
    try {
      fn(sub);
    } catch {
      // ignore
    }
    const { sql, params } = sub.getWhereClause();
    if (sql) this.pushCondition(`(${sql})`, params, this.conditions.length > 0 ? "OR" : undefined);
    return this;
  }

  raw(condition: string, ...params: any[]) {
    if (!condition || typeof condition !== "string" || !condition.trim()) return this;
    this.pushCondition(`(${condition.trim()})`, this.ensureParamsArray(params));
    return this;
  }

  // --------------------------------------------

  // 返回 WHERE 片段（不带 "WHERE "）及 params（按插入顺序）
  getWhereClause(): { sql: string; params: unknown[] } {
    if (!this.conditions || this.conditions.length === 0) return { sql: "", params: [] };
    const parts: string[] = [];
    const params: unknown[] = [];
    for (let idx = 0; idx < this.conditions.length; idx++) {
      const c = this.conditions[idx];
      if (!c || !c.sql || !c.sql.trim()) continue;
      if (idx === 0) {
        parts.push(c.sql);
      } else {
        const connector = c.connector ?? "AND";
        parts.push(`${connector} ${c.sql}`);
      }
      if (c.params && c.params.length) params.push(...c.params);
    }
    const sql = parts.join(" ");
    return { sql: sql.trim(), params };
  }

  getSql(): string {
    const { sql } = this.getWhereClause();
    return sql ? `WHERE ${sql}` : "";
  }

  getParams(): unknown[] {
    return this.getWhereClause().params;
  }

  abstract clear(): void;

  /**
   * 简单的列名/标识符白名单校验（仅允许字母数字下划线和点）
   * 目的：避免用户传入恶意列名导致拼接注入（注意：这不是替代参数化值）
   */
  protected isSafeIdentifier(id?: string): boolean {
    if (!id || typeof id !== "string") return false;
    return /^[A-Za-z0-9_.]+$/.test(id);
  }

  protected ensureParamsArray(params?: unknown[] | unknown): unknown[] {
    if (!params) return [];
    return Array.isArray(params) ? params : [params];
  }

  /**
   * pushCondition：只有 sql 非空才会被加入
   */
  protected pushCondition(sql: string, params: unknown[] = [], connector?: "AND" | "OR") {
    if (!sql || typeof sql !== "string") return;
    const trimmed = sql.trim();
    if (!trimmed) return;
    const conn = connector ?? (this.conditions.length > 0 ? "AND" : undefined);
    this.conditions.push({ sql: trimmed, params: this.ensureParamsArray(params), connector: conn });
  }

  protected createSubQuery(): AbstractWrapper<T> {
    // 通过构造子类的方式创建新的实例，保持原类类型（注意：必须确保子类无 constructor 参数）
    return new (this.constructor as unknown as { new(): AbstractWrapper<T> })();
  }
}

export class QueryBuilder<T> extends AbstractWrapper<T> {
  protected orderByClause = "";
  protected lim?: number;
  protected off?: number;
  protected groupByClause = "";
  protected havingClause = "";

  select(...fields: (keyof T)[]): this {
    if (!fields || fields.length === 0) {
      this.selectFields = ["*"];
      return this;
    }
    // 仅保留安全的标识符，非法字段会被忽略
    this.selectFields = fields.map(f => String(f)).filter(f => this.isSafeIdentifier(f));
    if (this.selectFields.length === 0) this.selectFields = ["*"];
    return this;
  }

  orderByAsc<K extends keyof T>(col: K): this {
    const c = String(col);
    if (!this.isSafeIdentifier(c)) return this;
    this.orderByClause = `ORDER BY ${c} ASC`;
    return this;
  }

  orderByDesc<K extends keyof T>(col: K): this {
    const c = String(col);
    if (!this.isSafeIdentifier(c)) return this;
    this.orderByClause = `ORDER BY ${c} DESC`;
    return this;
  }

  groupBy(...cols: (keyof T)[]) {
    const safe = (cols || []).map(c => String(c)).filter(c => this.isSafeIdentifier(c));
    if (safe.length) this.groupByClause = `GROUP BY ${safe.join(", ")}`;
    return this;
  }

  having(raw: string) {
    if (!raw || typeof raw !== "string" || !raw.trim()) return this;
    this.havingClause = `HAVING ${raw.trim()}`;
    return this;
  }

  limit(count: number): this {
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return this;
    this.lim = Math.floor(count);
    return this;
  }

  offset(skip: number): this {
    if (typeof skip !== "number" || !Number.isFinite(skip) || skip < 0) return this;
    this.off = Math.floor(skip);
    return this;
  }

  build(table: string): SqlFragment {
    if (!table || !this.isSafeIdentifier(table)) {
      throw new Error("build: invalid table name");
    }

    if (this.selectFields.length == 0) this.selectFields = ["*"];
    const whereFrag = this.getWhereClause();

    // 保护 limit/offset：只有非负整数才会被内联
    const sqlParts = [
      `SELECT ${this.selectFields.join(", ")} FROM ${table}`,
      whereFrag.sql ? `WHERE ${whereFrag.sql}` : "",
      this.groupByClause,
      this.havingClause,
      this.orderByClause,
      this.lim !== undefined ? `LIMIT ${this.lim}` : "",
      this.off !== undefined ? `OFFSET ${this.off}` : ""
    ].filter(Boolean);
    return { sql: sqlParts.join(" "), params: whereFrag.params };
  }

  buildCount(table: string): SqlFragment {
    if (!table || !this.isSafeIdentifier(table)) {
      throw new Error("buildCount: invalid table name");
    }
    const whereFrag = this.getWhereClause();
    const sql = [`SELECT COUNT(*) as cnt FROM ${table}`, whereFrag.sql ? `WHERE ${whereFrag.sql}` : ""]
      .filter(Boolean)
      .join(" ");
    return { sql, params: whereFrag.params };
  }

  clear(): void {
    this.conditions = [];
    this.selectFields = [];
    this.orderByClause = "";
    this.lim = undefined;
    this.off = undefined;
    this.groupByClause = "";
    this.havingClause = "";
  }
}
