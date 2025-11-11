import { IMessageType, StoresEnum } from "@/constants";
import api from "@/api/index";
import { useMappers } from "@/database";
import { storage } from "@/utils/Storage";
import Chats from "@/database/entity/Chats";
import { useUserStore } from "./user";
import { useChatStore } from "@/store/modules/chat";
import { ref, computed } from "vue";

// mappers（DB 操作）
const { friendsMapper } = useMappers();

// 定义联系人接口
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

// 定义状态接口
interface State {
  contacts: any[];
  groups: any[];
  shipInfo: any;
  newFriends: any[];
  type: "contacts" | "groups" | "newFriends" | "";
  ignore: boolean;
}

// 使用 setup 语法重构 Pinia store
export const useFriendsStore = defineStore(StoresEnum.FRIENDS, () => {
  // 初始化其他 stores
  const userStore = useUserStore();
  const chatMessageStore = useChatStore();

  // 定义响应式状态
  const contacts = ref<any[]>([]);
  const groups = ref<any[]>([]);
  const newFriends = ref<any[]>([]);
  const shipInfo = ref<any>({});
  const type = ref<"contacts" | "groups" | "newFriends" | "">("contacts");
  const ignore = ref<boolean>(false);

  // Getters
  /**
   * 获取总未读消息数
   * @returns 所有会话未读消息的总和
   */
  const getTotalNewFriends = computed(() => 
    ignore.value ? newFriends.value.filter(c => c.approveStatus == 0).length ?? 0 : 0
  );

  // 当前用户id
  const getOwnerId = computed(() => userStore.userId || storage.get("userId"));

  // Actions
  /**
   * 添加联系人
   * @param friend 联系人信息
   * @param message 附加消息
   * @param remark 备注
   * @returns 请求结果
   */
  const handleAddContact = async (friend: Friend, message: string, remark: string = "") => {
    return (
      (await api.RequestContact({
        fromId: storage.get("userId"),
        toId: friend.friendId,
        message,
        remark
      })) || []
    );
  };

  /**
   * 审批联系人
   * @param requstInfo 联系人申请信息
   * @param approveStatus 状态  1:同意  2:拒绝
   * @returns 请求结果
   */
  const handleApproveContact = async (requstInfo: any, approveStatus: number) => {
    return (
      (await api.ApproveContact({
        id: requstInfo.id,
        approveStatus
      })) || []
    );
  };

  /**
   * 删除联系人
   * @param chat 会话
   */
  const handleDeleteContact = async (chat: Chats) => {
    console.log("okok delete");
    // 当前会话为单聊
    if (chat.chatType == IMessageType.SINGLE_MESSAGE.code) {
      api.DeleteContact({ fromId: getOwnerId.value, toId: chat.id }).then(async () => {
        // 删除聊天记录
        await chatMessageStore.handleClearMessage(chat);
        // 删除会话
        await chatMessageStore.handleDeleteChat(chat);
        // 删除联系人
        await friendsMapper.deleteById(chat.id, "friendId");
        // 重载联系人
        await loadContacts();
      });
    } else {
      api.QuitGroups({ userId: getOwnerId.value, groupId: chat.id }).then(async () => {
        // 删除聊天记录
        await chatMessageStore.handleClearMessage(chat);
        // 删除会话
        await chatMessageStore.handleDeleteChat(chat);
        // 删除群聊
      });
    }
  };

  /**
   * 查询好友申请
   * @returns 
   */
  const loadNewFriends = async () => {
    const newList =
      (await api.GetNewFriends({
        userId: storage.get("userId")
      })) || [];

    if (!Array.isArray(newList) || newList.length === 0) {
      console.info("群列表无更新");
      return;
    }
    if (ignore.value) {
      ignore.value = false;
    }
    newFriends.value = [...newList].sort((a, b) => {
      return (b.createTime || 0) - (a.createTime || 0);
    });
  };

  /**
   * 查询群聊
   * @returns 
   */
  const loadGroups = async () => {
    const newList =
      (await api.GetGroups({
        userId: storage.get("userId")
      })) || [];

    if (!Array.isArray(newList) || newList.length === 0) {
      console.info("群列表无更新");
      return;
    }
    groups.value = [...newList];
  };

  /**
   * 查询联系人
   * @returns 
   */
  const loadContacts = async () => {
    const newList =
      (await api.GetContacts({
        userId: storage.get("userId"),
        sequence: 0
      })) || [];

    if (!Array.isArray(newList) || newList.length === 0) {
      console.info("好友列表无更新");
      return;
    }

    contacts.value = [...newList];
  };

  /**
   * 搜索联系人信息
   * @param keyword 关键词
   * @returns 搜索结果
   */
  const handleSearchFriendInfo = async (keyword: string) => {
    return (
      (await api.SearchContactInfoList({
        fromId: storage.get("userId"),
        keyword
      })) || {}
    );
  };

  /**
   * 获取联系人详细信息
   * @param toId 对方ID
   * @returns 联系人信息
   */
  const handleGetContactInfo = async (toId: string) => {
    return (
      (await api.GetContactInfo({
        fromId: storage.get("userId"),
        toId
      })) || {}
    );
  };

  // 返回 store 实例的所有属性和方法
  return {
    // 状态
    contacts,
    groups,
    shipInfo,
    newFriends,
    type,
    ignore,

    // Getters
    getTotalNewFriends,
    getOwnerId,

    // Actions
    handleAddContact,
    handleApproveContact,
    handleDeleteContact,
    loadNewFriends,
    loadGroups,
    loadContacts,
    handleSearchFriendInfo,
    handleGetContactInfo
  };
}, {
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