import { Column, Entity, FTS5, PrimaryKey } from "../orm/annotation/Decorators";
import BaseEntity from "../orm/BaseEntity";

/**
 * 普通 ORM 实体：Chats 表
 *
 * 将会同时创建一个常规表 （Entity 保持在 BaseMapper 中建表）
 * 以及一个 FTS5 虚拟表（@FTS5 标记）
 * @virtual_name   虚拟表名称
 * @fields         参与全文索引的字段列表
 * @match_field    默认 MATCH 查询字段
 */
@FTS5({
  virtual_name: "chats_virtual",
  fields: ["chatId", "name"],
  match_field: "name"
})
@Entity("chats")
export default class Chats extends BaseEntity {

  /** 聊天 ID */
  @PrimaryKey(false)
  @Column("chatId", "TEXT")
  chatId!: string;

  /** 聊天类型 */
  @Column("chatType", "INTEGER")
  chatType!: number;

  /** 群/会话拥有者 */
  @Column("ownerId", "TEXT")
  ownerId!: string;

  /** 会话目标 ID */
  @Column("toId", "TEXT")
  toId!: string;

  /** 是否静音（0 否，1 是） */
  @Column("isMute", "INTEGER")
  isMute!: number;

  /** 是否置顶（0 否，1 是） */
  @Column("isTop", "INTEGER")
  isTop!: number;

  /** 消息序列号，用于去重/排序 */
  @Column("sequence", "INTEGER")
  sequence?: number;

  /** 会话名称（如群名称或对话人昵称） */
  @Column("name", "TEXT")
  name!: string;

  /** 会话头像 URL */
  @Column("avatar", "TEXT", true)
  avatar?: string;

  /** 未读消息数 */
  @Column("unread", "INTEGER")
  unread!: number;

  /** 最后一条消息内容 */
  @Column("message", "TEXT", true)
  message?: string;

  /** 最后一条消息时间戳（毫秒） */
  @Column("messageTime", "INTEGER", true)
  messageTime?: number;

  /** 群公告 */
  @Column("notification", "TEXT", true)
  notification?: string;
}
