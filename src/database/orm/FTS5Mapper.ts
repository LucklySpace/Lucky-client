// import { BaseMapper, QueryBuilder } from "./BaseMapper";
// import segmenter from './Segmenter';
// import Log from "@/utils/Log";

// /**
//  * FTS5Mapper类，用于处理FTS5表的操作
//  */
// export abstract class FTS5Mapper<T> extends BaseMapper<T> {
//     private fts5Fields: string[];
//     private fts5TableName: string;
//     private fts5MatchField: string;

//     /**
//      * FTS5Mapper构造函数
//      * @param db 数据库连接
//      * @param entity 实体类
//      */
//     constructor(db: any, entity: new (...args: any[]) => T) {
//         super(db, entity);
//         this.fts5Fields = entity.prototype.fts5Fields || [];
//         this.fts5TableName = entity.prototype.fts5TableName;
//         this.fts5MatchField = entity.prototype.fts5MatchField;
//     }

//     /**
//      * 创建FTS5表
//      */
//     async createFTSTable(): Promise<void> {
//         const fields = this.fts5Fields.length > 0
//             ? this.fts5Fields.join(', ')
//             : Object.keys(this.entity).filter(key => key !== 'constructor').join(', ');
//         const sql = `CREATE VIRTUAL TABLE IF NOT EXISTS ${this.fts5TableName} USING fts5(${fields})`;
//         await this.execute(sql);
//     }

//     /**
//      * 插入或更新FTS5表数据，并在插入前进行分词
//      * @param {T} insertData 插入或更新数据
//      */
//     async insertOrUpdateFTS(insertData: T): Promise<void> {
//         const tokenizedData = { ...insertData };

//         // 分词处理
//         await this.tokenizeField(tokenizedData, this.fts5MatchField);

//         const idValue = this.formatValue(insertData[this.id as keyof T]);
//         const existingRecord = await this.query(`SELECT 1 FROM ${this.fts5TableName} WHERE ${this.id} = ${idValue}`);

//         let sql;
//         if (existingRecord.length > 0) {
//             const updateData = this.filterFields(tokenizedData);
//             sql = `UPDATE ${this.fts5TableName} SET ${this.generateSetClause(updateData, true)} WHERE ${this.id} = ${idValue}`;
//         } else {
//             const insertData = this.filterFields(tokenizedData);
//             sql = `INSERT INTO ${this.fts5TableName} (${this.getFields()}) VALUES (${this.getValues(insertData)})`;
//         }

//         this.execute(sql);
//         //Log.colorLog('fts5', `single data:${JSON.stringify(insertData)}`, 'success');
//     }

//     /**
//      * 通用分页查询方法
//      * @param {string} baseSql 基础 SQL 语句（不包含分页部分）
//      * @param {number} pageNumber 当前页码，默认为 1
//      * @param {number} pageSize 每页条数，默认为 15
//      * @param {string} order 排序方式，默认为 'ASC'
//      * @returns 分页结果
//      */
//     async pageFTS5Query(queryBuilder: QueryBuilder<T>, pageNumber: number = 1, pageSize: number = 15): Promise<PageResult<T>> {

//         const offset = (pageNumber - 1) * pageSize;
//         const limit = pageSize;

//         const baseSql = queryBuilder.build(this.fts5TableName);

//         // 构建分页 SQL
//         let paginatedSql = `${baseSql} ORDER BY ${this.id} DESC LIMIT ${offset}, ${limit}`;

//         Log.prettyPrimary("execute paginated sql:", paginatedSql);

//         // 查询数据
//         const list = await this.query(paginatedSql);

//         // 获取总数
//         const totalSql = `SELECT COUNT(*) AS count FROM (${baseSql}) AS subquery`;
//         const totalResult = await this.query(totalSql);
//         const total = totalResult[0].count;

//         return { list, total };
//     }

//     /**
//      * 删除FTS5表中的记录
//      * @param {string | number} id 主键值
//      */
//     async deleteFTSById(id: string | number): Promise<void> {
//         const sql = `DELETE FROM ${this.fts5TableName} WHERE ${this.id} = ${this.formatValue(id)}`;
//         await this.execute(sql);
//         await this.checkpointAndDeleteWAL(); // 删除记录后，进行检查点操作
//     }

//     /**
//     * 使用查询构建器查询数据
//     * @param {QueryBuilder<T>} queryBuilder 查询构建器
//     * @returns 
//     */
//     async findByQueryBuilder(queryBuilder: QueryBuilder<T>): Promise<T[]> {
//         const sql = queryBuilder.build(this.fts5TableName);
//         return this.query(sql);
//     }

//     /**
//      * 使用FTS5进行全文检索，使用默认字段
//      * @param {string} query 搜索关键词
//      * @returns {Promise<T[]>} 搜索结果
//      */
//     async search(query: string): Promise<T[]> {
//         const sql = `SELECT * FROM ${this.fts5TableName} WHERE ${this.fts5MatchField} MATCH '${query}'`;
//         return await this.query(sql);
//     }

//     /**
//      * 使用FTS5进行全文检索，使用自定义字段
//      * @param {string} query 搜索关键词
//      * @param {string} field 字段名称
//      * @returns {Promise<T[]>} 搜索结果
//      */
//     async searchByField(query: string, field: string): Promise<T[]> {
//         const sql = `SELECT * FROM ${this.fts5TableName} WHERE ${field} MATCH '${query}'`;
//         return await this.query(sql);
//     }

//     /**
//      * 使用FTS5进行模糊匹配搜索，使用默认字段
//      * @param {string} query 搜索关键词
//      * @returns {Promise<T[]>} 搜索结果
//      */
//     async like(query: string): Promise<T[]> {
//         const sql = `SELECT * FROM ${this.fts5TableName} WHERE ${this.fts5MatchField} LIKE '%${query}%'`;
//         return await this.query(sql);
//     }

//     /**
//      * 使用FTS5进行模糊匹配搜索，使用自定义字段
//      * @param query 搜索关键词
//      * @param field 字段名称
//      * @returns 
//      */
//     async likeByField(query: string, field: string): Promise<T[]> {
//         const sql = `SELECT * FROM ${this.fts5TableName} WHERE ${field} LIKE '%${query}%'`;
//         return await this.query(sql);
//     }


//     /**
//      * 获取用于插入或更新的字段列表
//      */
//     private getFields(): string {
//         return this.fts5Fields.length > 0
//             ? this.fts5Fields.join(', ')
//             : Object.keys(this.entity).filter(key => key !== 'constructor').join(', ');
//     }

//     /**
//      * 获取用于插入的字段值列表
//      * @param {T} data 插入或更新的数据
//      */
//     private getValues(data: T): string {
//         return Object.values(data as object).map(this.formatValue).join(', ');
//     }

//     /**
//      * 对特定字段进行分词处理
//      * @param {T} data 数据对象
//      * @param {string} field 要分词的字段
//      */
//     private async tokenizeField(data: T, field: string): Promise<void> {
//         const fieldValue = (data as any)[field];
//         if (typeof fieldValue === 'string') {
//             const tokenizedValue = await segmenter.segment(fieldValue);
//             (data as any)[field] = tokenizedValue.join(' ');
//         }
//     }

//     /**
//      * 过滤数据对象中的字段，仅保留 FTS5 定义的字段
//      * @param {T} data 数据对象
//      * @returns {Partial<T>} 过滤后的数据对象
//      */
//     private filterFields(data: T): any {
//         const filteredData: any = {};
//         for (const field of this.fts5Fields) {
//             if ((data as any)[field] !== undefined) {
//                 (filteredData as any)[field] = (data as any)[field];
//             }
//         }
//         return filteredData;
//     }

//     /**
//      * 执行 WAL 检查点并删除 WAL 文件
//      */
//     private async checkpointAndDeleteWAL(): Promise<void> {
//         // 执行 WAL 检查点操作，将 WAL 文件中的数据写入主数据库文件
//         await this.execute('PRAGMA wal_checkpoint(TRUNCATE);');
//     }
// }


