import { Column, Entity, FTS5, PrimaryKey } from "../orm/annotation/Decorators";
import BaseEntity from "../orm/BaseEntity";

/**
 * 好友关系实体
 *
 * @table friends - 好友关系主表
 * @fts5 friends_virtual - 全文检索虚拟表（索引 name 字段）
 */
@FTS5({ virtual_name: "friends_virtual", fields: ["userId", "friendId", "name", "location", "sequence"], match_field: "name" })
@Entity("friends")
export default class Friends extends BaseEntity {
  @PrimaryKey(false)
  @Column("userId", "TEXT")
  userId!: string;

  @Column("friendId", "TEXT")
  friendId!: string;

  @Column("name", "TEXT")
  name!: string;

  @Column("remark", "TEXT", true)
  remark?: string;

  @Column("avatar", "TEXT", true)
  avatar?: string;

  @Column("userSex", "INTEGER", true)
  userSex?: number;

  @Column("location", "TEXT", true)
  location?: string;

  @Column("black", "INTEGER")
  black!: number;

  @Column("flag", "TEXT", true)
  flag?: string;

  @Column("birthday", "TEXT", true)
  birthday?: string;

  @Column("selfSignature", "TEXT", true)
  selfSignature?: string;

  @Column("sequence", "INTEGER")
  sequence!: number;
}
