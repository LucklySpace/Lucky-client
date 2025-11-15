import { Entity, FTS5 } from "../orm/annotation/Decorators";
import BaseEntity from "../orm/BaseEntity";

/**
 * 群组关系表
 *
 * @tableName groups
 */
@FTS5({
  virtual_name: "groups_virtual", // 虚拟表名
  fields: ["userId", "friendId", "name", "location", "sequence"], // 数据库字段
  match_field: "name" // 默认搜索字段
})
@Entity("friends")
export default class Groups extends BaseEntity {

}
