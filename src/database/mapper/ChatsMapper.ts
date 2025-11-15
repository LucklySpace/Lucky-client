import Chats from "../entity/Chats";
import xmlText from "./ChatsMapper.xml?raw";
import { BaseFTS5Mapper } from "../orm/BaseFTS5Mapper";

/**
 * 会话操作
 */
class ChatsMapper extends BaseFTS5Mapper<Chats> {
  constructor() {
    super(Chats);
    this.loadSqlByText(xmlText);
  }

  /** 获取最后一条消息 */
  //@Transaction()
  findLastChat(): Promise<any> {
    return this.querySql("findLastChat");
  }
}

export default ChatsMapper;
