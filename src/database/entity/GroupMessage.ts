import { MessageType } from "@/constants";
import { Column, Entity, FTS5, PrimaryKey } from "../orm/annotation/Decorators";
import BaseEntity from "../orm/BaseEntity";

/**
 * 群聊消息表
 *
 * @tableName group_messages
 */
@FTS5({
  virtual_name: "group_message_virtual",
  fields: ["messageId", "ownerId", "messageBody", "messageContentType", "groupId", "sequence"],
  match_field: "messageBody",
  nested_match_field: "text"
})
@Entity("group_message")
export default class GroupMessage extends BaseEntity {
  /** 消息 ID（主键） */
  @PrimaryKey(false)
  @Column("messageId", "TEXT")
  messageId!: string;

  /** 发送者用户 ID */
  @Column("fromId", "TEXT")
  fromId!: string;

  /** 原始消息所属者 ID（比如群主/机器人） */
  @Column("ownerId", "TEXT")
  ownerId!: string;

  /** 群组 ID */
  @Column("groupId", "TEXT")
  groupId!: string;

  /** 消息内容体（JSON 或纯文本） */
  @Column("messageBody", "TEXT")
  messageBody!: string;

  /** 内容类型（例如 "text"、"image"） */
  @Column("messageContentType", "INTEGER")
  messageContentType!: number;

  /** 消息发送时间戳（毫秒） */
  @Column("messageTime", "INTEGER")
  messageTime?: number;

  /** 消息类型（业务侧分类，如 "chat"、"notification"） */
  @Column("messageType", "INTEGER")
  messageType: number = MessageType.GROUP_MESSAGE.code;

  /** 阅读状态（0 未读，1 已读） */
  @Column("readStatus", "INTEGER")
  readStatus?: number;

  /** 序列号，用于消息排序或去重 */
  @Column("sequence", "INTEGER")
  sequence?: number;

  /** 扩展字段，可存放附加 JSON 信息 */
  @Column("extra", "TEXT", true)
  extra?: string;
}
