/**
 * 设置表信息
 * @param config 实体配置
 * @returns
 */
function Entity(config: EntityConfig) {
  return function <T extends { new(...args: any[]): {} }>(constructor: T) {
    // 定义表名
    constructor.prototype.getTableName = function() {
      return config.tableName;
    };

    // 定义ID字段
    constructor.prototype.getId = function() {
      return config.idField;
    };

    // 自动生成字段类型映射
    constructor.prototype.getFieldType = function() {
      const fieldTypes: Record<string, string> = {};

      // 访问类的原型，获取所有字段的类型信息
      const instance: any = new constructor();
      for (const key in instance) {
        if (instance.hasOwnProperty(key)) {
          const type = typeof instance[key];
          fieldTypes[key] = type;
        }
      }

      return fieldTypes;
    };
  };
}

export default Entity;


interface EntityConfig {
  tableName: string; // 表名
  idField: string; // 主键字段
}
