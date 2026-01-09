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
  const logger = useLogger();

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
   * @throws 删除失败时抛出错误
   */
  const handleDeleteContact = async (chat: Chats): Promise<void> => {
    try {
      if (!chat) {
        throw new Error("会话信息不能为空");
      }

      logger.info("开始删除联系人", { chatId: chat.chatId, chatType: chat.chatType });

      // 当前会话为单聊
      if (chat.chatType === IMessageType.SINGLE_MESSAGE.code) {
        await api.DeleteContact({ fromId: getOwnerId.value, toId: chat.toId });
        
        // 删除聊天记录
        await chatMessageStore.handleClearMessage(chat);
        
        // 删除会话
        await chatMessageStore.handleDeleteChat(chat);
        
        // 删除联系人数据
        try {
          await friendsMapper.deleteById(chat.toId, "friendId");
          await friendsMapper.deleteFTSById?.(chat.toId as any);
        } catch (error) {
          logger.error("删除联系人数据失败", error);
        }
        
        // 本地联系人列表即时更新
        try {
          const idx = contacts.value.findIndex((c: any) => String(c.friendId) === String(chat.toId));
          if (idx !== -1) {
            contacts.value.splice(idx, 1);
          }
          if (shipInfo.value && String(shipInfo.value.friendId) === String(chat.toId)) {
            shipInfo.value = {};
          }
        } catch (error) {
          logger.warn("更新本地联系人列表失败", error);
        }
        
        // 异步重载联系人以与服务端对齐（非阻塞）
        loadContacts().catch(err => logger.warn("重载联系人列表失败", err));
        
        logger.info("删除单聊联系人成功", { toId: chat.toId });
      } else {
        // 退出群聊
        await api.QuitGroups({ userId: getOwnerId.value, groupId: chat.toId });
        
        // 删除聊天记录
        await chatMessageStore.handleClearMessage(chat);
        
        // 删除会话
        await chatMessageStore.handleDeleteChat(chat);
        
        // 本地群列表即时更新
        try {
          const gIdx = groups.value.findIndex((g: any) => String(g.groupId) === String(chat.toId));
          if (gIdx !== -1) {
            groups.value.splice(gIdx, 1);
          }
          if (shipInfo.value && String((shipInfo.value as any).groupId) === String(chat.toId)) {
            shipInfo.value = {};
          }
        } catch (error) {
          logger.warn("更新本地群列表失败", error);
        }
        
        // 异步刷新群列表
        loadGroups().catch(err => logger.warn("重载群列表失败", err));
        
        logger.info("退出群聊成功", { groupId: chat.toId });
      }

      // 广播会话变更以便标题等订阅方清空展示
      try {
        globalEventBus.emit(CHAT_CHANGED as any, { chatId: null } as any);
      } catch (error) {
        logger.warn("广播会话变更事件失败", error);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "删除联系人失败";
      logger.error("删除联系人失败", error);
      throw new Error(errorMsg);
    }
  };

  /**
   * 查询好友申请列表
   * @throws 查询失败时抛出错误
   */
  const loadNewFriends = async (): Promise<void> => {
    try {
      const newList = (await api.GetNewFriends({
        userId: storage.get("userId")
      })) || [];

      if (!Array.isArray(newList) || newList.length === 0) {
        logger.debug("好友申请列表无更新");
        return;
      }

      if (ignore.value) {
        ignore.value = false;
      }

      newFriends.value = [...newList].sort((a, b) => {
        return (b.createTime || 0) - (a.createTime || 0);
      });

      logger.info("好友申请列表加载成功", { count: newList.length });
    } catch (error) {
      logger.error("加载好友申请列表失败", error);
      throw error;
    }
  };

  /**
   * 查询群聊列表
   * @throws 查询失败时抛出错误
   */
  const loadGroups = async (): Promise<void> => {
    try {
      const newList = (await api.GetGroups({
        userId: storage.get("userId")
      })) || [];

      if (!Array.isArray(newList) || newList.length === 0) {
        logger.debug("群列表无更新");
        return;
      }

      groups.value = [...newList];
      logger.info("群列表加载成功", { count: newList.length });
    } catch (error) {
      logger.error("加载群列表失败", error);
      throw error;
    }
  };

  /**
   * 查询联系人列表
   * @throws 查询失败时抛出错误
   */
  const loadContacts = async (): Promise<void> => {
    try {
      const newList = (await api.GetContacts({
        userId: storage.get("userId"),
        sequence: 0
      })) || [];

      if (!Array.isArray(newList) || newList.length === 0) {
        logger.debug("好友列表无更新");
        return;
      }

      contacts.value = [...newList];
      logger.info("好友列表加载成功", { count: newList.length });
    } catch (error) {
      logger.error("加载好友列表失败", error);
      throw error;
    }
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
