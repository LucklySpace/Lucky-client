import { IMessageType, StoresEnum } from "@/constants";
import api from "@/api/index";
//import { storage } from '@/utils/Storage'
import { useMappers } from "@/database";
import { storage } from "@/utils/Storage";
import Chats from "@/database/entity/Chats";
import { useUserStore } from "./user";
import { useChatMainStore } from "./chat";
import { useMessageStore } from "./message";

//import { genFriend, genFriends, genGroup, genGroups, toReactivePayload } from "@/mock/ShipMockData";

// mappers（DB 操作）
const { singleMessageMapper, groupMessageMapper, friendsMapper } = useMappers();

const userStore = useUserStore();
const chatStore = useChatMainStore();
const messageStore = useMessageStore();

interface Friend {
  userId: string;
  friendId: string;
  name: string;
  alias?: string;
  avatar?: string;
  location?: string;
  flag?: number;
  selfSignature?: string;
}

interface State {
  contacts: any[];
  groups: any[];
  shipInfo: any;
  newFriends: any[];
  type: "contacts" | "groups" | "newFriends" | "";
  ignore: boolean;
}

export const useFriendsStore = defineStore(StoresEnum.FRIENDS, {
  state: (): State => {
    return {
      contacts: [],
      groups: [],
      newFriends: [],
      shipInfo: {},
      type: "contacts",
      ignore: false
    };
  },
  getters: {
    /**
     * 获取总未读消息数
     * @returns 所有会话未读消息的总和
     */
    getTotalNewFriends: state => (state.ignore ? state.newFriends.filter(c => c.approveStatus == 0).length ?? 0 : 0),
    // 当前用户id
    getOwnerId: () => userStore.userId || storage.get("userId")
  },
  // 同步和异步皆可
  actions: {
    /**
     * 添加联系人
     * @param friend
     * @returns
     */
    async handleAddContact(friend: Friend, message: string, remark: string = "") {
      return (
        (await api.RequestContact({
          fromId: storage.get("userId"),
          toId: friend.friendId,
          message,
          remark
        })) || []
      );
    },

    /**
     * 审批联系人
     * @param requstInfo 联系人
     * @param approveStatus 状态  1:同意  2:拒绝
     * @returns
     */
    async handleApproveContact(requstInfo: any, approveStatus: number) {
      return (
        (await api.ApproveContact({
          id: requstInfo.id,
          approveStatus
        })) || []
      );
    },

    /**
     * 删除联系人
     * @param chat 会话
     */
    async handleDeleteContact(chat: Chats) {

      console.log('okok delete')
      // 当前会话为单聊
      if (chat.chatType == IMessageType.SINGLE_MESSAGE.code) {
        api.DeleteContact({ fromId: this.getOwnerId, toId: chat.id }).then(async () => {
          // 删除聊天记录
          await messageStore.handleClearMessage(chat);
          // 删除会话
          await chatStore.handleDeleteChat(chat);
          // 删除联系人
          await friendsMapper.deleteById(chat.id, "friendId");
          // 重载联系人
          await this.loadContacts();
        });
      }

      // if (chat.chatType == IMessageType.SINGLE_MESSAGE.code)
      else {zAAAAAAAAAAAAAAZAZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ
        api.QuitGroups({ fromId: this.getOwnerId, groupId: chat.id }).then(async () => {
          // 删除聊天记录
          await messageStore.handleClearMessage(chat);
          // 删除会话
          await chatStore.handleDeleteChat(chat);
          // 删除联系人
          await friendsMapper.deleteById(chat.id, "friendId");
          // 重载联系人
          await this.loadContacts();
        });
      }
    },

    /**
     * 查询好友申请
     * @returns
     */
    async loadNewFriends() {
      const newList =
        (await api.GetNewFriends({
          userId: storage.get("userId")
        })) || [];

      if (!Array.isArray(newList) || newList.length === 0) {
        console.info("群列表无更新");
        return;
      }
      if (this.ignore) {
        this.ignore = false;
      }
      this.newFriends = [...newList].sort((a, b) => {
        return (b.createTime || 0) - (a.createTime || 0);
      });
    },

    /**
     * 查询群聊
     * @returns
     */
    async loadGroups() {
      const newList =
        (await api.GetGroups({
          userId: storage.get("userId")
        })) || [];

      if (!Array.isArray(newList) || newList.length === 0) {
        console.info("群列表无更新");
        return;
      }
      // const groups = genGroups(20);
      this.groups = [...newList];
    },

    /**
     * 查询联系人
     * @returns
     */
    async loadContacts() {
      const newList =
        (await api.GetContacts({
          userId: storage.get("userId"),
          sequence: 0
        })) || [];

      if (!Array.isArray(newList) || newList.length === 0) {
        console.info("好友列表无更新");
        return;
      }

      //const friends = genFriends(5000);
      this.contacts = [...newList];

      // try {
      //   // 1. 先从本地取出所有好友
      //   const localList = (await friendsMapper.selectList()) || [];
      //   if (!Array.isArray(localList)) {
      //     this.contacts = [];
      //   } else {
      //     this.contacts = localList;
      //   }

      //   // 2. 计算本地的最大 sequence，用于增量拉取
      //   const maxSeq = this.contacts.length > 0 ? Math.max(...this.contacts.map(f => f.sequence || 0)) : 0;

      //   // 3. 调用后端增量接口：只拉 sequence > maxSeq 的数据
      //   const userId = storage.get("userId");
      //   const newList =
      //     (await api.GetFriendList({
      //       userId,
      //       sequence: maxSeq
      //     })) || [];

      //   // 4. 如果没有新数据，就无需更新
      //   if (!Array.isArray(newList) || newList.length === 0) {
      //     console.info("好友列表无更新，sequence:", maxSeq);
      //     return;
      //   }

      //   // 5. 合并新数据
      //   //    假设后端只返回 sequence > maxSeq 的记录，直接 append 即可
      //   const merged = [...this.contacts, ...newList];

      //   // 6. 更新本地缓存
      //   //await friendsMapper.replaceAll(merged);
      //   friendsMapper.deleteById(storage.get("userId"));
      //   friendsMapper.batchInsert(merged); // 插入或更新好友数据
      //   this.contacts = merged;
      //   console.info(
      //     `新增 ${newList.length} 条好友关系，新的 maxSeq: ${Math.max(...merged.map(f => f.sequence || 0))}`
      //   );
      // } catch (error) {
      //   console.error("获取/更新好友列表失败：", error);
      //   // 出错时保持现有列表不变或清空
      //   this.contacts = this.contacts || [];
      // }
    },
    async handleSearchFriendInfo(keyword: string) {
      return (
        (await api.SearchContactInfoList({
          fromId: storage.get("userId"),
          keyword
        })) || {}
      );
    },
    async handleGetContactInfo(toId: string) {
      return (
        (await api.GetContactInfo({
          fromId: storage.get("userId"),
          toId
        })) || {}
      );
    }
  },
  persist: [
    {
      key: `${StoresEnum.FRIENDS}_local`,
      paths: ["ignore"],
      storage: localStorage
    },
    {
      key: `${StoresEnum.FRIENDS}_session`,
      paths: [],
      storage: sessionStorage
    }
  ]
});
