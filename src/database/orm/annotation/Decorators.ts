import "reflect-metadata";

const META_TABLE = Symbol("table");
const META_COLUMNS = Symbol("columns");
const META_PK = Symbol("primaryKey");
const META_FTS5 = Symbol("fts5");

export interface ColumnMeta {
  property: string;
  columnName: string;
  type: "INTEGER" | "TEXT" | "REAL";
  nullable: boolean;
}

// 表名
export function Entity(tableName?: string) {
  return (ctor: Function) => {
    Reflect.defineMetadata(META_TABLE, tableName || ctor.name.toLowerCase(), ctor);
  };
}

// 主键
export function PrimaryKey(auto = false) {
  return (proto: any, prop: string) => {
    Reflect.defineMetadata(META_PK, { property: prop, auto }, proto.constructor);
  };
}

// 列名
export function Column(columnName?: string, type: "INTEGER" | "TEXT" | "REAL" = "TEXT", nullable = false) {
  return (proto: any, prop: string) => {
    const ctor = proto.constructor;
    const cols: ColumnMeta[] = Reflect.getMetadata(META_COLUMNS, ctor) || [];
    cols.push({
      property: prop,
      columnName: columnName || prop,
      type,
      nullable
    });
    Reflect.defineMetadata(META_COLUMNS, cols, ctor);
  };
}

/**
 * 用于标记 FTS5 字段和表名
 * @param config 虚拟表信息
 */
export function FTS5(config: FTS5Config) {
  return function(constructor: Function) {
    Reflect.defineMetadata(
      META_FTS5,
      {
        virtual_name: config.virtual_name,
        fields: config.fields,
        match_field: config.match_field,
        nested_match_field: config.nested_match_field
      },
      constructor
    );
  };
}

export interface FTS5Config {
  virtual_name: string; // 虚拟表名
  fields: string[]; // 虚拟表字段
  match_field: string; // 匹配字段
  nested_match_field: string; // 内嵌分词字段
}

// 导出 metadata keys
export const Metadata = {
  TABLE: META_TABLE,
  COLUMNS: META_COLUMNS,
  PRIMARY_KEY: META_PK,
  FTS5: META_FTS5
};
