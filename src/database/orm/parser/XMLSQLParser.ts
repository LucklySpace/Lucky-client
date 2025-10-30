/**
 * Mapper xml 解析 sql 工具
 */
export default class XMLSQLParser {
  // xml 文档
  private xmlDoc: Document;
  // 符号映射
  private symbolMap: Map<string, string>;

  /**
   * 构造函数
   * @param xmlDocStr xml 字符串
   */
  constructor(xmlDocStr: string) {
    // 初始化符号映射表
    this.symbolMap = new Map<string, string>([
      ["&lt;", "<"],
      ["&gt;", ">"],
      ["&amp;", "&"],
      ["&quot;", "\""],
      ["&apos;", "'"]
    ]);

    const parser = new DOMParser();
    // 解析XML文档
    this.xmlDoc = parser.parseFromString(xmlDocStr, "text/xml");

    // 简单的错误处理
    const parserError = this.xmlDoc.getElementsByTagName("parsererror");

    if (parserError.length) {
      throw new Error("Error parsing XML: " + parserError[0].textContent);
    }
  }

  /**
   * 获取sql语句映射
   * @returns
   */
  getSQLMap(): Map<string, string> {
    const sqlMap = new Map<string, string>();
    this.listSQLStatements().forEach((sqlName: string) => {
      const sql = this.getSQLStatement(sqlName);
      if (sql) {
        // 去除空格和换行符
        sqlMap.set(sqlName.trim(), sql.trim());
      }
    });
    return sqlMap;
  }

  /**
   * 获取类名属性的值
   */
  getClassName(): string | null {
    const sqlStoreElement = this.xmlDoc.documentElement;
    return sqlStoreElement.getAttribute("className");
  }

  /**
   * 获取sql名称对应的sql语句
   * @param sqlName
   * @returns
   */
  private getSQLStatement(sqlName: string): string | null {
    const sqlElements = this.xmlDoc.getElementsByTagName("SQL");
    for (let i = 0; i < sqlElements.length; i++) {
      const sqlElement = sqlElements[i];
      if (sqlElement && sqlElement.getAttribute("name") === sqlName) {
        let sqlContent = sqlElement.textContent;
        if (sqlContent) {
          return this.replaceSymbols(sqlContent.trim());
        }
      }
    }
    return null;
  }

  /**
   * 获取所有sql名称
   * @returns
   */
  private listSQLStatements(): string[] {
    const sqlElements: HTMLCollectionOf<Element> = this.xmlDoc.getElementsByTagName("SQL");
    return Array.from(sqlElements).map((sql: any) => sql.getAttribute("name"));
  }

  /**
   * 替换SQL中的特殊符号
   * @param sql
   * @returns
   */
  private replaceSymbols(sql: string): string {
    let replacedSQL = sql;
    this.symbolMap.forEach((value, key) => {
      replacedSQL = replacedSQL.replace(new RegExp(key, "g"), value);
    });
    return replacedSQL;
  }
}
