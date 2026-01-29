import { Column, Entity, FTS5, PrimaryKey } from "../orm/annotation/Decorators";
import BaseEntity from "../orm/BaseEntity";

/**
 * 会话实体
 *
 * @table chats - 会话主表
 * @fts5 chats_virtual - 全文检索虚拟表（索引 name 字段）
 */
@FTS5({ virtual_name: "chats_virtual", fields: ["chatId", "name"], match_field: "name" })
@Entity("chats")
export default class Chats extends BaseEntity {
  @PrimaryKey(false)
  @Column("chatId", "TEXT")
  chatId!: string;

  @Column("chatType", "INTEGER")
  chatType!: number;

  @Column("ownerId", "TEXT")
  ownerId!: string;

  @Column("toId", "TEXT")
  toId!: string;

  @Column("isMute", "INTEGER")
  isMute!: number;

  @Column("isTop", "INTEGER")
  isTop!: number;

  @Column("sequence", "INTEGER")
  sequence?: number;

  @Column("name", "TEXT")
  name!: string;

  @Column("avatar", "TEXT", true)
  avatar?: string;

  @Column("unread", "INTEGER")
  unread!: number;

  @Column("message", "TEXT", true)
  message?: string;

  @Column("messageTime", "INTEGER", true)
  messageTime?: number;

  @Column("notification", "TEXT", true)
  notification?: string;
}
