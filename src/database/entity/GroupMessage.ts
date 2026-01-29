import { MessageType } from "@/constants";
import { Column, Entity, FTS5, PrimaryKey } from "../orm/annotation/Decorators";
import BaseEntity from "../orm/BaseEntity";

/**
 * 群聊消息实体
 *
 * @table group_message - 群消息主表
 * @fts5 group_message_virtual - 全文检索虚拟表（索引 messageBody.text）
 */
@FTS5({
  virtual_name: "group_message_virtual",
  fields: ["messageId", "ownerId", "messageBody", "messageContentType", "groupId", "sequence"],
  match_field: "messageBody",
  nested_match_field: "text"
})
@Entity("group_message")
export default class GroupMessage extends BaseEntity {
  @PrimaryKey(false)
  @Column("messageId", "TEXT")
  messageId!: string;

  @Column("fromId", "TEXT")
  fromId!: string;

  @Column("ownerId", "TEXT")
  ownerId!: string;

  @Column("groupId", "TEXT")
  groupId!: string;

  @Column("messageBody", "TEXT")
  messageBody!: string;

  @Column("messageContentType", "INTEGER")
  messageContentType!: number;

  @Column("messageTime", "INTEGER")
  messageTime?: number;

  @Column("messageType", "INTEGER")
  messageType: number = MessageType.GROUP_MESSAGE.code;

  @Column("readStatus", "INTEGER")
  readStatus?: number;

  @Column("sequence", "INTEGER")
  sequence?: number;

  @Column("extra", "TEXT", true)
  extra?: string;
}
