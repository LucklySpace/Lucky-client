import { FTS5Config, Metadata } from "./annotation/Decorators";
import { BaseMapper, PageResult } from "./BaseMapper";
import { DatabaseManager } from "./core/DatabaseManager";
import segmenter from "./core/Segmenter";
import { QueryBuilder } from "./query/QueryBuilder";

// 日志
const log = useLogger();

export class BaseFTS5Mapper<T extends Record<string, any>> extends BaseMapper<T> {
  protected fts5TableName: string;
  protected fts5Fields: string[];
  protected fts5MatchField: string;
  protected fts5NestedMatchField?: string;
  protected entity: any;

  constructor(protected ctor: new () => T) {
    super(ctor);
    const fts5Meta: FTS5Config = Reflect.getMetadata(Metadata.FTS5, ctor);
    if (!fts5Meta) throw new Error("未定义 @Fts5 元注解");
    this.fts5TableName = fts5Meta.virtual_name;
    this.fts5Fields = fts5Meta.fields || [];
    this.fts5MatchField = fts5Meta.match_field;
    this.fts5NestedMatchField = fts5Meta.nested_match_field;
    this.entity = new ctor();
  }

  // 动态获取当前数据库实例
  protected get fts5database(): DatabaseManager {
    // 优先从 window 取
    const GlobalDB = (window as any).DatabaseManager as typeof DatabaseManager;
    return GlobalDB ? GlobalDB.getInstance({ database: "index" }) : DatabaseManager.getInstance({ database: "index" });
  }


  /***
   * 查询 xml 中 sql
   */
  async queryFTS5Sql(sqlName: string, params?: any): Promise<any> {
    if (this.sqlMap.size === 0) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return this.queryFTS5Sql(sqlName, params);
    }
    const sqlTemplate = this.sqlMap.get(sqlName);
    if (!sqlTemplate) throw new Error(`SQL with name ${sqlName} not found in XML`);
    const sql = params ? this.replaceParams(sqlTemplate, params) : sqlTemplate;
    return this.fts5database.query(sql);
  }

  /**
   * 执行 xml 中 sql
   * @param {string} sqlName xml中映射的sql名称
   * @param {any} params 参数
   * @returns 执行结果
   */
  async executeFTS5Sql(sqlName: string, params?: any): Promise<any> {
    if (this.sqlMap.size === 0) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return this.executeFTS5Sql(sqlName, params);
    }
    const sqlTemplate = this.sqlMap.get(sqlName);
    if (!sqlTemplate) throw new Error(`SQL with name ${sqlName} not found in XML`);
    const sql = params ? this.replaceParams(sqlTemplate, params) : sqlTemplate;
    return this.fts5database.execute(sql);
  }

  /**
   * 简单 FTS5 搜索（若 keyword 为空则返回 undefined）
   */
  async searchFTS5(keyword: string | undefined): Promise<T[] | undefined> {
    if (!keyword) return undefined;
    const sql = `SELECT * FROM ${this.fts5TableName} WHERE ${this.fts5MatchField} like %?%`;
    try {
      return await this.fts5database.query<T>(sql, [keyword]);
    } catch (err) {
      log?.colorLog?.("fts5", `searchFTS5 error: ${(err as any)?.message ?? err}`, "error");
      throw err;
    }
  }

  /**
   * 使用任意 QueryBuilder（或 FTSQueryBuilder）进行分页 FTS 查询。
   * - 如果传入的是 FTSQueryBuilder，builder.build(table) 本身可能已经包含 MATCH/snippet/rank，
   *   本方法会尊重 builder 生成的 SELECT/WHERE/ORDER 等并执行分页与计数。
   */
  async searchFTSByBuilder(qb: QueryBuilder<T>): Promise<PageResult<T>> {
    // 直接使用 qb.build(table)
    const frag = qb.build(this.fts5TableName);
    const paginatedSql = `${frag.sql}`;
    const paginatedParams = [...(frag.params || [])];
    const countSql = `SELECT COUNT(*) as cnt FROM (${frag.sql}) AS _sub`;

    try {
      const [rows, cntRows] = await Promise.all([
        this.fts5database.query<T>(paginatedSql, paginatedParams),
        this.fts5database.query<{ cnt: number }>(countSql, frag.params)
      ]);
      const total = Array.isArray(cntRows) && cntRows.length > 0 ? Number(cntRows[0].cnt || 0) : 0;
      return { records: rows ?? [], total };
    } catch (err) {
      log?.colorLog?.("fts5", `searchFTSByBuilder error: ${(err as any)?.message ?? err}`, "error");
      throw err;
    }
  }

  /**
   * 分页搜索：使用 QueryBuilder 构建基础 SQL，然后对虚表执行分页查询
   */
  async searchFTS5Page(qb: QueryBuilder<T>, page: number = 1, size: number = 15): Promise<PageResult<T>> {
    const frag = qb.build(this.fts5TableName);
    const offset = (page - 1) * size;
    const paginatedSql = `${frag.sql} LIMIT ? OFFSET ?`;
    const paginatedParams = [...frag.params, size, offset];
    const countSql = `SELECT COUNT(*) as cnt FROM (${frag.sql}) AS _sub`;

    try {
      const [rows, cntRows] = await Promise.all([
        this.fts5database.query<T>(paginatedSql, paginatedParams),
        this.fts5database.query<{ cnt: number }>(countSql, frag.params)
      ]);

      const total = Array.isArray(cntRows) && cntRows.length > 0 ? Number(cntRows[0].cnt || 0) : 0;

      log.prettyPrimary("execute sql:", paginatedSql);

      return { records: rows ?? [], total, page, size };
    } catch (err) {
      log?.colorLog?.("fts5", `searchFTS5Page error: ${(err as any)?.message ?? err}`, "error");
      throw err;
    }
  }

  async searchFTS5WithKeyword(
    qb: QueryBuilder<T>,
    keyword: string | undefined,
    mode: "and" | "or" | "phrase" = "and"
  ): Promise<PageResult<T>> {
    const frag = qb.build(this.fts5TableName); // { sql, params }
    let baseSql = frag.sql;
    const baseParams = [...(frag.params || [])];

    // 如果有 keyword，则生成 match 表达式并把它加入 SQL
    if (keyword && String(keyword).trim().length > 0) {
      const matchExpr = await this.buildMatchExpression(keyword, mode);
      if (matchExpr) {
        // 自动判断原 SQL 是否已有 WHERE
        if (/\bwhere\b/i.test(baseSql)) {
          baseSql = `${baseSql} AND ${this.fts5MatchField} MATCH ?`;
        } else {
          baseSql = `${baseSql} WHERE ${this.fts5MatchField} MATCH ?`;
        }
        baseParams.push(matchExpr);
      }
    }

    const paginatedSql = `${baseSql}`;
    const paginatedParams = [...baseParams];
    const countSql = `SELECT COUNT(*) as cnt FROM (${baseSql}) AS _sub`;

    try {
      const [rows, cntRows] = await Promise.all([
        this.fts5database.query<T>(paginatedSql, paginatedParams),
        this.fts5database.query<{ cnt: number }>(countSql, baseParams)
      ]);

      const total = Array.isArray(cntRows) && cntRows.length > 0 ? Number(cntRows[0].cnt || 0) : 0;
      return { records: rows ?? [], total };
    } catch (err) {
      log?.colorLog?.("fts5", `searchFTS5PageWithKeyword error: ${(err as any)?.message ?? err}`, "error");
      throw err;
    }
  }

  /**
   * 基于 QueryBuilder 的分页 FTS 搜索（支持传入 keyword 和匹配模式）
   * - qb: 已有的 QueryBuilder（可以包含其他 where/joins）
   * - keyword: 要用于 FTS 匹配的字符串（可包含多个字/词）
   * - mode: "and" | "or" | "phrase"
   */
  async searchFTS5PageWithKeyword(
    qb: QueryBuilder<T>,
    keyword: string | undefined,
    page: number = 1,
    size: number = 15,
    mode: "and" | "or" | "phrase" = "and"
  ): Promise<PageResult<T>> {
    const frag = qb.build(this.fts5TableName); // { sql, params }
    let baseSql = frag.sql;
    const baseParams = [...(frag.params || [])];

    // 如果有 keyword，则生成 match 表达式并把它加入 SQL
    if (keyword && String(keyword).trim().length > 0) {
      const matchExpr = await this.buildMatchExpression(keyword, mode);
      if (matchExpr) {
        // 自动判断原 SQL 是否已有 WHERE
        if (/\bwhere\b/i.test(baseSql)) {
          baseSql = `${baseSql} AND ${this.fts5MatchField} MATCH ?`;
        } else {
          baseSql = `${baseSql} WHERE ${this.fts5MatchField} MATCH ?`;
        }
        baseParams.push(matchExpr);
      }
    }

    const offset = (page - 1) * size;
    const paginatedSql = `${baseSql} LIMIT ? OFFSET ?`;
    const paginatedParams = [...baseParams, size, offset];
    const countSql = `SELECT COUNT(*) as cnt FROM (${baseSql}) AS _sub`;

    try {
      const [rows, cntRows] = await Promise.all([
        this.fts5database.query<T>(paginatedSql, paginatedParams),
        this.fts5database.query<{ cnt: number }>(countSql, baseParams)
      ]);

      const total = Array.isArray(cntRows) && cntRows.length > 0 ? Number(cntRows[0].cnt || 0) : 0;
      return { records: rows ?? [], total, page, size };
    } catch (err) {
      log?.colorLog?.("fts5", `searchFTS5PageWithKeyword error: ${(err as any)?.message ?? err}`, "error");
      throw err;
    }
  }

  async searchFTS5WithMeta(
    qb: QueryBuilder<T>,
    page: number = 1,
    size: number = 15,
    opts?: {
      snippetStart?: string;
      snippetEnd?: string;
      snippetEllipsis?: string;
      snippetTokens?: number;
      snippetMaxLen?: number;
      rankExpr?: string;
      metaTable?: string;
    }
  ): Promise<PageResult<T>> {
    // 默认 snippet 参数
    const snippetStart = opts?.snippetStart ?? "<mark>";
    const snippetEnd = opts?.snippetEnd ?? "</mark>";
    const snippetEllipsis = opts?.snippetEllipsis ?? "...";
    const snippetTokens = Number.isFinite(opts?.snippetTokens as any) ? (opts!.snippetTokens as number) : -1;
    const snippetMaxLen = Math.max(1, Math.floor(opts?.snippetMaxLen ?? 120));
    const rankExpr = opts?.rankExpr;
    const metaTable = opts?.metaTable ?? "meta"; // 你可以传入具体 meta 表名

    // 取出 qb 的 WHERE 片段与 params（不带 "WHERE" 前缀）
    const whereFrag = qb.getWhereClause(); // { sql, params }
    const whereSql = (whereFrag.sql || "").trim();
    const whereParams = Array.isArray(whereFrag.params) ? [...whereFrag.params] : [];

    // 如果没有任何 WHERE，则不能从中抽出 MATCH（会作为强制条件处理）
    if (!whereSql) {
      // 没有任何条件：早退（返回空）
      return { records: [], total: 0, page, size };
    }

    // 尝试在 whereSql 中寻找第一个 "col MATCH ?" 模式（忽略大小写，col 可以带点）
    const matchRegex = /\b([A-Za-z0-9_.]+)\s+MATCH\s+\?/gi;
    const matchExec = matchRegex.exec(whereSql);

    // Helper: escape single quotes for snippet arguments
    const esc = (s: string) => String(s).replace(/'/g, "''");

    // 如果未找到 MATCH，则回退到原有 searchFTS5Page
    if (!matchExec) {
      // fallback: call existing basic paged search on FTS virtual table
      log?.colorLog?.("fts5", "searchFTS5WithMeta: no MATCH found in qb - falling back to searchFTS5Page", "warn");
      return await this.searchFTS5Page(qb, page, size);
    }

    // 计算该 match 的参数在 whereParams 中的索引：
    // 通过统计 matchOccurence 之前 SQL 字符串中出现的 ? 个数，得到参数在 params 中的顺序索引
    const matchIndexInSql = matchExec.index ?? 0;
    const prefixSql = whereSql.slice(0, matchIndexInSql);
    const prefixPlaceholders = (prefixSql.match(/\?/g) || []).length; // 0-based index in params
    const matchParamIndex = prefixPlaceholders;
    const matchExpr = whereParams[matchParamIndex];

    if (!matchExpr || typeof matchExpr !== "string") {
      log?.colorLog?.("fts5", "searchFTS5WithMeta: found MATCH ? but could not resolve parameter - fallback", "warn");
      return await this.searchFTS5Page(qb, page, size);
    }

    // 从 whereSql 中移除该 MATCH 子句，以产生只用于 meta 的 WHERE（尽量清理前后的 AND/OR）
    // 移除策略：把 "COL MATCH ?" 替换为 "1=1"，然后再清理多余的连接词
    let metaWhereSql = whereSql.replace(matchRegex, "1=1");
    // 清理 "AND 1=1" / "OR 1=1"（简单替换）
    metaWhereSql = metaWhereSql
      .replace(/\bAND\s+1=1\b/gi, "")
      .replace(/\bOR\s+1=1\b/gi, "")
      .replace(/\(\s*1=1\s*\)/gi, "")
      .replace(/^\s*AND\s+/i, "")
      .replace(/^\s*OR\s+/i, "")
      .trim();

    // 重新构造 metaParams：去掉 matchParamIndex 对应的参数
    const metaParams = whereParams.slice(0, matchParamIndex).concat(whereParams.slice(matchParamIndex + 1));

    // 构建最终 SQL：JOIN fts 表（f）和 meta 表（m），以 m.docid = f.rowid 连接
    // SELECT: 优先返回 meta 表的列（m.*），并附带 f.rowid AS docid 与 snippet 如果启用
    const selectCols = [`${metaTable}.*`, `f.rowid AS docid`];
    // snippet
    selectCols.push(
      `snippet(${this.fts5TableName}, '${esc(snippetStart)}', '${esc(snippetEnd)}', '${esc(
        snippetEllipsis
      )}', ${snippetTokens}, ${snippetMaxLen}) AS snippet`
    );

    const fromSql = `${this.fts5TableName} AS f JOIN ${metaTable} AS ${metaTable} ON ${metaTable}.docid = f.rowid`;

    // WHERE: f MATCH ? 以及 metaWhereSql （若存在）
    const whereParts: string[] = [];
    const finalParams: any[] = [];

    whereParts.push(`f MATCH ?`);
    finalParams.push(matchExpr);

    if (metaWhereSql) {
      whereParts.push(`(${metaWhereSql})`);
      finalParams.push(...metaParams);
    }

    const whereClause = `WHERE ${whereParts.join(" AND ")}`;

    // ORDER BY: 优先使用传入 rankExpr，否则按 meta.timestamp DESC（假定 meta 有 timestamp）
    let orderClause = "";
    if (rankExpr) {
      orderClause = `ORDER BY ${rankExpr} DESC`;
    } else {
      orderClause = `ORDER BY ${metaTable}.timestamp DESC`;
    }

    // LIMIT/OFFSET
    const limit = Math.max(1, Number(size || 15));
    const offset = Math.max(0, (Number(page || 1) - 1) * limit);
    const paginatedSql = `SELECT ${selectCols.join(
      ", "
    )} FROM ${fromSql} ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
    const paginatedParams = [...finalParams, limit, offset];

    const countSql = `SELECT COUNT(*) as cnt FROM ${fromSql} ${whereClause}`;
    const countParams = [...finalParams];

    try {
      // 并行执行计数与数据查询
      const [rows, cntRows] = await Promise.all([
        this.fts5database.query<T & { docid?: number; snippet?: string }>(paginatedSql, paginatedParams),
        this.fts5database.query<{ cnt: number }>(countSql, countParams)
      ]);

      const total = Array.isArray(cntRows) && cntRows.length > 0 ? Number(cntRows[0].cnt || 0) : 0;
      const records = Array.isArray(rows) && rows.length > 0 ? rows : [];

      // 返回 records（包含 snippet 字段），注意：records 的字段以 meta 表列为主，且包含 docid/snippet
      return { records: records as unknown as T[], total, page, size };
    } catch (err) {
      log?.colorLog?.("fts5", `searchFTS5WithMeta error: ${(err as any)?.message ?? err}`, "error");
      // fallback to the simpler page search if anything goes wrong
      return await this.searchFTS5Page(qb, page, size);
    }
  }

  /**
   * 批量插入到 FTS5 虚表（支持可选的 idle executor：将写操作交给空闲执行器执行以避免占用主线程）
   *
   * @param entities 要插入的数据数组
   * @param extraData 补充字段（属性名或列名）
   * @param batchSize 每批次条数（默认 200）
   * @param executor 可选的空闲任务执行器（支持最小接口 addTask(cb, opts)），若提供则写入会被提交为多个空闲任务执行
   * @returns 插入的记录数（在 executor 模式下，返回的 Promise 在所有写任务完成后 resolve）
   */
  /**
   * 精简且稳健的 batchInsertFTS5 实现（支持可选 executor）
   *
   * - 保留分词先行（tokenizeBatch）
   * - 优先使用多行 INSERT（快），失败时回退到逐行插入（稳）
   * - 支持可选 executor（将写任务提交到空闲执行器）或在当前线程分批执行
   */
  async batchInsertFTS5(
    entities: Array<Partial<T>>,
    extraData?: Partial<T>,
    batchSize = 200,
    executor?: { addTask: (cb: (deadline: IdleDeadline) => void | Promise<void>, opts?: any) => number }
  ): Promise<number> {
    if (!entities?.length) return 0;

    // 目标列
    const ftsCols = this.fts5Fields.length > 0 ? this.fts5Fields.slice() : this.cols?.map(c => c.columnName) ?? [];
    if (!ftsCols.length) {
      log?.prettyWarn?.("fts5", "batchInsertFTS5: no target columns found, skip");
      return 0;
    }

    // 列->属性 映射
    const colToProp: Record<string, string> =
      this.cols?.reduce<Record<string, string>>((acc, m) => {
        acc[m.columnName] = m.property;
        return acc;
      }, {}) ?? {};

    // 处理 extraData（prop/col 两种 key）
    const extraByProp: Record<string, any> = extraData ? { ...(extraData as any) } : {};
    const extraByCol: Record<string, any> = extraData ? { ...(extraData as any) } : {};
    if (extraData) {
      for (const col of Object.keys(colToProp)) {
        const prop = colToProp[col];
        if (prop && (extraData as any)[prop] !== undefined) extraByCol[col] = (extraData as any)[prop];
        if ((extraData as any)[col] !== undefined) extraByProp[prop] = (extraData as any)[col];
      }
    }

    // 先批量分词（CPU 密集）
    const rawTokenized = await this.tokenizeBatch(entities, colToProp); // Record<string,string[]>
    // 规范化为 Map<number,string[]>
    const tokensMap = new Map<number, string[]>();
    for (const k of Object.keys(rawTokenized || {})) {
      const idx = Number(k);
      if (!Number.isNaN(idx)) tokensMap.set(idx, rawTokenized[k]);
    }

    // helper: 构建单行 params（优先用 tokensMap 替换 match 字段）
    const buildParamsForItem = (item: Partial<T>, idx: number) =>
      ftsCols.map(col => {
        if (col === this.fts5MatchField && tokensMap.has(idx)) {
          const arr = tokensMap.get(idx)!;
          return Array.isArray(arr) ? arr.join(" ") : arr;
        }
        const prop = colToProp[col];
        if (prop && (item as any)[prop] !== undefined) return (item as any)[prop];
        if ((item as any)[col] !== undefined) return (item as any)[col];
        if (prop && extraByProp[prop] !== undefined) return extraByProp[prop];
        if (extraByCol[col] !== undefined) return extraByCol[col];
        return null;
      });

    // execWithRetry：遇到 locked/busy 则重试（指数退避）
    const execWithRetry = async (sql: string, params?: any[]) => {
      const maxRetries = 6;
      let attempt = 0;
      let delay = 100;
      while (true) {
        try {
          return await this.fts5database.execute(sql, params);
        } catch (err: any) {
          const msg = String((err && (err.message || err)) || "").toLowerCase();
          const isLocked =
            msg.includes("database is locked") || msg.includes("busy") || /sqlite_busy|code:\s*5/.test(msg);
          if (!isLocked) throw err;
          attempt++;
          if (attempt > maxRetries) throw err;
          await new Promise(r => setTimeout(r, delay));
          delay = Math.min(2000, delay * 2);
        }
      }
    };

    // 尝试设置 busy_timeout（兼容性无害）
    try {
      await this.fts5database.execute("PRAGMA busy_timeout = 5000;");
    } catch {
      /* ignore */
    }

    // yieldControl：让出主线程（rIC 优先）
    const yieldControl = () =>
      new Promise<void>(resolve => {
        if (typeof (window as any).requestIdleCallback === "function") {
          (window as any).requestIdleCallback(() => resolve());
        } else {
          setTimeout(() => resolve(), 0);
        }
      });

    // 把一个 chunk 写入的实际逻辑（先试 multi-insert，失败则短事务逐行插入）
    const writeChunk = async (batchStart: number, batch: Array<Partial<T>>): Promise<number> => {
      // fast: one multi-row INSERT
      const placeholdersPerRow = `(${ftsCols.map(() => "?").join(",")})`;
      const multiSql = `INSERT INTO ${this.fts5TableName} (${ftsCols.join(",")}) VALUES ${batch
        .map(() => placeholdersPerRow)
        .join(",")}`;

      const multiParams: any[] = [];
      batch.forEach((item, bi) => multiParams.push(...buildParamsForItem(item, batchStart + bi)));

      try {
        await execWithRetry(multiSql, multiParams);
        return batch.length;
      } catch (multiErr) {
        // fallback: per-row insert inside short transaction, with execWithRetry per row
        log?.colorLog?.(
          "fts5",
          `multi-row insert failed at ${batchStart}, falling back to per-row insert: ${(multiErr as any)?.message ?? multiErr
          }`,
          "warn"
        );

        // try to do per-row in a transaction
        try {
          await execWithRetry("BEGIN;");
          let inserted = 0;
          for (let r = 0; r < batch.length; r++) {
            const rowParams = buildParamsForItem(batch[r], batchStart + r);
            const rowSql = `INSERT INTO ${this.fts5TableName} (${ftsCols.join(",")}) VALUES (${ftsCols
              .map(() => "?")
              .join(",")})`;
            await execWithRetry(rowSql, rowParams);
            inserted++;
          }
          await execWithRetry("COMMIT;");
          return inserted;
        } catch (perRowErr) {
          // rollback on failure and rethrow
          try {
            await execWithRetry("ROLLBACK;");
          } catch {
          }
          throw perRowErr;
        }
      }
    };

    // 执行路径：有 executor 则把每个 chunk 提交为一个空闲任务；否则在当前线程逐 chunk 执行
    let totalInserted = 0;
    if (!executor) {
      // current-thread mode (分批执行并让出主线程)
      for (let i = 0; i < entities.length; i += batchSize) {
        const batch = entities.slice(i, i + batchSize);
        const n = await writeChunk(i, batch);
        totalInserted += n;
        // 友好让出主线程
        await yieldControl();
      }
      await this.checkpointAndDeleteWAL();
      log?.colorLog?.("fts5", `batchInsertFTS5 inserted ${totalInserted} rows into ${this.fts5TableName}`, "success");
      return totalInserted;
    }

    // executor mode: 把每个 chunk 封装为 Promise 并通过 executor 调度执行。
    const chunkPromises: Promise<number>[] = [];
    for (let i = 0; i < entities.length; i += batchSize) {
      const start = i;
      const batch = entities.slice(i, i + batchSize);

      const p = new Promise<number>((resolve, reject) => {
        // submit task to executor; use unlimited execution time to avoid being cut off
        executor.addTask(
          async () => {
            try {
              const n = await writeChunk(start, batch);
              // friendly yield and resolve
              await yieldControl();
              resolve(n);
            } catch (e) {
              reject(e);
            }
          },
          // opts: 0 表示不限时（依据你的 executor 改动，0==unlimited）
          { priority: 0, timeout: 0, maxExecutionTime: 0 }
        );
      });

      chunkPromises.push(p);
    }

    // wait for all chunks
    const results = await Promise.all(chunkPromises);
    totalInserted = results.reduce((s, n) => s + n, 0);

    try {
      await this.checkpointAndDeleteWAL();
    } catch (e) {
      log?.colorLog?.("fts5", `checkpointAndDeleteWAL warning: ${(e as any)?.message ?? e}`, "warn");
    }

    log?.colorLog?.(
      "fts5",
      `batchInsertFTS5 (executor) inserted ${totalInserted} rows into ${this.fts5TableName}`,
      "success"
    );
    return totalInserted;
  }

  /**
   * 插入或更新 FTS5（简洁版，参数化）
   */
  async insertOrUpdateFTS(insertData: T | Partial<T>): Promise<void> {
    const data = { ...(insertData as Record<string, any>) };

    // 分词（记录警告但不阻塞）
    try {
      await this.tokenizeField(data as any, this.fts5MatchField);
    } catch (e) {
      log?.colorLog?.("fts5", `tokenizeField warning: ${(e as any)?.message ?? e}`, "warn");
    }

    const idCol = this.pkCol?.columnName;
    const pkValue = idCol ? (data as any)[this.pkCol.property] ?? (data as any)[idCol] : undefined;

    const ftsCols =
      Array.isArray(this.fts5Fields) && this.fts5Fields.length > 0 ? this.fts5Fields.slice() : Object.keys(data);
    if (idCol && !ftsCols.includes(idCol)) ftsCols.unshift(idCol);

    const colMetaMap = Array.isArray(this.cols)
      ? this.cols.reduce<Record<string, string>>((acc, c) => {
        acc[c.columnName] = c.property;
        return acc;
      }, {})
      : {};

    const getValForCol = (col: string) => {
      const prop = colMetaMap[col];
      return prop && (data as any)[prop] !== undefined ? (data as any)[prop] : (data as any)[col];
    };

    try {
      let exists = false;
      if (typeof pkValue !== "undefined" && pkValue !== null && pkValue !== "") {
        const rows = await this.fts5database.query<any[]>(
          `SELECT 1 FROM ${this.fts5TableName} WHERE ${idCol} = ? LIMIT 1`,
          [pkValue]
        );
        exists = Array.isArray(rows) && rows.length > 0;
      }

      const entries = ftsCols.map(col => ({ col, val: getValForCol(col) })).filter(e => typeof e.val !== "undefined");

      if (exists) {
        const sets: string[] = [];
        const params: any[] = [];
        for (const e of entries) {
          if (e.col === idCol) continue;
          sets.push(`${e.col} = ?`);
          params.push(e.val);
        }
        if (sets.length === 0) {
          log?.colorLog?.("fts5", `FTS5 update skipped (no fields) pk=${pkValue}`, "info");
          return;
        }
        params.push(pkValue);
        await this.fts5database.execute(
          `UPDATE ${this.fts5TableName} SET ${sets.join(", ")} WHERE ${idCol} = ?`,
          params
        );
        log?.colorLog?.("fts5", `FTS5 updated ${this.fts5TableName} pk=${pkValue}`, "success");
        return;
      }

      if (entries.length === 0) {
        log?.colorLog?.("fts5", `FTS5 insert skipped (no fields) data=${JSON.stringify(data)}`, "warn");
        return;
      }
      const cols = entries.map(e => e.col);
      const placeholders = entries.map(() => "?").join(", ");
      const params = entries.map(e => e.val);
      await this.fts5database.execute(
        `INSERT INTO ${this.fts5TableName} (${cols.join(", ")}) VALUES (${placeholders})`,
        params
      );
      log?.colorLog?.("fts5", `FTS5 inserted into ${this.fts5TableName} pk=${pkValue ?? "(none)"}`, "success");
    } catch (err) {
      log?.colorLog?.("fts5", `insertOrUpdateFTS error: ${(err as any)?.message ?? err}`, "error");
      throw err;
    }
  }

  /**
   * 删除单条或多条记录（支持传入数组）
   */
  async deleteFTSById(idOrIds: string | number | Array<string | number>): Promise<void> {
    try {
      const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
      if (ids.length === 0) return;

      const placeholders = ids.map(() => "?").join(", ");
      const sql = `DELETE FROM ${this.fts5TableName} WHERE ${this.pkCol.columnName} IN (${placeholders})`;
      await this.fts5database.execute(sql, ids);
      await this.checkpointAndDeleteWAL();
      log?.colorLog?.("fts5", `deleted ${ids.length} rows from ${this.fts5TableName}`, "success");
    } catch (err) {
      log?.colorLog?.("fts5", `deleteFTSById error: ${(err as any)?.message ?? err}`, "error");
      throw err;
    }
  }

  /**
   * 创建 FTS5 虚表（如果不存在）
   */
  async createFTSTable(): Promise<void> {
    const fields =
      Array.isArray(this.fts5Fields) && this.fts5Fields.length > 0
        ? this.fts5Fields.join(", ")
        : Object.keys(this.entity)
          .filter(k => k !== "constructor")
          .join(", ");
    const sql = `CREATE VIRTUAL TABLE IF NOT EXISTS ${this.fts5TableName} USING fts5(${fields})`;
    try {
      await this.fts5database.execute(sql);
      log?.colorLog?.("fts5", `createFTSTable ensured ${this.fts5TableName}`, "success");
    } catch (err) {
      log?.colorLog?.("fts5", `createFTSTable error: ${(err as any)?.message ?? err}`, "error");
      throw err;
    }
  }

  /**
   * 构建 FTS5 MATCH 表达式（支持 and/or/phrase）
   */
  private async buildMatchExpression(keyword: string, mode: "and" | "or" | "phrase" = "and"): Promise<string> {
    const raw = (keyword || "").trim();
    if (!raw) return "";

    // 1) 优先使用 segmenter 做分词
    let tokens: string[] = [];
    try {
      const seg = await segmenter.segment(raw);
      if (Array.isArray(seg) && seg.length > 0) tokens = seg.map(String);
    } catch (e) {
      // ignore 分词失败，后面回退
      log?.colorLog?.("fts5", `segmenter.segment warning: ${(e as any)?.message ?? e}`, "warn");
    }

    // 2) 分词结果为空时回退：中文拆字符，英文按空格
    if (tokens.length === 0) {
      if (/[\p{Script=Han}]/u.test(raw)) {
        tokens = Array.from(raw).filter(ch => !/\s/.test(ch));
      } else {
        tokens = raw.split(/\s+/).filter(Boolean);
      }
    }

    // 3) 清理 tokens 并去重
    tokens = Array.from(new Set(tokens.map(t => String(t).replace(/["']/g, "").trim()).filter(Boolean)));
    if (tokens.length === 0) return "";

    // 4) 根据模式构造表达式
    if (mode === "phrase") {
      // 精确短语搜索（整体用引号包裹）
      const phrase = tokens.join(" ");
      return `"${phrase}"`;
    }

    const joiner = mode === "and" ? " AND " : " OR ";
    // 使用前缀匹配 token*，提高命中（注意：FTS5 不支持 *token 的前置通配符）
    const parts = tokens.map(t => `${t}*`);
    return parts.join(joiner);
  }

  /**
   * 执行 WAL 检查点并删除 WAL 文件
   */
  private async checkpointAndDeleteWAL(): Promise<void> {
    try {
      await this.fts5database.execute("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch (err) {
      log?.colorLog?.("fts5", `checkpointAndDeleteWAL error: ${(err as any)?.message ?? err}`, "warn");
    }
  }

  /**
   * 使用 jieba 批量分词处理  优先匹配 nested_match_field   其次 match_field
   * @param entities 要分词的实体数组
   * @param colToProp 列名到属性名的映射
   * @returns 分词结果，键为实体索引，值为分词后的字符串数组
   */
  private async tokenizeBatch(
    entities: Array<Partial<T>>,
    colToProp: Record<string, string>
  ): Promise<Record<string, string[]>> {
    const textsToSegment: Record<string, string> = {};

    // 收集需要分词的文本
    entities.forEach((item, index) => {
      const fieldValue = colToProp[this.fts5MatchField]
        ? (item as any)[colToProp[this.fts5MatchField]] ?? (item as any)[this.fts5MatchField]
        : (item as any)[this.fts5MatchField];

      if (typeof fieldValue !== "string" || fieldValue.length === 0) return;

      let textToSegment = fieldValue;

      // 如果存在嵌合字段 则取嵌合字段
      if (this.fts5NestedMatchField) {
        try {
          const parsed = JSON.parse(fieldValue);
          if (typeof parsed === "object" && parsed !== null && typeof parsed[this.fts5NestedMatchField] === "string") {
            textToSegment = parsed[this.fts5NestedMatchField];
          } else {
            log?.colorLog?.(
              "fts5",
              `Nested field ${this.fts5NestedMatchField} not found or invalid in ${this.fts5MatchField}`,
              "warn"
            );
          }
        } catch (e) {
          log?.colorLog?.("fts5", `JSON parse warning for ${this.fts5MatchField}: ${(e as any)?.message ?? e}`, "warn");
        }
      }

      if (textToSegment.length > 0) {
        textsToSegment[index.toString()] = textToSegment;
      }
    });

    // 执行批量分词
    if (Object.keys(textsToSegment).length === 0) return {};
    try {
      // 调用 jieba 分词
      return await segmenter.batchSegment(textsToSegment);
    } catch (e) {
      log?.colorLog?.("fts5", `batchSegment warning: ${(e as any)?.message ?? e}`, "warn");
      return {};
    }
  }

  /**
   * 对特定字段进行分词处理（单条记录）
   */
  private async tokenizeField(data: T | Partial<T>, field: string): Promise<void> {
    const fieldValue = (data as any)[field];
    if (typeof fieldValue === "string" && fieldValue.length > 0) {
      let textToSegment = fieldValue;
      // if (this.fts5NestedMatchField) {
      //   try {
      //     const parsed = JSON.parse(fieldValue);
      //     if (
      //       typeof parsed === "object" &&
      //       parsed !== null &&
      //       this.fts5NestedMatchField in parsed &&
      //       typeof parsed[this.fts5NestedMatchField] === "string"
      //     ) {
      //       textToSegment = parsed[this.fts5NestedMatchField];
      //     } else {
      //       log?.colorLog?.(
      //         "fts5",
      //         `Nested field ${this.fts5NestedMatchField} not found or invalid in ${field}`,
      //         "warn"
      //       );
      //     }
      //   } catch (e) {
      //     log?.colorLog?.("fts5", `JSON parse warning for ${field}: ${(e as any)?.message ?? e}`, "warn");
      //   }
      // }
      if (textToSegment.length > 0) {
        const tokenizedValue = await segmenter.segment(textToSegment);
        (data as any)[field] = tokenizedValue.join(" ");
      }
    }
  }
}
