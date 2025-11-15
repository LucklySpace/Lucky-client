import Friends from "../entity/Friends";
import xmlText from "./FriendsMapper.xml?raw";
import { BaseFTS5Mapper } from "../orm/BaseFTS5Mapper";

/**
 * 好友操作
 */
class FriendsMapper extends BaseFTS5Mapper<Friends> {
  constructor() {
    super(Friends);
    this.loadSqlByText(xmlText);
  }

  findLast(): Promise<any> {
    return this.querySql("findLast");
  }
}

export default FriendsMapper;
