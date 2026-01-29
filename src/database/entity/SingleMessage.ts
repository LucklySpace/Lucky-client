import { MessageType } from "@/constants";
import { Column, Entity, FTS5, PrimaryKey } from "../orm/annotation/Decorators";
import BaseEntity from "../orm/BaseEntity";

/**
 * 单聊消息实体
 *
 * @table single_message - 私聊消息主表
 * @fts5 single_message_virtual - 全文检索虚拟表（索引 messageBody.text）
 */
@FTS5({
  virtual_name: "single_message_virtual",
  fields: ["messageId", "ownerId", "messageBody", "messageContentType", "fromId", "toId", "sequence"],
  match_field: "messageBody",
  nested_match_field: "text"
})
@Entity("single_message")
export default class SingleMessage extends BaseEntity {
  @PrimaryKey(false)
  @Column("messageId", "TEXT")
  messageId!: string;

  @Column("fromId", "TEXT")
  fromId!: string;

  @Column("toId", "TEXT")
  toId!: string;

  @Column("ownerId", "TEXT")
  ownerId!: string;

  @Column("messageBody", "TEXT")
  messageBody!: string;

  @Column("messageContentType", "INTEGER")
  messageContentType?: number;

  @Column("messageTime", "INTEGER")
  messageTime!: number;

  @Column("messageType", "INTEGER")
  messageType: number = MessageType.SINGLE_MESSAGE.code;

  @Column("readStatus", "INTEGER")
  readStatus!: number;

  @Column("sequence", "INTEGER")
  sequence!: number;

  @Column("extra", "TEXT", true)
  extra?: string;
}
