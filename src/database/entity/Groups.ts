import { Column, Entity, FTS5, PrimaryKey } from "../orm/annotation/Decorators";
import BaseEntity from "../orm/BaseEntity";

/**
 * 群组实体
 *
 * @table groups - 群组主表
 * @fts5 groups_virtual - 全文检索虚拟表（索引 groupName 字段）
 */
@FTS5({ virtual_name: "groups_virtual", fields: ["groupId", "groupName", "ownerId"], match_field: "groupName" })
@Entity("groups")
export default class Groups extends BaseEntity {
  @PrimaryKey(false)
  @Column("groupId", "TEXT")
  groupId!: string;

  @Column("groupName", "TEXT")
  groupName!: string;

  @Column("ownerId", "TEXT")
  ownerId!: string;

  @Column("avatar", "TEXT", true)
  avatar?: string;

  @Column("introduction", "TEXT", true)
  introduction?: string;

  @Column("notification", "TEXT", true)
  notification?: string;

  @Column("sequence", "INTEGER")
  sequence?: number;
}
