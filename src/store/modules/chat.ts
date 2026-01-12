import { defineStore } from "pinia";
import { reactive } from "vue";
import { IMActionType, IMessageType, MessageContentType, StoresEnum, Events } from "@/constants";
import api from "@/api/index";
import Chats from "@/database/entity/Chats";
import { QueryBuilder, FTSQueryBuilder, useMappers, PageResult, Segmenter } from "@/database";
import { useUserStore } from "./user";
import { useFriendsStore } from "./friends";
import { ShowMainWindow } from "@/windows/main";
import { storage } from "@/utils/Storage";
import { useChatInput } from "@/hooks/useChatInput";
import { useIdleTaskExecutor } from "@/hooks/useIdleTaskExecutor";
import { IMessage, IMessagePart } from "@/models";
import { useSettingStore } from "./setting";
import { AudioEnum, useAudioPlayer } from "@/hooks/useAudioPlayer";
import { CreateScreenWindow } from "@/windows/screen";
import { CreateRecordWindow } from "@/windows/record";
import { highlightTextByTokens } from "@/utils/Strings";
import { globalEventBus } from "@/hooks/useEventBus";
import useCrypo from "@/hooks/useCrypo";
import { ExceptionHandler, safeExecute } from "@/utils/ExceptionHandler";
import { draftManager } from "@/hooks/useInputEditor";

// ==================== 类型定义 ====================

type Member = { userId: string; name: string; avatar: string | null };
type ChatOrId = Chats | string | number;

// ==================== Store 定义 ====================

export const useChatStore = defineStore(StoresEnum.CHAT, () => {
  // ==================== 依赖初始化 ====================

  const { chatsMapper, singleMessageMapper, groupMessageMapper } = useMappers();
  const userStore = useUserStore();
  const settingStore = useSettingStore();
  const log = useLogger();
  const { buildMessagePreview, buildDraftMessagePreview, findChatIndex, removeMentionHighlightsFromHtml } = useChatInput();
  const { addTask } = useIdleTaskExecutor({ maxWorkTimePerIdle: 12 });
  const { play } = useAudioPlayer();
  const { md5 } = useCrypo();

  // 配置异常处理器
  ExceptionHandler.setLogger(log);

  // ==================== 响应式状态 ====================

  const state = reactive({
    chatList: [] as Chats[],
    messageList: [] as IMessage[],
    currentChat: null as Chats | null,
    groupMembers: {} as Record<string, Member>,
    isShowDetail: false,
    ignoreList: [] as string[],
    historyList: [] as IMessage[],
    groupInfo: {} as Record<string, any>,
    currentUrls: [] as string[],
    loading: false,
    error: null as string | null,
  });

  const page = reactive({ num: 1, size: 20, total: 0 });

  // ==================== 计算属性 ====================

  /** 获取当前用户ID */
  const getOwnerId = computed(() => userStore.userId || storage.get("userId"));
  /** 获取当前会话名称 */
  const getCurrentName = computed(() => state.currentChat?.name || "");
  /** 获取当前会话类型 */
  const getCurrentType = computed(() => state.currentChat?.chatType);
  /** 获取当前会话ID */
  const getChatById = computed(() => (id: string | number) => state.chatList.find(c => c.chatId === id) ?? null);
  /** 获取总未读消息数 */
  const getTotalUnread = computed(() => state.chatList.reduce((sum, c) => c.isMute === 0 ? sum + (c.unread || 0) : sum, 0));
  /** 获取是否显示详情按钮 */
  const getShowDetailBtn = computed(() => !!state.currentChat);
  /** 获取是否显示详情 */
  const getShowDetail = computed(() => state.isShowDetail);
  /** 获取是否有消息的会话 */
  const getHaveMessageChat = computed(() => state.chatList.filter(c => c.unread > 0));
  /** 获取当前会话是否为群聊 */
  const getChatIsGroup = computed(() => state.currentChat?.chatType === IMessageType.GROUP_MESSAGE.code);
  /** 获取剩余消息数量 */
  const remainingQuantity = computed(() => Math.max(0, page.total - page.num * page.size));
  /** 获取当前会话成员列表（排除自己） */
  const getCurrentGroupMembersExcludeSelf = computed((): Member[] => {
    const members = Array.isArray(state.groupMembers) ? state.groupMembers : Object.values(state.groupMembers || {});
    const me = getOwnerId.value;

    const result: Member[] = [];
    for (const m of members) {
      if (!m) continue;
      let user: Member;
      if (typeof m === "string" || typeof m === "number") {
        user = { userId: String(m), name: String(m), avatar: null };
      } else {
        const id = m.userId ?? m.id ?? m.uid ?? m.user_id;
        if (!id) continue;
        user = {
          userId: String(id),
          name: m.name ?? m.nick ?? m.nickname ?? m.displayName ?? m.username ?? String(id),
          avatar: m.avatar ?? m.avatarUrl ?? m.img ?? m.head ?? null
        };
      }
      if (user.userId !== me) result.push(user);
    }
    return result;
  });

  // ==================== Ref 兼容层（保持 API 兼容） ====================

  const chatList = computed({
    get: () => state.chatList,
    set: (v) => { state.chatList = v; }
  });
  const messageList = computed({
    get: () => state.messageList,
    set: (v) => { state.messageList = v; }
  });
  const currentChat = computed({
    get: () => state.currentChat,
    set: (v) => { state.currentChat = v; }
  });
  const currentChatGroupMemberMap = computed({
    get: () => state.groupMembers,
    set: (v) => { state.groupMembers = v; }
  });
  const isShowDetail = computed({
    get: () => state.isShowDetail,
    set: (v) => { state.isShowDetail = v; }
  });
  const ignoreAllList = computed({
    get: () => state.ignoreList,
    set: (v) => { state.ignoreList = v; }
  });
  const chatDraftMap = computed(() => draftManager.getAll());
  const historyMessageList = computed({
    get: () => state.historyList,
    set: (v) => { state.historyList = v; }
  });
  const groupInfo = computed({
    get: () => state.groupInfo,
    set: (v) => { state.groupInfo = v; }
  });
  const currentUrls = computed({
    get: () => state.currentUrls,
    set: (v) => { state.currentUrls = v; }
  });
  const loading = computed({
    get: () => state.loading,
    set: (v) => { state.loading = v; }
  });
  const error = computed({
    get: () => state.error,
    set: (v) => { state.error = v; }
  });


  // ==================== 会话操作 ====================

  /** 初始化会话列表 */
  const handleInitChat = async () => {
    if (state.chatList.length > 0) return;

    setLoading(true);
    const data = await safeExecute(() => chatsMapper.selectList(), { operation: "initChat" });
    if (Array.isArray(data) && data.length) state.chatList = data;
    setLoading(false);
  };

  /** 切换当前会话 */
  const handleChangeCurrentChat = async (chatOrId: ChatOrId): Promise<void> => {
    // 保存草稿
    saveDraftAsPreview();

    if (!chatOrId) {
      state.currentChat = null;
      return;
    }

    const id = typeof chatOrId === "object" ? chatOrId.chatId : chatOrId;
    let idx = findChat(id);
    let chat: Chats | null = null;

    if (idx === -1) {
      if (typeof chatOrId === "object") {
        idx = upsertChat(chatOrId);
        chat = state.chatList[idx];
      } else {
        state.currentChat = null;
        setError("会话不存在");
        return;
      }
    } else {
      chat = state.chatList[idx];
      const dbChat = await safeExecute(() => chatsMapper.selectById(chat!.chatId), { silent: true });
      if (dbChat) {
        chat.message = removeMentionHighlightsFromHtml(dbChat.message, { returnPlainText: true });
      }
      handleSortChatList();
    }

    handleResetMessage();
    state.currentChat = chat;

    // 群聊加载成员
    if (getChatIsGroup.value && chat) {
      const res: any = await safeExecute(() => api.GetGroupMember({ groupId: chat!.toId }), { operation: "getGroupMembers" });
      state.groupMembers = res ?? {};
    }

    // 触发事件
    if (state.currentChat) {
      globalEventBus.emit(Events.CHAT_CHANGED, {
        chatId: state.currentChat.chatId,
        name: state.currentChat.name,
        notification: (state.currentChat as any)?.notification
      });
    }
  };

  /** 通过目标创建/切换会话 */
  const handleChangeCurrentChatByTarget = async (target: Record<string, any>, chatType: number) => {
    const fromId = getOwnerId.value;
    const targetId = target.friendId ?? target.groupId;
    const existIdx = state.chatList.findIndex(c => c.toId === targetId && c.chatType === chatType);

    if (existIdx !== -1) {
      await handleUpdateReadStatus(state.chatList[existIdx], 0);
      state.currentChat = state.chatList[existIdx];
    } else {
      setLoading(true);
      const res = await safeExecute(
        () => api.CreateChat({ fromId, toId: targetId, chatType }),
        { operation: "createChat" }
      ) as Chats;

      if (res) {
        handleUpdateChatWithMessage(res);
        upsertChat(res);
        handleSortChatList();
        state.currentChat = res;
      }
      setLoading(false);
    }

    if (state.currentChat) {
      globalEventBus.emit(Events.CHAT_CHANGED, {
        chatId: state.currentChat.chatId,
        name: state.currentChat.name,
        notification: (state.currentChat as any)?.notification
      });
    }
  };

  /** 更新会话未读状态 */
  const handleUpdateReadStatus = async (chat: Chats, unread = 0): Promise<void> => {
    if (!chat) return;
    const idx = findChat(chat.chatId);
    if (idx === -1) return setError("会话未找到");

    state.chatList[idx].unread = unread;
    addTask(() => chatsMapper.updateById(chat.chatId, { unread } as Chats));
  };

  /** 创建或更新会话 */
  const handleCreateOrUpdateChat = async (message: IMessage | undefined, id: string | number) => {
    const ownerId = getOwnerId.value;
    const qb = new QueryBuilder<Chats>().select().and(q => q.eq("ownerId", ownerId).eq("toId", id));

    setLoading(true);

    const chats = await safeExecute(() => chatsMapper.selectList(qb), { operation: "queryChat" }) as Chats[] | null;
    let chat: Chats | null = null;

    if (chats?.length) {
      chat = chats[0];

      if (message?.fromId !== getOwnerId.value) {
        triggerNotification(chat, message);
      }

      const idx = findChat(chat.chatId);
      if (idx !== -1) {
        handleUpdateChatWithMessage(state.chatList[idx], message);
      } else {
        handleUpdateChatWithMessage(chat, message, true);
        upsertChat(chat);
      }
    } else {
      chat = await safeExecute(() => api.GetChat({ ownerId, toId: id }), { operation: "fetchChat" }) as Chats;
      if (chat) {
        handleUpdateChatWithMessage(chat, message, true);
        upsertChat(chat);
      }
    }

    if (chat) handleSortChatList();
    setLoading(false);
  };

  /** 根据消息更新会话 */
  const handleUpdateChatWithMessage = (chat: Chats, message?: IMessage, isNew = false) => {
    if (!chat) return;

    const now = Date.now();
    if (!message) {
      Object.assign(chat, { message: "", messageTime: now, sequence: now, unread: 0 });
      persistChat({ ...chat, message: "" });
      return;
    }

    const preview = buildPreview(message, true);
    if (!preview) {
      Object.assign(chat, { message: "", messageTime: message.messageTime || now, sequence: message.sequence || now });
      persistChat({ ...chat, message: "" });
      return;
    }

    const isCurrent = String(chat.toId) === String(state.currentChat?.toId);
    if (!isCurrent && !isNew) {
      chat.unread = (chat.unread || 0) + 1;
      chat.message = preview.html;
    } else {
      chat.message = preview.plainText;
    }

    chat.messageTime = message.messageTime || now;
    chat.sequence = message.sequence || now;
    persistChat({ ...chat, message: preview.originalText || preview.plainText });
  };

  /** 删除会话 */
  const handleDeleteChat = async (chat: Chats) => {
    if (!chat) return;

    const idx = findChat(chat.chatId);
    if (idx !== -1) {
      addTask(async () => {
        await chatsMapper.deleteById(chat.chatId);
        await chatsMapper.deleteFTSById(chat.chatId);
      });
      state.chatList.splice(idx, 1);
    }

    if (state.currentChat?.chatId === chat.chatId) {
      state.currentChat = null;
      handleResetMessage();
      state.groupMembers = {};
    }

    draftManager.clear(chat.chatId);
  };

  /** 置顶会话 */
  const handlePinChat = async (chat: Chats) => {
    if (!chat) return;
    const idx = findChat(chat.chatId);
    if (idx === -1) return;

    const newTop = state.chatList[idx].isTop === 1 ? 0 : 1;
    state.chatList[idx].isTop = newTop;
    await chatsMapper.updateById(chat.chatId, { isTop: newTop } as Chats);
    handleSortChatList();
  };

  /** 免打扰 */
  const handleMuteChat = async (chat: Chats) => {
    if (!chat) return;
    const idx = findChat(chat.chatId);
    if (idx === -1) return;

    const newMute = state.chatList[idx].isMute === 1 ? 0 : 1;
    state.chatList[idx].isMute = newMute;
    await chatsMapper.updateById(chat.chatId, { isMute: newMute } as Chats);
    handleSortChatList();
  };

  /** 排序会话列表 */
  const handleSortChatList = (list?: Chats[]) => {
    const target = list || state.chatList;
    state.chatList = [...target].sort((a, b) => {
      const topDiff = (b.isTop || 0) - (a.isTop || 0);
      return topDiff !== 0 ? topDiff : (b.messageTime || 0) - (a.messageTime || 0);
    });
  };

  /** 忽略所有未读 */
  const handleIgnoreAll = () => {
    getHaveMessageChat.value.forEach(item => {
      const id = String(item.chatId);
      if (!state.ignoreList.includes(id)) state.ignoreList.push(id);
    });
  };

  /** 跳转到会话 */
  const handleJumpToChat = async () => {
    if (state.currentChat) {
      await safeExecute(ShowMainWindow, { silent: true });
    }
  };

  /** 获取会话 */
  const handleGetChat = (chatId: any): Chats | undefined => state.chatList.find(c => c.chatId === chatId);

  /** 切换详情面板 */
  const handleChatDetail = () => { state.isShowDetail = !state.isShowDetail; };

  /** 删除消息敏感字段 */
  const handleDeleteMessage = (message: any) => {
    if (message?.messageContentType) delete message.messageContentType;
  };

  // ==================== 消息操作 ====================

  /** 重置消息状态 */
  const handleResetMessage = () => {
    state.messageList = [];
    state.historyList = [];
    state.currentUrls = [];
    state.groupInfo = {};
    page.num = 1;
    page.total = 0;
  };

  /** 发送消息 */
  const handleSendMessage = async (parts: IMessagePart[]) => {
    if (!parts?.length || !state.currentChat) return;

    const chat = state.currentChat;
    const fileMsgs = parts.filter(m => ["image", "video", "file"].includes(m.type));
    const textMsgs = parts.filter(m => m.type === "text");

    // 并行发送文件
    await Promise.all(fileMsgs.map(async m => {
      if (!m.file) return;
      const contentType = m.type === "image" ? MessageContentType.IMAGE.code
        : m.type === "video" ? MessageContentType.VIDEO.code
          : MessageContentType.FILE.code;
      await safeExecute(() => uploadAndSendFile(m.file!, chat, contentType), { operation: "sendFile" });
    }));

    // 并行发送文本
    await Promise.all(textMsgs.map(async m => {
      const payload = buildPayload({ text: m.content }, chat, MessageContentType.TEXT.code, {
        mentionedUserIds: m.mentionedUserIds || [],
        mentionAll: m.mentionAll,
        replyMessage: m.replyMessage
      });
      await safeExecute(() => sendSingle(payload, chat, getSendApi(chat)), { operation: "sendText" });
    }));
  };

  /** 发送单条消息 */
  const sendSingle = async (formData: any, chat: any, sendFn: Function) => {
    const res = await sendFn(formData);
    handleCreateMessage(chat.toId, res, chat.chatType, true);
    return res;
  };

  /** 上传并发送文件 */
  const uploadAndSendFile = async (file: File, chat: any, contentType: number) => {
    const md5Str = await md5(file);
    const formData = new FormData();
    formData.append("identifier", md5Str.toString());
    formData.append("file", file);

    const uploadRes: any = contentType === MessageContentType.IMAGE.code
      ? await api.uploadImage(formData)
      : await api.UploadFile(formData);

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const payload = buildPayload({ ...uploadRes, size: file.size, suffix: ext }, chat, contentType);
    await sendSingle(payload, chat, getSendApi(chat));

    return uploadRes;
  };

  /** 加载更多消息 */
  const handleMoreMessage = (): void => {
    if (!state.currentChat) return;
    page.num++;
    handleGetMessageList(state.currentChat);
  };

  /** 获取消息列表 */
  const handleGetMessageList = async (chat: any) => {
    if (!chat) return;
    if (messageCount.value === 0) await handleGetMessageCount();

    const ownId = getOwnerId.value;
    const offset = (page.num - 1) * page.size;
    const mapper = getMapper(chat.chatType);

    const messages = await safeExecute(
      () => mapper.findMessage(ownId, chat.toId, offset, page.size),
      { operation: "getMessages", fallback: [] }
    ) || [];

    const normalized = messages.map((msg: any) => normalizeMessage(msg, ownId, userStore.userInfo, chat));
    state.messageList = [...normalized, ...state.messageList];
  };

  /** 获取消息总数 */
  const handleGetMessageCount = async () => {
    const chat = state.currentChat;
    if (!chat) return;

    const mapper = getMapper(chat.chatType);
    page.total = await safeExecute(
      () => mapper.findMessageCount(chat.ownerId || chat.toId, chat.toId),
      { fallback: 0 }
    ) || 0;
  };

  /** 创建消息 */
  const handleCreateMessage = (id: string | number, message: any, messageType: number, isSender = false) => {
    if (id === state.currentChat?.toId) {
      const normalized = normalizeMessage(message, getOwnerId.value, userStore.userInfo, state.currentChat);
      state.messageList.push(normalized);

      if (isSender) handleCreateOrUpdateChat(message, state.currentChat.toId);
    }

    handleInsertToDatabase(message, messageType);
  };

  /** 插入消息到数据库 */
  const handleInsertToDatabase = async (message: any, messageType: number) => {
    const record = toDbRecord(message);
    const mapper = getMapper(messageType);

    addTask(() => {
      mapper.insert(record);
      const text = message.messageBody?.text;
      if (text) mapper.insertOrUpdateFTS({ ...record, messageBody: text });
    });
  };

  /** 发送撤回消息 */
  const handleSendRecallMessage = async (message: any, opts: { reason?: string; recallTime?: number } = {}) => {
    if (!message?.messageId) return { ok: false, msg: "invalid message" };

    const ownerId = getOwnerId.value;
    const payload = {
      actionType: 1,
      operatorId: ownerId,
      recallTime: opts.recallTime ?? Date.now(),
      reason: opts.reason ?? "已撤回",
      fromId: ownerId,
      messageTempId: message.messageTempId ?? "",
      messageId: String(message.messageId),
      messageContentType: Number(message.messageContentType ?? MessageContentType.TEXT.code),
      messageTime: message.messageTime ?? Date.now(),
      messageType: Number(message.messageType ?? IMessageType.SINGLE_MESSAGE.code),
      messageBody: {}
    };

    const result = await safeExecute(() => api.RecallMessage(payload), { operation: "recallMessage" });
    if (result !== undefined) {
      await handleReCallMessage(payload);
      return { ok: true };
    }
    return { ok: false, msg: "撤回失败" };
  };

  /** 处理撤回消息 */
  const handleReCallMessage = async (data: any) => {
    if (!data?.messageId) return setError("invalid recall payload");

    const messageId = String(data.messageId);
    const messageType = Number(data.messageType ?? IMessageType.SINGLE_MESSAGE.code);
    const mapper = getMapper(messageType);

    const recallPayload = {
      _recalled: true,
      operatorId: data.operatorId ?? data.fromId ?? "",
      recallTime: data.recallTime ?? Date.now(),
      reason: data.reason ?? "",
      text: "已撤回一条消息"
    };

    // 更新内存
    const idx = state.messageList.findIndex((m: any) => String(m.messageId) === messageId);
    if (idx !== -1) {
      state.messageList[idx] = {
        ...state.messageList[idx],
        messageBody: recallPayload,
        messageContentType: MessageContentType.TIP?.code ?? 99
      };
    }

    // 更新数据库
    addTask(async () => {
      await mapper.updateById(messageId, {
        messageBody: JSON.stringify(recallPayload),
        messageContentType: MessageContentType.TIP?.code ?? 99
      } as any);
      await mapper.deleteFTSById(messageId);
    });
  };

  /** 搜索消息 URL */
  const handleSearchMessageUrl = async (msg: any): Promise<void> => {
    const mapper = getMapper(msg.messageType);
    state.currentUrls = await safeExecute(
      () => mapper.findMessageUrl(msg.fromId || msg.groupId, msg.toId),
      { fallback: [] }
    ) || [];
  };

  /** 获取历史消息 */
  const handleHistoryMessage = async (
    pageInfo: PageResult<any>,
    searchStr?: string | string[]
  ): Promise<{ list: any[]; total: number }> => {
    const chat = state.currentChat;
    if (!chat?.toId) return { list: [], total: 0 };

    const ownId = getOwnerId.value;
    const toId = chat.toId;
    const isSingle = isSingleChat(chat);
    const mapper = isSingle ? singleMessageMapper : groupMessageMapper;

    const qb = new FTSQueryBuilder<any>();
    const params: (string | number)[] = isSingle ? [ownId, toId, toId, ownId] : [ownId, toId];
    qb.raw(
      isSingle ? "((fromId = ? AND toId = ?) OR (fromId = ? AND toId = ?))" : "ownerId = ? AND groupId = ?",
      ...params
    ).orderByAsc("sequence");

    // 分词处理
    let tokens: string[] = [];
    if (Array.isArray(searchStr)) {
      tokens = searchStr.map(String);
    } else if (searchStr?.trim()) {
      if (searchStr.includes(" ")) {
        tokens = searchStr.trim().split(/\s+/);
      } else {
        const segmented = await safeExecute(() => Segmenter.segment(searchStr), { silent: true });
        tokens = segmented || (/[\p{Script=Han}]/u.test(searchStr) ? Array.from(searchStr) : searchStr.split(/\s+/).filter(Boolean));
      }
    }

    tokens = tokens.map(t => t.trim().replace(/["']/g, "")).filter(Boolean);

    if (tokens.length) {
      qb.setMatchColumn("messageBody")
        .matchKeyword(tokens.join(" "), "and")
        .addSnippetSelect("excerpt", "snippet({table}, 0, '<b>', '</b>', '...', 10)")
        .setRankingExpr("bm25({table})", "DESC");
    } else {
      qb.isNotNull("messageBody");
    }

    const ftsPage: any = await safeExecute(
      () => (mapper as any).searchFTS5Page(qb, pageInfo.page, pageInfo.size),
      { fallback: { records: [], total: 0 } }
    ) || { records: [], total: 0 };

    const ids = ftsPage.records?.map((i: any) => i.messageId).filter(Boolean) ?? [];
    if (!ids.length) return { list: [], total: ftsPage.total ?? 0 };

    const records: any[] = await safeExecute(
      () => (mapper as any).selectByIds(ids, "messageTime", "desc"),
      { fallback: [] }
    ) || [];

    if (!records.length) return { list: [], total: ftsPage.total ?? 0 };

    const memberMap = new Map(getCurrentGroupMembersExcludeSelf.value.map(m => [m.userId, m]));
    const userInfo = userStore.userInfo ?? {};

    const formatted = records.map(item => {
      if (!item) return null;

      let body: any;
      if (typeof item.messageBody === "string") {
        const parsed = safeExecute(() => JSON.parse(item.messageBody), { silent: true, fallback: { text: String(item.messageBody ?? "") } });
        body = parsed;
      } else {
        body = item.messageBody;
      }

      if (tokens.length && body?.text) {
        body.text = highlightTextByTokens(body.text, tokens);
      }

      const isOwner = ownId === item.fromId;
      const member = isSingle ? null : memberMap.get(item.fromId);

      return {
        ...item,
        messageBody: body,
        name: isOwner ? userInfo.name : isSingle ? chat.name : member?.name ?? "未知",
        avatar: isOwner ? userInfo.avatar : isSingle ? chat.avatar : member?.avatar ?? "",
        isOwner
      };
    }).filter(Boolean);

    return { list: formatted, total: ftsPage.total ?? 0 };
  };

  /** 更新消息 */
  const handleUpdateMessage = (message: any, update: any) => {
    const mapper = getMapper(message.messageType);
    mapper.updateById(message.messageId, update);

    const idx = state.messageList.findIndex(m => m.messageId === message.messageId);
    if (idx !== -1) state.messageList[idx] = { ...state.messageList[idx], ...update };
  };

  /** 清空消息 */
  const handleClearMessage = async (chat: Chats) => {
    const ownerId = getOwnerId.value;

    if (!isSingleChat(chat)) {
      await groupMessageMapper.clearChatHistory(String(chat.toId), String(ownerId));
    } else {
      await singleMessageMapper.deleteByFormIdAndToId(String(ownerId), String(chat.toId));
      await singleMessageMapper.deleteByFormIdAndToIdVirtual(String(ownerId), String(chat.toId));
    }

    handleResetMessage();
    await handleGetMessageList(chat);
  };

  /** 删除消息 */
  const handleDeleteMessageFromList = async (message: any) => {
    const idx = state.messageList.findIndex(m => m.messageId === message.messageId);
    if (idx !== -1) state.messageList.splice(idx, 1);

    const mapper = getMapper(message.messageType);
    addTask(async () => {
      await mapper.deleteById(message.messageId);
      await mapper.deleteFTSById(message.messageId);
    });
  };

  // ==================== 草稿管理（代理到 draftManager） ====================

  /** 设置草稿 */
  const setDraft = (chatId: string | number, html: string) => draftManager.set(chatId, html);

  /** 获取草稿 */
  const getDraft = (chatId: string | number) => draftManager.get(chatId);

  /** 清除草稿 */
  const clearDraft = (chatId: string | number) => draftManager.clear(chatId);

  /** 检查是否有草稿 */
  const hasDraft = (chatId: string | number) => draftManager.has(chatId);

  /** 保存草稿作为会话预览 */
  const saveDraftAsPreview = async () => {
    const chatId = state.currentChat?.chatId;
    if (!chatId) return;

    const draftHtml = getDraft(chatId);
    if (!draftHtml) return;

    const preview = buildDraftMessagePreview(String(chatId), draftHtml);
    if (preview) {
      upsertChat({ chatId, message: preview, messageTime: Date.now() } as any);
    }
  };


  // ==================== 群组操作 ====================

  /** 添加群成员 */
  const handleAddGroupMember = async (membersList: string[], isInvite = false) => {
    if (!membersList?.length) return;

    await safeExecute(() => api.InviteGroupMember({
      groupId: state.currentChat?.toId ?? "",
      userId: storage.get("userId") || "",
      memberIds: membersList,
      type: isInvite ? IMActionType.INVITE_TO_GROUP.code : IMActionType.CREATE_GROUP.code
    }), { operation: "addGroupMember" });
  };

  /** 批准群邀请 */
  const handleApproveGroupInvite = async (inviteInfo: any) => {
    await safeExecute(() => api.ApproveGroup({
      requestId: inviteInfo.requestId,
      groupId: inviteInfo.groupId ?? "",
      userId: storage.get("userId") || "",
      inviterId: inviteInfo.inviterId,
      approveStatus: inviteInfo.approveStatus
    }), { operation: "approveGroupInvite" });
  };

  /** 更新群信息 */
  const updateGroupInfo = async (dto: {
    groupId: string;
    chatId?: string;
    userId?: string;
    groupName?: string;
    avatar?: string;
    introduction?: string;
    notification?: string;
  }) => {
    const payload: any = { groupId: dto.groupId, userId: dto.userId ?? getOwnerId.value };
    if (dto.groupName) payload.groupName = dto.groupName;
    if (dto.avatar) payload.avatar = dto.avatar;
    if (dto.introduction) payload.introduction = dto.introduction;
    if (dto.notification) payload.notification = dto.notification;

    const result = await api.updateGroupInfo(payload);
    if (!result) throw new Error("UPDATE_GROUP_INFO_FAILED");

    const chatKey = dto.chatId ?? dto.groupId;

    // 更新群名
    if (dto.groupName) {
      const idx = findChat(chatKey);
      if (idx !== -1) {
        state.chatList[idx].name = dto.groupName as any;
        await chatsMapper.updateById(chatKey, { name: dto.groupName } as Chats);
        await chatsMapper.insertOrUpdateFTS({ chatId: chatKey, name: dto.groupName } as any);
      }
      if (state.currentChat?.chatId === chatKey) {
        (state.currentChat as any).name = dto.groupName;
      }

      // 同步好友列表
      const friendsStore = useFriendsStore();
      const gIdx = friendsStore.groups.findIndex((g: any) => String(g.groupId) === String(dto.groupId));
      if (gIdx !== -1) friendsStore.groups[gIdx].groupName = dto.groupName;
      if (friendsStore.shipInfo && String((friendsStore.shipInfo as any).groupId) === String(dto.groupId)) {
        (friendsStore.shipInfo as any).groupName = dto.groupName;
      }
    }

    // 更新群公告
    if (dto.notification) {
      const idx = findChat(chatKey);
      if (idx !== -1) {
        (state.chatList[idx] as any).notification = dto.notification;
        await chatsMapper.updateById(chatKey, { notification: dto.notification } as any);
      }
      if (state.currentChat?.chatId === chatKey) {
        (state.currentChat as any).notification = dto.notification;
      }

      const friendsStore = useFriendsStore();
      const gIdx = friendsStore.groups.findIndex((g: any) => String(g.groupId) === String(dto.groupId));
      if (gIdx !== -1) (friendsStore.groups[gIdx] as any).notification = dto.notification;
      if (friendsStore.shipInfo && String((friendsStore.shipInfo as any).groupId) === String(dto.groupId)) {
        (friendsStore.shipInfo as any).notification = dto.notification;
      }
    }

    return result;
  };

  // ==================== 工具方法 ====================

  const handleShowScreenshot = () => CreateScreenWindow(screen.availWidth, screen.availHeight);
  const handleShowRecord = () => CreateRecordWindow(screen.availWidth, screen.availHeight);

  const triggerNotification = async (chat: Chats, message?: IMessage) => {
    if (settingStore.notification.message && chat.isMute === 0 && message) {
      play(AudioEnum.MESSAGE_ALERT);
    }
  };

  const fetchChatFromServer = async (ownerId: string | number, toId: string | number) => {
    return safeExecute(() => api.GetChat({ ownerId, toId }), { operation: "fetchChat" }) as Promise<Chats | null>;
  };

  const findMessageIndex = (messageId: string | number) => state.messageList.findIndex(m => m.messageId == messageId);

  const chooseByIMessageType = (messageType: number) => ({
    mapper: getMapper(messageType),
    isSingle: messageType === IMessageType.SINGLE_MESSAGE.code
  });


  // ==================== 状态管理 ====================

  const setLoading = (flag: boolean) => { state.loading = flag; };
  const setError = (err: string | null) => {
    state.error = err;
    if (err) log.error?.("[ChatStore]", err);
  };

  // ==================== 辅助工具 ====================

  const isSingleChat = (chat: any): boolean => chat?.chatType === IMessageType.SINGLE_MESSAGE.code;
  const getMapper = (type: number) => type === IMessageType.SINGLE_MESSAGE.code ? singleMessageMapper : groupMessageMapper;
  const getSendApi = (chat: any) => isSingleChat(chat) ? api.SendSingleMessage : api.SendGroupMessage;

  const findChat = (id: any): number => findChatIndex(state.chatList, id);

  const upsertChat = (chat: Partial<Chats> & { chatId?: any }): number => {
    if (!chat?.chatId) return -1;
    const idx = findChat(chat.chatId);
    if (idx !== -1) {
      state.chatList[idx] = { ...state.chatList[idx], ...chat };
      return idx;
    }
    state.chatList.push(chat as Chats);
    return state.chatList.length - 1;
  };

  const persistChat = (chat: Partial<Chats>) => {
    if (!chat?.chatId) return;
    addTask(() => {
      chatsMapper.insertOrUpdate(chat);
      chatsMapper.insertOrUpdateFTS(chat);
    });
  };

  const buildPayload = (content: any, chat: any, contentType: number, meta: any = {}) => {
    const toKey = isSingleChat(chat) ? "toId" : "groupId";
    const payload: any = {
      fromId: getOwnerId.value,
      messageBody: content,
      messageTempId: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      messageTime: Date.now(),
      messageContentType: contentType,
      messageType: chat?.chatType,
      [toKey]: chat?.toId || ""
    };

    if (meta.mentionedUserIds?.length) payload.mentionedUserIds = [...new Set(meta.mentionedUserIds)];
    if (meta.mentionAll) payload.mentionAll = true;
    if (meta.replyMessage) payload.replyMessage = meta.replyMessage;

    return payload;
  };

  const toDbRecord = (msg: any) => {
    const record = { ...msg, ownerId: getOwnerId.value, messageBody: JSON.stringify(msg.messageBody) };
    delete record.messageTempId;
    return record;
  };

  /** 消息处理 获取用户信息 */
  const normalizeMessage = (msg: any, ownId: string, userInfo: any, chat: any) => {
    try {
      const body = typeof msg.messageBody === "string" ? JSON.parse(msg.messageBody) : msg.messageBody;
      const isOwner = ownId === msg.fromId;
      const member = state.groupMembers[msg.fromId];
      if (msg.messageContentType === MessageContentType.TIP.code) return {
        ...msg,
        messageBody: body
      };
      // 忽略非单聊群聊消息类型
      return {
        ...msg,
        messageBody: body,
        name: isOwner ? userInfo.name : member.name || chat.name,
        avatar: isOwner ? userInfo.avatar : member.avatar || chat.avatar,
        isOwner
      };
    } catch {
      /* 忽略解析错误 */
    }
    return msg;
  };

  const buildPreview = (message?: IMessage, asHtml = true) => {
    if (!message) return null;
    try {
      return buildMessagePreview(message, {
        currentUserId: getOwnerId.value,
        highlightClass: "mention-highlight",
        asHtml
      });
    } catch {
      return null;
    }
  };

  // ==================== 导出 ====================

  return {
    // 状态（兼容 ref 写法）
    chatList, messageList, currentChat, currentChatGroupMemberMap,
    isShowDetail, ignoreAllList, chatDraftMap, historyMessageList,
    groupInfo, currentUrls, loading, error, page,

    // 计算属性
    getCurrentName, getChatById, getCurrentType, getTotalUnread,
    getShowDetailBtn, getShowDetail, getHaveMessageChat, getChatIsGroup,
    getOwnerId, getCurrentGroupMembersExcludeSelf, remainingQuantity,

    // 状态管理
    setLoading, setError,

    // 会话操作
    handleInitChat, handleChangeCurrentChat, handleChangeCurrentChatByTarget,
    handleUpdateReadStatus, handleCreateOrUpdateChat, handleUpdateChatWithMessage,
    handleDeleteChat, handlePinChat, handleMuteChat, handleSortChatList,
    handleIgnoreAll, handleJumpToChat, handleGetChat, handleChatDetail,
    handleDeleteMessage, upsertChat, persistPreviewToDb: persistChat,
    buildPreviewFromMessage: buildPreview, fetchChatFromServer, triggerNotification,

    // 草稿管理
    setDraft, getDraft, clearDraft, hasDraft, saveDraftAsPreview,

    // 消息操作
    handleResetMessage, handleSendMessage, sendSingle, uploadAndSendFile,
    handleMoreMessage, handleGetMessageList, handleGetMessageCount,
    handleCreateMessage, handleInsertToDatabase, handleSendRecallMessage,
    handleReCallMessage, handleSearchMessageUrl, handleHistoryMessage,
    handleUpdateMessage, handleClearMessage, handleDeleteMessageFromList,

    // 群组操作
    handleAddGroupMember, handleApproveGroupInvite, updateGroupInfo,

    // 工具方法
    handleShowScreenshot, handleShowRecord, isSingleChat,
    getMapperByType: getMapper, getSendApiByChat: getSendApi,
    buildFormPayload: buildPayload, toDbRecord, normalizeMessageForUI: normalizeMessage,
    findMessageIndex, chooseByIMessageType
  };
}, {
  persist: [
    {
      key: `${StoresEnum.CHAT}_local`,
      paths: ["state.groupMembers", "state.ignoreList"],
      storage: localStorage
    },
    {
      key: `${StoresEnum.CHAT}_session_chat`,
      paths: ["state.chatList", "state.currentChat"],
      storage: sessionStorage
    },
    {
      key: `${StoresEnum.CHAT}_session_message`,
      paths: ["state.messageList"],
      storage: sessionStorage
    }
  ],
  sync: {
    paths: ["state.chatList"],
    targetWindows: [StoresEnum.NOTIFY],
    sourceWindow: StoresEnum.MAIN
  }
});
