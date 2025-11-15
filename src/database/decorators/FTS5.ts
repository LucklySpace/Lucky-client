/**
 * 用于标记 FTS5 字段和表名
 * @param config 虚拟表信息
 */
function FTS5(config: FTS5Config) {
  return function(constructor: Function) {
    constructor.prototype.fts5TableName = config.virtual_name;
    constructor.prototype.fts5Fields = config.fields;
    constructor.prototype.fts5MatchField = config.match_field;
    constructor.prototype.fts5NestedMatchField = config.nested_match_field;
  };
}

interface FTS5Config {
  virtual_name: string; // 虚拟表名
  fields: string[]; // 虚拟表字段
  match_field: string; // 匹配字段
  nested_match_field: string; // 内嵌分词字段
}

export { FTS5 };
