import { IMessageType } from "@/constants";
import { Column, Entity, FTS5, PrimaryKey } from "../orm/annotation/Decorators";
import BaseEntity from "../orm/BaseEntity";

/**
 * 单聊消息实体，支持全文检索
 *
 * - 普通表：single_message
 * - 虚拟 FTS5 表：single_message_virtual
 */
@FTS5({
  virtual_name: "single_message_virtual",
  fields: ["messageId", "ownerId", "messageBody", "messageContentType", "fromId", "toId", "sequence"],
  match_field: "messageBody",
  nested_match_field: "text"
})
@Entity("single_message")
export default class SingleMessage extends BaseEntity {
  /** 消息 ID（主键，唯一） */
  @PrimaryKey(false)
  @Column("messageId", "TEXT")
  messageId!: string;

  /** 发送者用户 ID */
  @Column("fromId", "TEXT")
  fromId!: string;

  /** 接收者用户 ID */
  @Column("toId", "TEXT")
  toId!: string;

  /** 消息所有者 ID（一般与 fromId 相同） */
  @Column("ownerId", "TEXT")
  ownerId!: string;

  /** 消息正文内容 */
  @Column("messageBody", "TEXT")
  messageBody!: string;

  /** 消息内容类型（如 text/image/video） */
  @Column("messageContentType", "INTEGER")
  messageContentType?: number;

  /** 消息发送时间戳（毫秒） */
  @Column("messageTime", "INTEGER")
  messageTime!: number;

  /** 应用层消息类型（如 chat/notification） */
  @Column("messageType", "INTEGER")
  messageType: number = IMessageType.SINGLE_MESSAGE.code;

  /** 阅读状态：0 未读，1 已读 */
  @Column("readStatus", "INTEGER")
  readStatus!: number;

  /** 消息序列号，用于排序、去重 */
  @Column("sequence", "INTEGER")
  sequence!: number;

  /** 扩展字段，存放额外 JSON 信息 */
  @Column("extra", "TEXT", true)
  extra?: string;
}
