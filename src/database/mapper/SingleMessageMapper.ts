import SingleMessage from "../entity/SingleMessage";
import xmlText from "./SingleMessageMapper.xml?raw";
import { BaseFTS5Mapper } from "../orm/BaseFTS5Mapper";
import { MessageContentType } from "@/constants";

/**
 * 单聊消息
 */
class SingleMessageMapper extends BaseFTS5Mapper<SingleMessage> {
  constructor() {
    super(SingleMessage);
    this.loadSqlByText(xmlText);
  }

  /**
   * 倒序查询消息
   * @param fromId 发送人
   * @param toId 接收人
   * @param num 页码
   * @param size 条数
   * @returns 消息列表
   */
  findMessage(fromId: any, toId: any, num: number, size: number): Promise<any> {
    return this.querySql("findMessage", { fromId, toId, num, size });
  }

  /**
   * 最后一条消息
   * @param fromId 发送人
   * @param toId 接收人
   * @returns
   */
  async findLastMessage(fromId: any, toId: any): Promise<any> {
    const res = await this.querySql("findLastMessage", { fromId, toId });
    return res[0];
  }

  /**
   * 消息数量
   * @param fromId 发送人
   * @param toId 接收人
   * @returns
   */
  async findMessageCount(fromId: any, toId: any): Promise<any> {
    const res = await this.querySql("findMessageCount", { fromId, toId });
    return res[0]["count(*)"];
  }

  /**
   * 删除聊天记录
   * @param fromId 发送人
   * @param toId 接收人
   * @returns
   */
  async deleteByFormIdAndToId(fromId: any, toId: any): Promise<any> {
    return this.executeSql("deleteByFormIdAndToId", { fromId, toId });
  }

  /**
   * 删除索引表聊天记录
   * @param fromId 发送人
   * @param toId 接收人
   * @returns
   */
  async deleteByFormIdAndToIdVirtual(fromId: any, toId: any): Promise<any> {
    return this.executeFTS5Sql("deleteByFormIdAndToId__virtual", { fromId, toId });
  }

  findMessageUrl(fromId: any, toId: any): Promise<any[]> {
    const imageCode = MessageContentType.IMAGE.code;
    const videoCode = MessageContentType.VIDEO.code;
    const sql = `SELECT * FROM ${this.tableName} WHERE (fromId = ${fromId} AND toId = ${toId}) OR (fromId = ${toId} AND toId =${fromId}) AND  (messageContentType= ${imageCode} OR messageContentType= ${videoCode})`;
    return this.querySql(sql);
  }
}

export default SingleMessageMapper;
