import { IMessageType, StoresEnum, MAX_REMARK_LEN } from "@/constants";
import api from "@/api/index";
import { useMappers } from "@/database";
import { storage } from "@/utils/Storage";
import Chats from "@/database/entity/Chats";
import { useUserStore } from "./user";
import { useChatStore } from "@/store/modules/chat";
import { ref, computed } from "vue";
import { globalEventBus } from "@/hooks/useEventBus";
import { CHAT_CHANGED, FRIEND_REMARK_UPDATED } from "@/constants/events";

// mappers（DB 操作）
const { friendsMapper, chatsMapper } = useMappers();

// 定义联系人接口
interface Friend {
  userId: string;
  friendId: string;
  name: string;
  remark?: string;
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
    // 当前会话为单聊
    if (chat.chatType == IMessageType.SINGLE_MESSAGE.code) {
      
      api.DeleteContact({ fromId: getOwnerId.value, toId: chat.toId }).then(async () => {
        // 删除聊天记录
        await chatMessageStore.handleClearMessage(chat);
        // 删除会话
        await chatMessageStore.handleDeleteChat(chat);
        // 删除联系人
        try {
          debugger
          await friendsMapper.deleteById(chat.toId, "friendId");
          await friendsMapper.deleteFTSById?.(chat.toId as any);
        } catch {
          console.error("删除联系人失败");
        }
        // 本地联系人列表即时更新
        try {
          const idx = contacts.value.findIndex((c: any) => String(c.friendId) === String(chat.toId));
          if (idx !== -1) contacts.value.splice(idx, 1);
          if (shipInfo.value && String(shipInfo.value.friendId) === String(chat.toId)) shipInfo.value = {};
        } catch {
          console.error("列表更新失败");
        }
        // 异步重载联系人以与服务端对齐（非阻塞）
        loadContacts();
        // 广播会话变更以便标题等订阅方清空展示
        try {
          globalEventBus.emit(CHAT_CHANGED as any, { chatId: null } as any);
        } catch {}
      });
    } else {
      debugger
      api.QuitGroups({ userId: getOwnerId.value, groupId: chat.toId }).then(async () => {
        // 删除聊天记录
        await chatMessageStore.handleClearMessage(chat);
        // 删除会话
        await chatMessageStore.handleDeleteChat(chat);
        // 本地群列表即时更新
        try {
          const gIdx = groups.value.findIndex((g: any) => String(g.groupId) === String(chat.toId));
          if (gIdx !== -1) groups.value.splice(gIdx, 1);
          if (shipInfo.value && String((shipInfo.value as any).groupId) === String(chat.toId)) shipInfo.value = {};
        } catch {}
        // 可选：异步刷新群列表
        loadGroups();
        // 广播会话变更以便标题等订阅方清空展示
        try {
          globalEventBus.emit(CHAT_CHANGED as any, { chatId: null } as any);
        } catch {}
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

  /**
   * 修改好友备注
   */
  const updateFriendRemark = async (friendId: string, remark: string) => {
    const next = String(remark ?? "").trim();
    if (!friendId || !next) return;
    if (next.length > MAX_REMARK_LEN) throw new Error('REMARK_TOO_LONG');

    const currentRemark = (shipInfo.value && shipInfo.value.friendId === friendId ? shipInfo.value.remark :
      (contacts.value?.find?.((c: any) => c?.friendId === friendId)?.remark)) || "";
    if (String(currentRemark || "").trim() === next) return;

    await api.updateFriendRemark({ fromId: getOwnerId.value, toId: friendId, remark: next });

    try {
      const idx = contacts.value.findIndex((c: any) => c?.friendId === friendId);
      if (idx !== -1) contacts.value[idx].remark = next;
      if (shipInfo.value && shipInfo.value.friendId === friendId) shipInfo.value.remark = next;
    } catch {}

    try {
      const idx = chatMessageStore.chatList.findIndex(
        (c: any) => c?.chatType === IMessageType.SINGLE_MESSAGE.code && String(c?.toId) === String(friendId)
      );
      if (idx !== -1) {
        const chat = chatMessageStore.chatList[idx];
        chat.name = next;
        await chatsMapper.updateById(chat.chatId, { name: next } as Chats);
        await chatsMapper.insertOrUpdateFTS({ chatId: chat.chatId, name: next } as any);
      }
      if (
        chatMessageStore.currentChat &&
        chatMessageStore.currentChat.chatType === IMessageType.SINGLE_MESSAGE.code &&
        String(chatMessageStore.currentChat.toId) === String(friendId)
      ) {
        (chatMessageStore.currentChat as any).name = next;
        try {
          globalEventBus.emit(CHAT_CHANGED as any, {
            chatId: chatMessageStore.currentChat.chatId,
            name: next,
            notification: (chatMessageStore.currentChat as any)?.notification
          });
        } catch {}
      }
    } catch {}

    try {
      globalEventBus.emit(FRIEND_REMARK_UPDATED as any, { friendId, remark: next } as any);
    } catch {}

    try {
      await friendsMapper.updateById(friendId, { remark: next } as any);
    } catch {}
  };

  /**
   * 更新群组信息（群名称/公告）
   */

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
    handleGetContactInfo,
    updateFriendRemark
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
