import GroupMessage from "../entity/GroupMessage";
import xmlText from "./GroupMessageMapper.xml?raw";
import { BaseFTS5Mapper } from "../orm/BaseFTS5Mapper";
import { MessageContentType } from "@/constants";

/**
 * 群聊消息
 */
class GroupMessageMapper extends BaseFTS5Mapper<GroupMessage> {
  constructor() {
    super(GroupMessage);
    this.loadSqlByText(xmlText);
  }

  /**
   * 倒序查询消息
   * @param ownerId
   * @param groupId 群id
   * @param num 页码
   * @param size 条数
   * @returns 消息列表
   */
  findMessage(ownerId: any, groupId: any, num: any, size: any): Promise<any> {
    return this.querySql("findMessage", { groupId, ownerId, num, size });
  }

  /**
   * 最后一条消息
   * @param groupId 群id
   * @returns
   */
  async findLastMessage(groupId: any): Promise<any> {
    const res = await this.querySql("findLastMessage", { groupId });
    return res[0];
  }

  /**
   * 消息数量
   * @param groupId 群id
   * @returns
   */
  async findMessageCount(ownerId: any, groupId: any): Promise<any> {
    const res = await this.querySql("findMessageCount", { ownerId, groupId });
    return res[0]["count(*)"];
  }

  /**
   * 查询会话所有url
   * @param groupId 群id
   * @returns
   */
  findMessageUrl(groupId: any): Promise<any> {
    const imageCode = MessageContentType.IMAGE.code;
    const videoCode = MessageContentType.VIDEO.code;
    const sql = `SELECT * FROM ${this.tableName} WHERE groupId=${groupId} AND  (messageContentType= ${imageCode} or messageContentType= ${videoCode})`;
    return this.querySql(sql);
  }

  /**
   * 清空群聊聊天记录
   * @param groupId 群ID
   * @returns 
   */
  async clearChatHistory(groupId: string, ownerId: string): Promise<boolean> {
    try {
      // 删除普通表中的聊天记录
      await this.executeSql("clearChatHistory", { groupId, ownerId });

      // 删除FTS5虚拟表中的记录
      await this.executeFTS5Sql("clearChatHistoryVirtual", { groupId, ownerId });

      return true;
    } catch (error) {
      console.error("清空群聊记录失败:", error);
      return false;
    }
  }

  /**
   * 退出群聊（删除当前用户的群聊记录）
   * @param groupId 群ID
   * @param ownerId 当前用户ID
   * @returns 是否成功
   */
  async quitGroup(groupId: string, ownerId: string): Promise<boolean> {
    try {
      // 删除实体表中当前用户的群聊记录
      await this.executeSql("deleteByGroupIdAndOwnerId", { groupId, ownerId });
      // 删除虚拟表中当前用户的群聊记录
      await this.executeFTS5Sql("deleteByGroupIdAndOwnerIdVirtual", { groupId, ownerId });
      return true;
    } catch (error) {
      console.error("退出群聊时删除记录失败:", error);
      return false;
    }
  }

}



export default GroupMessageMapper;
