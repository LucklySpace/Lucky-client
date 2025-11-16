import { Column, Entity, FTS5, PrimaryKey } from "../orm/annotation/Decorators";
import BaseEntity from "../orm/BaseEntity";

/**
 * 好友关系表
 *
 * @tableName friends
 */
@FTS5({
  virtual_name: "friends_virtual", // 虚拟表名
  fields: ["userId", "friendId", "name", "location", "sequence"], // 数据库字段
  match_field: "name" // 默认搜索字段
})
@Entity("friends")
export default class Friends extends BaseEntity {
  /** 用户 ID（当前用户） */
  @PrimaryKey(false) // 非自增主键
  @Column("userId", "TEXT")
  userId!: string;

  /** 好友用户 ID */
  @Column("friendId", "TEXT")
  friendId!: string;

  /** 好友名称（昵称） */
  @Column("name", "TEXT")
  name!: string;

  /** 备注名 */
  @Column("remark", "TEXT", true)
  remark?: string;

  /** 好友头像 URL */
  @Column("avatar", "TEXT", true)
  avatar?: string;

  /** 用户性别：0 未知，1 男，2 女 */
  @Column("userSex", "INTEGER", true)
  gender?: number;

  /** 所在地 */
  @Column("location", "TEXT", true)
  location?: string;

  /** 黑名单标志：0 否，1 是 */
  @Column("black", "INTEGER")
  black!: number;

  /** 标志位（备用） */
  @Column("flag", "TEXT", true)
  flag?: string;

  /** 生日，格式 YYYY-MM-DD */
  @Column("birthday", "TEXT", true)
  birthday?: string;

  /** 个性签名 */
  @Column("selfSignature", "TEXT", true)
  selfSignature?: string;

  /** 消息序号，用于排序和去重 */
  @Column("sequence", "INTEGER")
  sequence!: number;
}
