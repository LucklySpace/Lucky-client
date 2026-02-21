import api from "@/api/index";
import { Events, MessageContentType, MessageType, StoresEnum } from "@/constants";
import { useMappers } from "@/database";
import Chats from "@/database/entity/Chats";
import { AudioEnum, useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useChatInput } from "@/hooks/useChatInput";
import { globalEventBus } from "@/hooks/useEventBus";
import { useIdleTaskExecutor } from "@/hooks/useIdleTaskExecutor";
import { draftManager } from "@/hooks/useInputEditor";
import { IMessage, IMGroupMessage, IMSingleMessage } from "@/models";
import { safeExecute } from "@/utils/ExceptionHandler";
import { storage } from "@/utils/Storage";
import { textReplaceMention } from "@/utils/Strings";
import { ShowMainWindow } from "@/windows/main";
import { CreateRecordWindow } from "@/windows/record";
import { CreateScreenWindow } from "@/windows/screen";
import { defineStore } from "pinia";
import { computed, reactive } from "vue";
import { useGroupStore } from "./group";
import { useMessageStore } from "./message";
import { useSettingStore } from "./setting";
import { useUserStore } from "./user";

// ==================== 类型定义 ====================

interface ChatState {
  chatList: Chats[];
  currentChat: Chats | null;
  isShowDetail: boolean;
  ignoreList: string[];
  loading: boolean;
  error: string | null;
}

// ==================== Store 定义 ====================

export const useChatStore = defineStore(StoresEnum.CHAT, () => {
  // ==================== 依赖 ====================
  const { chatsMapper } = useMappers();
  const userStore = useUserStore();
  const settingStore = useSettingStore();
  const log = useLogger();
  const {
    buildMessagePreview,
    buildDraftMessagePreview,
    findChatIndex,
    removeMentionHighlightsFromHtml
  } = useChatInput();
  const { addTask } = useIdleTaskExecutor({ maxWorkTimePerIdle: 12 });
  const { play } = useAudioPlayer();

  // ==================== 状态 ====================
  const state = reactive<ChatState>({
    chatList: [],
    currentChat: null,
    isShowDetail: false,
    ignoreList: [],
    loading: false,
    error: null
  });

  // 群组 Store（延迟初始化避免循环依赖）
  let _groupStore: ReturnType<typeof useGroupStore> | null = null;
  const getGroupStore = () => {
    if (!_groupStore) _groupStore = useGroupStore();
    return _groupStore;
  };
  let _messageStore: ReturnType<typeof useMessageStore> | null = null;
  const getMessageStore = () => {
    if (!_messageStore) _messageStore = useMessageStore();
    return _messageStore;
  };

  // ==================== 核心工具 ====================
  const ownerId = computed(() => userStore.userId || storage.get("userId"));
  const isSingle = (chat: any) => chat?.chatType === MessageType.SINGLE_MESSAGE.code;
  const findChatByToId = (toId: any) => state.chatList.find(item => item.toId === toId);
  const findIdx = (id: any) => findChatIndex(state.chatList, id);

  // ==================== 计算属性 ====================
  const getters = {
    currentName: computed(() => state.currentChat?.name || ""),
    currentType: computed(() => state.currentChat?.chatType),
    totalUnread: computed(() => state.chatList.reduce((s, c) => c.isMute === 0 ? s + (c.unread || 0) : s, 0)),
    isGroup: computed(() => state.currentChat?.chatType === MessageType.GROUP_MESSAGE.code),
    unreadChats: computed(() => state.chatList.filter(c => c.unread > 0)),
    /** 群成员（排除自己），委托给 groupStore */
    membersExcludeSelf: computed(() => getGroupStore().getMembersExcludeSelf),
    /** 群成员 Map，委托给 groupStore */
    groupMembers: computed(() => getGroupStore().members)
  };

  // ==================== 内部工具 ====================
  const exec = <T>(fn: () => Promise<T>, opts?: { op?: string; fallback?: T }) =>
    safeExecute(fn, { operation: opts?.op, fallback: opts?.fallback, silent: !opts?.op });

  const sortList = () => {
    state.chatList.sort((a, b) => (b.isTop || 0) - (a.isTop || 0) || (b.messageTime || 0) - (a.messageTime || 0));
  };

  const upsert = (chat: Partial<Chats> & { chatId?: any }): number => {
    if (!chat?.chatId) return -1;
    const idx = findIdx(chat.chatId);
    if (idx !== -1) {
      Object.assign(state.chatList[idx], chat);
      return idx;
    }
    state.chatList.push(chat as Chats);
    return state.chatList.length - 1;
  };

  const persist = (chat: Partial<Chats>) => {
    if (!chat?.chatId) return;
    addTask(() => {
      chatsMapper.insertOrUpdate(chat);
      chatsMapper.insertOrUpdateFTS(chat);
    });
  };

  const emitChange = () => {
    if (state.currentChat) {
      globalEventBus.emit(Events.CHAT_CHANGED, {
        chatId: state.currentChat.chatId,
        name: state.currentChat.name,
        notification: (state.currentChat as any)?.notification
      });
    }
  };


  /**
   * 构建消息预览（实时计算）
   */
  const buildPreview = (msg?: IMessage) => {
    if (!msg) return null;
    try {
      const prev = buildMessagePreview(msg, { currentUserId: ownerId.value, highlightClass: "mention-highlight", asHtml: true });
      if (prev && Number((msg as any)?.messageContentType) === MessageContentType.TEXT.code) {
        prev.html = textReplaceMention(prev.html || "", "#ee4628");
      }
      return prev;
    } catch { return null; }
  };


  // ==================== 会话操作 ====================
  const initChat = async () => {
    if (state.chatList.length) return;
    state.loading = true;
    const data = await exec(() => chatsMapper.selectList(), { op: "initChat" });
    if (Array.isArray(data) && data.length) state.chatList = data;
    state.loading = false;
  };

  const changeChat = async (chatOrId: Chats | string | number | null) => {
    saveDraft();
    if (!chatOrId) { state.currentChat = null; return; }

    const id = typeof chatOrId === "object" ? chatOrId.chatId : chatOrId;
    let idx = findIdx(id);
    let chat: Chats | null = null;

    if (idx === -1) {
      if (typeof chatOrId === "object") {
        idx = upsert(chatOrId);
        chat = state.chatList[idx];
      } else {
        state.currentChat = null;
        state.error = "会话不存在";
        return;
      }
    } else {
      chat = state.chatList[idx];
      const dbChat = await exec(() => chatsMapper.selectById(chat!.chatId));
      if (dbChat) chat.message = removeMentionHighlightsFromHtml(dbChat.message, { returnPlainText: true });
      sortList();
    }

    getMessageStore().handleResetMessage();
    state.currentChat = chat;

    // 群聊：加载群成员
    if (getters.isGroup.value && chat) {
      const groupStore = getGroupStore();
      await groupStore.loadMembers(String(chat.toId));
    }
    emitChange();
    await getMessageStore().handleGetMessageList(chat);
  };

  const changeChatByTarget = async (target: Record<string, any>, chatType: number) => {
    const targetId = target.friendId ?? target.groupId;
    const existIdx = state.chatList.findIndex(c => c.toId === targetId && c.chatType === chatType);

    if (existIdx !== -1) {
      await updateRead(state.chatList[existIdx], 0);
      state.currentChat = state.chatList[existIdx];
    } else {
      state.loading = true;
      const res = await exec(() => api.CreateChat({ fromId: ownerId.value, toId: targetId, chatType }), { op: "createChat" }) as Chats;
      if (res) {
        updateWithMsg(res);
        upsert(res);
        sortList();
        state.currentChat = res;
      }
      state.loading = false;
    }
    emitChange();
  };

  const updateRead = async (chat: Chats, unread = 0) => {
    const idx = findIdx(chat?.chatId);
    if (idx === -1) return;
    state.chatList[idx].unread = unread;
    addTask(() => {
      chatsMapper.updateById(chat.chatId, { unread } as Chats);
      api.ReadChat({
        fromId: chat.toId,
        toId: chat.ownerId,
        chatType: chat.chatType,
      });
    });
  };

  /** 从消息中解析会话 toId（私聊取对方 ID，群聊取群 ID） */
  const getToIdFromMessage = (msg: IMessage): string | number | null => {
    if (!msg) return null;
    const myId = String(ownerId.value);
    const single = msg as IMSingleMessage;
    const group = msg as IMGroupMessage;
    if (group.groupId != null) return group.groupId;
    return String(single.fromId) === myId ? single.toId : single.fromId;
  };

  const createOrUpdate = async (message: IMessage | undefined, existingChat: Chats | null) => {
    let chat = existingChat;
    if (chat) {
      if (message?.fromId !== ownerId.value) triggerNotify(chat, message);
      const idx = findIdx(chat.chatId);
      updateWithMsg(idx !== -1 ? state.chatList[idx] : chat, message, idx === -1);
      if (idx === -1) upsert(chat);
    } else if (message) {
      const toId = getToIdFromMessage(message);
      if (toId != null) {
        chat = await exec(() => api.GetChat({ ownerId: ownerId.value, toId }), { op: "fetchChat" }) as Chats;
        if (chat) {
          if (message.fromId !== ownerId.value) triggerNotify(chat, message);
          updateWithMsg(chat, message, true);
          upsert(chat);
        }
      }
    }
    if (chat) sortList();
    state.loading = false;
  };

  const updateWithMsg = (chat: Chats, message?: IMessage, isNew = false) => {
    if (!chat) return;
    const now = Date.now();

    if (!message) {
      Object.assign(chat, { message: "", messageTime: now, sequence: now, unread: 0 });
      persist({ ...chat, message: "" });
      return;
    }

    // 构建预览
    const preview = buildPreview(message);
    const isCurrent = String(chat.toId) === String(state.currentChat?.toId);

    if (!isCurrent && !isNew) {
      chat.unread = (chat.unread || 0) + 1;
      chat.message = preview?.html || "";
    } else {
      chat.message = preview?.plainText || "";
    }

    chat.messageTime = message.messageTime || now;
    chat.sequence = message.sequence || now;
    persist({ ...chat, message: preview?.originalText || preview?.plainText || "" });
  };

  const deleteChat = async (chat: Chats) => {
    const idx = findIdx(chat?.chatId);
    if (idx !== -1) {
      addTask(async () => {
        await chatsMapper.deleteById(chat.chatId);
        await chatsMapper.deleteFTSById(chat.chatId);
      });
      state.chatList.splice(idx, 1);
    }

    if (state.currentChat?.chatId === chat?.chatId) {
      state.currentChat = null;
      getMessageStore().handleResetMessage();
      getGroupStore().reset();
    }
    draftManager.clear(chat?.chatId);
  };

  const togglePin = async (chat: Chats) => {
    const idx = findIdx(chat?.chatId);
    if (idx === -1) return;
    const isTop = state.chatList[idx].isTop === 1 ? 0 : 1;
    state.chatList[idx].isTop = isTop;
    await chatsMapper.updateById(chat.chatId, { isTop } as Chats);
    sortList();
  };

  const toggleMute = async (chat: Chats) => {
    const idx = findIdx(chat?.chatId);
    if (idx === -1) return;
    const isMute = state.chatList[idx].isMute === 1 ? 0 : 1;
    state.chatList[idx].isMute = isMute;
    await chatsMapper.updateById(chat.chatId, { isMute } as Chats);
    sortList();
  };

  const ignoreAll = () => {
    getters.unreadChats.value.forEach(c => {
      const id = String(c.chatId);
      if (!state.ignoreList.includes(id)) state.ignoreList.push(id);
    });
  };

  const jumpToChat = () => state.currentChat && exec(ShowMainWindow);
  const getChat = (id: any) => state.chatList.find(c => c.chatId === id);
  const toggleDetail = () => { state.isShowDetail = !state.isShowDetail; };

  // ==================== 草稿 ====================
  const setDraft = (chatId: string | number, html: string) => draftManager.set(chatId, html);
  const getDraft = (chatId: string | number) => draftManager.get(chatId);
  const clearDraft = (chatId: string | number) => draftManager.clear(chatId);
  const hasDraft = (chatId: string | number) => draftManager.has(chatId);

  const saveDraft = () => {
    const chatId = state.currentChat?.chatId;
    if (!chatId) return;
    const html = getDraft(chatId);
    if (!html) return;
    const preview = buildDraftMessagePreview(String(chatId), html);
    if (preview) upsert({ chatId, message: preview, messageTime: Date.now() } as any);
  };

  // ==================== 工具 ====================
  const showScreenshot = () => CreateScreenWindow(screen.availWidth, screen.availHeight);
  const showRecord = () => CreateRecordWindow(screen.availWidth, screen.availHeight);
  const triggerNotify = (chat: Chats, message?: IMessage) => {
    if (settingStore.notification.message && chat.isMute === 0 && message) play(AudioEnum.MESSAGE_ALERT);
  };

  // ==================== 导出 ====================
  return {
    // 状态
    state,
    chatList: computed({ get: () => state.chatList, set: v => { state.chatList = v; } }),
    currentChat: computed({ get: () => state.currentChat, set: v => { state.currentChat = v; } }),
    currentChatGroupMemberMap: computed({ get: () => getGroupStore().members, set: v => { getGroupStore().members = v; } }),
    isShowDetail: computed({ get: () => state.isShowDetail, set: v => { state.isShowDetail = v; } }),
    ignoreAllList: computed({ get: () => state.ignoreList, set: v => { state.ignoreList = v; } }),
    groupInfo: computed({ get: () => getGroupStore().info, set: v => { getGroupStore().info = v; } }),
    loading: computed({ get: () => state.loading, set: v => { state.loading = v; } }),
    error: computed({ get: () => state.error, set: v => { state.error = v; } }),
    chatDraftMap: computed(() => draftManager.getAll()),

    // 计算属性
    getCurrentName: getters.currentName,
    getCurrentType: getters.currentType,
    getTotalUnread: getters.totalUnread,
    getChatIsGroup: getters.isGroup,
    getHaveMessageChat: getters.unreadChats,
    getCurrentGroupMembersExcludeSelf: getters.membersExcludeSelf,
    getOwnerId: ownerId,
    getChatById: computed(() => (id: string | number) => state.chatList.find(c => c.chatId === id) ?? null),
    getChatByToId: findChatByToId,
    getShowDetailBtn: computed(() => !!state.currentChat),
    getShowDetail: computed(() => state.isShowDetail),

    // 状态管理
    setLoading: (v: boolean) => { state.loading = v; },
    setError: (e: string | null) => { state.error = e; if (e) log.error?.("[ChatStore]", e); },

    // 会话操作
    handleInitChat: initChat,
    handleChangeCurrentChat: changeChat,
    handleChangeCurrentChatByTarget: changeChatByTarget,
    handleUpdateReadStatus: updateRead,
    handleCreateOrUpdateChat: createOrUpdate,
    handleUpdateChatWithMessage: updateWithMsg,
    handleDeleteChat: deleteChat,
    handlePinChat: togglePin,
    handleMuteChat: toggleMute,
    handleSortChatList: sortList,
    handleIgnoreAll: ignoreAll,
    handleJumpToChat: jumpToChat,
    handleGetChat: getChat,
    handleChatDetail: toggleDetail,
    upsertChat: upsert,
    persistPreviewToDb: persist,
    buildPreviewFromMessage: buildPreview,
    fetchChatFromServer: (oId: string | number, toId: string | number) => exec(() => api.GetChat({ ownerId: oId, toId }), { op: "fetchChat" }) as Promise<Chats | null>,
    triggerNotification: triggerNotify,

    // 草稿
    setDraft, getDraft, clearDraft, hasDraft, saveDraftAsPreview: saveDraft,

    getGroupStore,

    // 工具
    handleShowScreenshot: showScreenshot,
    handleShowRecord: showRecord,
    isSingleChat: isSingle
  };
}, {
  persist: [
    { key: `${StoresEnum.CHAT}_local`, paths: ["state.ignoreList"], storage: localStorage },
    { key: `${StoresEnum.CHAT}_session_chat`, paths: ["state.chatList", "state.currentChat"], storage: sessionStorage }
  ],
  sync: { paths: ["state.chatList"], targetWindows: [StoresEnum.NOTIFY], sourceWindow: StoresEnum.MAIN }
});
