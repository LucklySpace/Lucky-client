import { QueryBuilder, SqlFragment } from "./QueryBuilder";

type FtsMode = "and" | "or" | "phrase";

export class FTSQueryBuilder<T> extends QueryBuilder<T> {
  // 指定用于 MATCH 的列名（例如 'content'）
  private ftsMatchColumn?: string;
  // ranking 表达式模板（可包含 {table} 占位符）
  private rankingExprTemplate?: string;
  private rankingOrder: "ASC" | "DESC" | undefined;

  // snippet/highlight 的 SELECT 定义：{ alias, exprTemplate }
  private snippetSelections: { alias: string; exprTemplate: string }[] = [];

  constructor() {
    super();
  }

  /**
   * 调整后的 buildMatchExpressionSync：
   * - 若包含空白（space），按空格切分为多个 token（不拆字符）
   * - 若不包含空白，则**作为一个整体 token**（不把中文拆成单字）
   * - phrase 模式：整体用双引号包裹
   * - 非 phrase：对每个 token 使用前缀匹配 token*，并用 AND/OR 连接
   */
  static buildMatchExpressionSync(keyword: string, mode: FtsMode = "and"): string {
    const raw = String(keyword || "").trim();
    if (!raw) return "";

    // 移除用户可能带的引号，避免语法问题
    let cleaned = raw.replace(/["']/g, " ").trim();
    if (!cleaned) return "";

    // 若包含空白字符（认为用户传入的是已经分词或多 token），按空格分割（不拆字符）
    const hasWhitespace = /\s+/.test(cleaned);

    let tokens: string[] = [];
    if (hasWhitespace) {
      tokens = cleaned.split(/\s+/).filter(Boolean);
    } else {
      // 不含空格，作为一个整体 token（不拆成单字符）
      tokens = [cleaned];
    }

    // 去重与清理
    tokens = Array.from(new Set(tokens.map(t => t.trim()).filter(Boolean)));
    if (tokens.length === 0) return "";

    if (mode === "phrase") {
      // phrase: 整体短语，用双引号包裹（参数化时作为一个表达式）
      const phrase = tokens.join(" ");
      return `"${phrase}"`;
    }

    // 非 phrase: 使用前缀匹配 token*，并按模式用 AND/OR 连接
    const joiner = mode === "and" ? " AND " : " OR ";
    const parts = tokens.map(t => `${t}*`);
    return parts.join(joiner);
  }

  /**
   * 指定用于 MATCH 的列名（会做 isSafeIdentifier 校验）
   */
  setMatchColumn(col: keyof T | string): this {
    const c = String(col);
    if (!this.isSafeIdentifier(c)) return this;
    this.ftsMatchColumn = c;
    return this;
  }

  /**
   * 基于 keyword 自动构造 MATCH 表达式并把条件加入（轻量实现）
   * - 重要变化：**不会把无空格字符串拆成字符**；只有当字符串包含空格时才按空格切分为多个 token
   * - mode:
   *    "and"  => token* AND token*
   *    "or"   => token* OR token*
   *    "phrase"=> "整个短语"（双引号包裹）
   */
  matchKeyword(keyword: string | undefined, mode: FtsMode = "and"): this {
    if (!keyword || !(keyword = String(keyword).trim())) return this;
    if (!this.ftsMatchColumn) {
      // 容错：默认列名为 content（你也可以要求用户显式 setMatchColumn）
      this.ftsMatchColumn = "content";
      if (!this.isSafeIdentifier(this.ftsMatchColumn)) return this;
    }

    const expr = FTSQueryBuilder.buildMatchExpressionSync(keyword, mode);
    if (!expr) return this;
    // 使用父类的 match 方法（会把 MATCH ? 推入条件并参数化）
    // @ts-ignore
    return this.match(this.ftsMatchColumn as keyof T, expr);
  }

  /**
   * 直接插入已经构造好的 MATCH 表达式（假设你已清理 / 验证）
   */
  matchRaw(column: keyof T | string, matchExpr: string | undefined): this {
    if (!matchExpr || !(matchExpr = String(matchExpr).trim())) return this;
    const c = String(column);
    if (!this.isSafeIdentifier(c)) return this;
    // @ts-ignore
    return this.match(c as keyof T, matchExpr);
  }

  /**
   * 设置 ranking 表达式模板（可带 {table} 占位符），并可指定排序方向
   * 例如： setRankingExpr("bm25({table})", "DESC")
   */
  setRankingExpr(template: string, order: "ASC" | "DESC" = "DESC"): this {
    if (!template || typeof template !== "string") return this;
    this.rankingExprTemplate = template.trim();
    this.rankingOrder = order;
    return this;
  }

  /**
   * 添加 snippet / 高亮表达式到 SELECT（exprTemplate 可含 {table}）
   * 例如 addSnippetSelect("excerpt", "snippet({table}, 0, '<b>', '</b>', '...', 10)")
   */
  addSnippetSelect(alias: string, exprTemplate: string): this {
    if (!alias || !exprTemplate) return this;
    if (!this.isSafeIdentifier(alias)) return this;
    this.snippetSelections.push({ alias, exprTemplate });
    return this;
  }

  orderByRankAsc(): this {
    this.rankingOrder = "ASC";
    return this;
  }

  orderByRankDesc(): this {
    this.rankingOrder = "DESC";
    return this;
  }

  /**
   * 重写 build：把 snippet 与 ranking 注入 SELECT，并保留父类 WHERE/ GROUP/ HAVING/ ORDER/ LIMIT/ OFFSET
   */
  build(table: string): SqlFragment {
    if (!table || !this.isSafeIdentifier(table)) {
      throw new Error("FTS build: invalid table name");
    }

    if (!this.selectFields || this.selectFields.length === 0) {
      this.selectFields = ["*"];
    }

    // 当只有 "*" 时，用 table.* 避免歧义
    const normalizedSelects =
      this.selectFields.length === 1 && this.selectFields[0].trim() === "*"
        ? [`${table}.*`]
        : this.selectFields.map(s => {
          const t = String(s).trim();
          return t.includes(".") ? t : t === "*" ? `${table}.*` : t;
        });

    // 注入 snippet 表达式
    for (const sel of this.snippetSelections) {
      const expr = sel.exprTemplate.replace(/\{table\}/g, table);
      normalizedSelects.push(`${expr} AS ${sel.alias}`);
    }

    // 注入 ranking
    let finalSelects = [...normalizedSelects];
    if (this.rankingExprTemplate) {
      const rankExpr = this.rankingExprTemplate.replace(/\{table\}/g, table);
      finalSelects.push(`${rankExpr} AS rank`);
      // 注意：orderByClause 需要父类允许子类访问（protected），否则请用父类的 orderByDesc("rank" as any) 替代
      // @ts-ignore
      if (!this.orderByClause && this.rankingOrder) {
        // @ts-ignore
        this.orderByClause = `ORDER BY rank ${this.rankingOrder}`;
      }
    }

    // @ts-ignore
    const whereFrag = this.getWhereClause();

    const sqlParts = [
      `SELECT ${finalSelects.join(", ")} FROM ${table}`,
      whereFrag.sql ? `WHERE ${whereFrag.sql}` : "",
      // @ts-ignore
      this.groupByClause,
      // @ts-ignore
      this.havingClause,
      // @ts-ignore
      this.orderByClause,
      // @ts-ignore
      this.lim !== undefined ? `LIMIT ${this.lim}` : "",
      // @ts-ignore
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
    super.clear();
    this.ftsMatchColumn = undefined;
    this.rankingExprTemplate = undefined;
    this.rankingOrder = undefined;
    this.snippetSelections = [];
  }
}
