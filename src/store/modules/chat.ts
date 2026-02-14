import api from "@/api/index";
import { Events, isTextType, MessageContentType, MessageType, StoresEnum } from "@/constants";
import { PageResult, QueryBuilder, useMappers } from "@/database";
import Chats from "@/database/entity/Chats";
import { AudioEnum, useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useChatInput } from "@/hooks/useChatInput";
import useCrypto from "@/hooks/useCrypto";
import { globalEventBus } from "@/hooks/useEventBus";
import { useIdleTaskExecutor } from "@/hooks/useIdleTaskExecutor";
import { draftManager } from "@/hooks/useInputEditor";
import { IMessage, IMessageAction, IMessagePart, IMGroupMessage, IMSingleMessage, RecallMessageBody } from "@/models";
import { safeExecute } from "@/utils/ExceptionHandler";
import { storage } from "@/utils/Storage";
import { textReplaceMention } from "@/utils/Strings";
import { ShowMainWindow } from "@/windows/main";
import { CreateRecordWindow } from "@/windows/record";
import { CreateScreenWindow } from "@/windows/screen";
import { defineStore } from "pinia";
import { computed, reactive } from "vue";
import { useGroupStore } from "./group";
import { useSearchStore } from "./search";
import { useSettingStore } from "./setting";
import { useUserStore } from "./user";

// ==================== 类型定义 ====================

interface ChatState {
  chatList: Chats[];
  messageList: IMessage[];
  currentChat: Chats | null;
  isShowDetail: boolean;
  ignoreList: string[];
  historyList: IMessage[];
  currentUrls: string[];
  loading: boolean;
  error: string | null;
}

// ==================== Store 定义 ====================

export const useChatStore = defineStore(StoresEnum.CHAT, () => {
  // ==================== 依赖 ====================
  const { chatsMapper, singleMessageMapper, groupMessageMapper } = useMappers();
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
  const { md5 } = useCrypto();

  // ==================== 状态 ====================
  const state = reactive<ChatState>({
    chatList: [],
    messageList: [],
    currentChat: null,
    isShowDetail: false,
    ignoreList: [],
    historyList: [],
    currentUrls: [],
    loading: false,
    error: null
  });

  // 群组 Store（延迟初始化避免循环依赖）
  let _groupStore: ReturnType<typeof useGroupStore> | null = null;
  const getGroupStore = () => {
    if (!_groupStore) _groupStore = useGroupStore();
    return _groupStore;
  };

  const page = reactive({ num: 1, size: 20, total: 0 });

  // ==================== 核心工具 ====================
  const ownerId = computed(() => userStore.userId || storage.get("userId"));
  const isSingle = (chat: any) => chat?.chatType === MessageType.SINGLE_MESSAGE.code;
  const mapper = (type: number) => type === MessageType.SINGLE_MESSAGE.code ? singleMessageMapper : groupMessageMapper;
  const sendApi = (chat: any) => isSingle(chat) ? api.SendSingleMessage : api.SendGroupMessage;
  const findIdx = (id: any) => findChatIndex(state.chatList, id);

  // ==================== 计算属性 ====================
  const getters = {
    currentName: computed(() => state.currentChat?.name || ""),
    currentType: computed(() => state.currentChat?.chatType),
    totalUnread: computed(() => state.chatList.reduce((s, c) => c.isMute === 0 ? s + (c.unread || 0) : s, 0)),
    isGroup: computed(() => state.currentChat?.chatType === MessageType.GROUP_MESSAGE.code),
    remaining: computed(() => Math.max(0, page.total - page.num * page.size)),
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

  const parseBody = (raw: unknown): Record<string, any> => {
    if (raw == null) return {};
    if (typeof raw === "object") return Array.isArray(raw) ? { parts: raw } : raw as Record<string, any>;
    if (typeof raw !== "string") return { text: String(raw) };
    try {
      const parsed = JSON.parse(raw.trim());
      return typeof parsed === "object" && parsed ? (Array.isArray(parsed) ? { parts: parsed } : parsed) : { text: String(parsed) };
    } catch { return { text: raw }; }
  };

  /**
   * 转换为 JSON 字符串
   */
  const stringifyBody = (raw: unknown): string => {
    if (raw == null) return "{}";
    if (typeof raw === "string") {
      try { JSON.parse(raw); return raw; } catch { return JSON.stringify({ text: raw }); }
    }
    return JSON.stringify(raw);
  };

  /**
   * 归一化消息（填充缺失字段）
   */
  const normalizeMsg = (msg: any, chat: any) => {
    const body = parseBody(msg?.messageBody);
    const fromId = msg?.fromId ?? msg?.userId;
    const isOwner = String(ownerId.value) === String(fromId);
    if (Number(msg?.messageContentType) === MessageContentType.TIP.code) return { ...msg, messageBody: body };

    const groupStore = getGroupStore();
    const member = !isOwner && fromId ? groupStore.getMember(String(fromId)) : undefined;
    const user = userStore.userInfo ?? {};
    const mentionAll = Boolean((body as any)?.mentionAll);
    const mentionedUserIds = Array.isArray((body as any)?.mentionedUserIds)
      ? (body as any).mentionedUserIds.map((v: any) => String(v)).filter(Boolean)
      : [];
    return {
      ...msg,
      messageBody: body,
      name: isOwner ? user.name ?? chat?.name : member?.name ?? chat?.name ?? "",
      avatar: isOwner ? user.avatar ?? chat?.avatar : member?.avatar ?? chat?.avatar ?? "",
      isOwner,
      mentionAll,
      mentionedUserIds
    };
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

  /**
   * 转换为记录
   */
  const toRecord = (msg: any) => {
    const r = { ...msg, ownerId: ownerId.value, messageBody: stringifyBody(msg?.messageBody) };
    delete r.messageTempId;
    return r;
  };

  /**
   * 构建消息发送参数
   */
  const buildPayload = (content: any, chat: any, contentType: number, meta: any = {}) => {
    // 将 replyMessage 放入 messageBody 中
    const messageBody = { ...content };
    if (meta.replyMessage) {
      messageBody.replyMessage = meta.replyMessage;
    }
    if (meta.mentionedUserIds?.length) {
      messageBody.mentionedUserIds = [...new Set(meta.mentionedUserIds)];
    }
    if (meta.mentionAll) {
      messageBody.mentionAll = meta.mentionAll;
    }

    const payload: any = {
      fromId: ownerId.value,
      messageBody,
      messageTempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      messageTime: Date.now(),
      messageContentType: contentType,
      messageType: chat?.chatType,
      [isSingle(chat) ? "toId" : "groupId"]: chat?.toId || ""
    };

    return payload;
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

    resetMessages();
    state.currentChat = chat;

    // 群聊：加载群成员
    if (getters.isGroup.value && chat) {
      const groupStore = getGroupStore();
      await groupStore.loadMembers(String(chat.toId));
    }
    emitChange();
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
    addTask(() => chatsMapper.updateById(chat.chatId, { unread } as Chats));
  };

  const createOrUpdate = async (message: IMessage | undefined, id: string | number) => {
    const qb = new QueryBuilder<Chats>().select().and(q => q.eq("ownerId", ownerId.value).eq("toId", id));
    state.loading = true;

    const chats = await exec(() => chatsMapper.selectList(qb), { op: "queryChat" }) as Chats[] | null;
    let chat: Chats | null = chats?.[0] ?? null;

    if (chat) {
      if (message?.fromId !== ownerId.value) triggerNotify(chat, message);
      const idx = findIdx(chat.chatId);
      updateWithMsg(idx !== -1 ? state.chatList[idx] : chat, message, idx === -1);
      if (idx === -1) upsert(chat);
    } else {
      chat = await exec(() => api.GetChat({ ownerId: ownerId.value, toId: id }), { op: "fetchChat" }) as Chats;
      if (chat) { updateWithMsg(chat, message, true); upsert(chat); }
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
      resetMessages();
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

  // ==================== 消息操作 ====================
  const resetMessages = () => {
    state.messageList = [];
    state.historyList = [];
    state.currentUrls = [];
    Object.assign(page, { num: 1, total: 0 });
  };

  const sendMessage = async (parts: IMessagePart[]) => {
    if (!parts?.length || !state.currentChat) return;
    const chat = state.currentChat;

    const tasks = parts.map(async m => {
      if (["image", "video", "file"].includes(m.type) && m.file) {
        const contentType = m.type === "image" ? MessageContentType.IMAGE.code
          : m.type === "video" ? MessageContentType.VIDEO.code : MessageContentType.FILE.code;
        await exec(() => uploadAndSend(m.file!, chat, contentType, m.replyMessage), { op: "sendFile" });
      } else if (m.type === "text") {
        const payload = buildPayload(
          {
            text: m.content,
          },
          chat,
          MessageContentType.TEXT.code,
          {
            replyMessage: m.replyMessage,
            mentionedUserIds: m.mentionedUserIds || [],
            mentionAll: m.mentionAll,
          });
        await exec(() => send(payload, chat), { op: "sendText" });
      }
    });
    await Promise.all(tasks);
  };

  const send = async (formData: any, chat: any) => {
    const res = await sendApi(chat)(formData);
    // createMessage(chat.toId, res, chat.chatType, true);
    return res;
  };

  const uploadAndSend = async (file: File, chat: any, contentType: number, replyMessage?: any) => {
    const md5Str = await md5(file);
    const formData = new FormData();
    formData.append("identifier", md5Str.toString());
    formData.append("file", file);

    const uploadRes: any = contentType === MessageContentType.IMAGE.code
      ? await api.uploadImage(formData) : await api.UploadFile(formData);

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const payload = buildPayload({ ...uploadRes, size: file.size, suffix: ext }, chat, contentType, { replyMessage });
    await send(payload, chat);
    return uploadRes;
  };

  const loadMore = () => {
    if (!state.currentChat) return;
    page.num++;
    getMessages(state.currentChat);
  };

  const getMessages = async (chat: any) => {
    if (!chat) return;
    if (!page.total) await getMessageCount();

    const offset = (page.num - 1) * page.size;
    const msgs = await exec(() => mapper(chat.chatType).findMessage(ownerId.value, chat.toId, offset, page.size), { fallback: [] }) || [];
    const normalized = msgs.map((m: any) => normalizeMsg(m, chat));
    state.messageList = [...normalized, ...state.messageList];
  };

  const getMessageCount = async () => {
    const chat = state.currentChat;
    if (!chat) return;
    page.total = await exec(() => mapper(chat.chatType).findMessageCount(chat.ownerId || chat.toId, chat.toId), { fallback: 0 }) || 0;
  };

  const createMessage = (id: string | number, message: any, messageType: number, isSender = false) => {
    if (id === state.currentChat?.toId) {
      state.messageList.push(normalizeMsg(message, state.currentChat));
      if (isSender) createOrUpdate(message, state.currentChat.toId);
    }
    insertToDb(message, messageType);
  };

  const insertToDb = (message: any, messageType: number) => {
    const record = toRecord(message);
    const m = mapper(messageType);
    addTask(() => {
      m.insert(record);
      // 仅文本类消息插入 FTS 索引
      const contentType = Number(message.messageContentType);
      if (isTextType(contentType) && message.messageBody?.text) {
        m.insertOrUpdateFTS({ ...record, messageBody: message.messageBody.text });
      }
    });
  };

  const recallMessage = async (message: IMSingleMessage | IMGroupMessage, opts: { reason?: string; recallTime?: number } = {}) => {
    if (!message?.messageId) return { ok: false, msg: "invalid message" };

    const payload = {
      fromId: ownerId.value,
      messageTempId: message.messageTempId ?? "",
      messageId: String(message.messageId),
      messageTime: Date.now(),
      messageType: message.messageType,
      messageContentType: MessageContentType.RECALL_MESSAGE.code,
      messageBody: new RecallMessageBody({
        messageId: message.messageId,
        operatorId: ownerId.value,
        recallTime: opts.recallTime ?? Date.now(),
        chatType: message.messageType,
      })
    };

    const result = await exec(() => api.RecallMessage(payload), { op: "recallMessage" });
    if (result !== undefined) {
      // await handleRecall(payload);
      log.prettyDebug("消息已撤回", result);
    }
  };

  /**
   * 处理撤回消息
   */
  const handleRecall = async (data: IMessageAction) => {
    if (!data?.messageId) return;
    const messageBody = data.messageBody as RecallMessageBody;
    const messageId = data.messageId;
    const m = mapper(Number(messageBody.chatType ?? MessageType.SINGLE_MESSAGE.code));

    const recallBody = {
      _recalled: true,
      operatorId: messageBody.operatorId ?? "",
      recallTime: messageBody.recallTime ?? Date.now(),
      reason: messageBody.reason ?? "",
      name: getUserNameByType(messageBody.operatorId ?? "", Number(messageBody.chatType ?? MessageType.SINGLE_MESSAGE.code)),
    };

    const idx = state.messageList.findIndex((msg: any) => String(msg.messageId) === messageId);
    if (idx !== -1) {
      state.messageList[idx] = {
        ...state.messageList[idx],
        messageBody: recallBody,
        messageContentType: MessageContentType.RECALL_MESSAGE?.code
      };
    }

    addTask(async () => {
      await m.updateById(messageId, { messageBody: JSON.stringify(recallBody), messageContentType: MessageContentType.RECALL_MESSAGE?.code } as any);
      await m.deleteFTSById(messageId);
    });
  };

  const getUserNameByType = (id: string, type: number) => {
    if (type === MessageType.SINGLE_MESSAGE.code) {
      return getters.currentName;
    }
    if (type === MessageType.GROUP_MESSAGE.code) {
      const member = getters.membersExcludeSelf.value.find(m => m.userId === id);
      return member?.name || member?.userId;
    }
  };

  const searchUrls = async (msg: any) => {
    state.currentUrls = await exec(() => mapper(msg.messageType).findMessageUrl(msg.fromId || msg.groupId, msg.toId), { fallback: [] }) || [];
  };

  /**
   * 搜索当前会话的历史消息（委托给 searchStore）
   */
  const searchHistory = async (pageInfo: PageResult<any>, searchStr?: string | string[]): Promise<{ list: any[]; total: number }> => {
    const chat = state.currentChat;
    if (!chat?.toId) return { list: [], total: 0 };

    const searchStore = useSearchStore();

    // 构建会话上下文
    const chatContext = {
      toId: chat.toId,
      chatType: chat.chatType,
      name: chat.name,
      avatar: chat.avatar
    };

    // 构建用户上下文
    const memberMap = new Map(getters.membersExcludeSelf.value.map(m => [m.userId, m]));
    const userContext = {
      ownerId: ownerId.value,
      userInfo: userStore.userInfo ?? {},
      groupMembers: memberMap
    };

    return searchStore.searchChatHistory(chatContext, userContext, pageInfo, searchStr);
  };

  const updateMessage = (message: any, update: any) => {
    mapper(message.messageType).updateById(message.messageId, update);
    const idx = state.messageList.findIndex(m => m.messageId === message.messageId);
    if (idx !== -1) state.messageList[idx] = { ...state.messageList[idx], ...update };
  };

  const clearMessages = async (chat: Chats) => {
    if (!isSingle(chat)) {
      await groupMessageMapper.clearChatHistory(String(chat.toId), String(ownerId.value));
    } else {
      await singleMessageMapper.deleteByFormIdAndToId(String(ownerId.value), String(chat.toId));
      await singleMessageMapper.deleteByFormIdAndToIdVirtual(String(ownerId.value), String(chat.toId));
    }
    resetMessages();
    await getMessages(chat);
  };

  const deleteMessage = async (message: any) => {
    const idx = state.messageList.findIndex(m => m.messageId === message.messageId);
    if (idx !== -1) state.messageList.splice(idx, 1);

    const m = mapper(message.messageType);
    addTask(async () => {
      await m.deleteById(message.messageId);
      await m.deleteFTSById(message.messageId);
    });
  };

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

  // ==================== 群组操作（委托给 groupStore） ====================

  /**
   * 邀请群成员
   */
  const addGroupMember = async (memberIds: string[], isInvite = false) => {
    if (!memberIds?.length || !state.currentChat?.toId) return;
    await getGroupStore().inviteMembers({
      groupId: String(state.currentChat.toId),
      memberIds,
      type: isInvite ? 1 : 0
    });
  };

  /**
   * 更新群信息（同步更新本地 chatList 状态）
   */
  const updateGroup = async (dto: {
    groupId: string;
    chatId?: string;
    groupName?: string;
    avatar?: string;
    introduction?: string;
    notification?: string;
  }) => {
    const chatKey = dto.chatId ?? dto.groupId;
    const result = await getGroupStore().updateGroupInfo({
      groupId: dto.groupId,
      groupName: dto.groupName,
      avatar: dto.avatar,
      introduction: dto.introduction,
      notification: dto.notification
    }, chatKey);

    if (!result) throw new Error("UPDATE_GROUP_INFO_FAILED");

    // 同步更新本地 chatList 状态
    const idx = findIdx(chatKey);
    if (dto.groupName) {
      if (idx !== -1) state.chatList[idx].name = dto.groupName as any;
      if (state.currentChat?.chatId === chatKey) (state.currentChat as any).name = dto.groupName;
    }
    if (dto.notification) {
      if (idx !== -1) (state.chatList[idx] as any).notification = dto.notification;
      if (state.currentChat?.chatId === chatKey) (state.currentChat as any).notification = dto.notification;
    }
    return result;
  };

  /**
   * 退出或解散群组
   */
  const leaveOrDismissGroup = async (groupId: string): Promise<boolean> => {
    const groupStore = getGroupStore();
    const result = groupStore.getIsOwner
      ? await groupStore.dismissGroup(groupId)
      : await groupStore.quitGroup(groupId);

    if (result) {
      const idx = findIdx(groupId);
      if (idx !== -1) await deleteChat(state.chatList[idx]);
    }
    return result;
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
    state, page,
    chatList: computed({ get: () => state.chatList, set: v => { state.chatList = v; } }),
    messageList: computed({ get: () => state.messageList, set: v => { state.messageList = v; } }),
    currentChat: computed({ get: () => state.currentChat, set: v => { state.currentChat = v; } }),
    currentChatGroupMemberMap: computed({ get: () => getGroupStore().members, set: v => { getGroupStore().members = v; } }),
    isShowDetail: computed({ get: () => state.isShowDetail, set: v => { state.isShowDetail = v; } }),
    ignoreAllList: computed({ get: () => state.ignoreList, set: v => { state.ignoreList = v; } }),
    historyMessageList: computed({ get: () => state.historyList, set: v => { state.historyList = v; } }),
    groupInfo: computed({ get: () => getGroupStore().info, set: v => { getGroupStore().info = v; } }),
    currentUrls: computed({ get: () => state.currentUrls, set: v => { state.currentUrls = v; } }),
    loading: computed({ get: () => state.loading, set: v => { state.loading = v; } }),
    error: computed({ get: () => state.error, set: v => { state.error = v; } }),
    chatDraftMap: computed(() => draftManager.getAll()),

    // 计算属性
    getCurrentName: getters.currentName,
    getCurrentType: getters.currentType,
    getTotalUnread: getters.totalUnread,
    getChatIsGroup: getters.isGroup,
    remainingQuantity: getters.remaining,
    getHaveMessageChat: getters.unreadChats,
    getCurrentGroupMembersExcludeSelf: getters.membersExcludeSelf,
    getOwnerId: ownerId,
    getChatById: computed(() => (id: string | number) => state.chatList.find(c => c.chatId === id) ?? null),
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
    handleDeleteMessage: (m: any) => { if (m?.messageContentType) delete m.messageContentType; },
    upsertChat: upsert,
    persistPreviewToDb: persist,
    buildPreviewFromMessage: buildPreview,
    fetchChatFromServer: (oId: string | number, toId: string | number) => exec(() => api.GetChat({ ownerId: oId, toId }), { op: "fetchChat" }) as Promise<Chats | null>,
    triggerNotification: triggerNotify,

    // 草稿
    setDraft, getDraft, clearDraft, hasDraft, saveDraftAsPreview: saveDraft,

    // 消息操作
    handleResetMessage: resetMessages,
    handleSendMessage: sendMessage,
    sendSingle: send,
    uploadAndSendFile: uploadAndSend,
    handleMoreMessage: loadMore,
    handleGetMessageList: getMessages,
    handleGetMessageCount: getMessageCount,
    handleCreateMessage: createMessage,
    handleInsertToDatabase: insertToDb,
    handleSendRecallMessage: recallMessage,
    handleReCallMessage: handleRecall,
    handleSearchMessageUrl: searchUrls,
    handleHistoryMessage: searchHistory,
    handleUpdateMessage: updateMessage,
    handleClearMessage: clearMessages,
    handleDeleteMessageFromList: deleteMessage,

    // 群组操作（委托给 groupStore）
    handleAddGroupMember: addGroupMember,
    updateGroupInfo: updateGroup,
    handleLeaveOrDismissGroup: leaveOrDismissGroup,
    getGroupStore,

    // 工具
    handleShowScreenshot: showScreenshot,
    handleShowRecord: showRecord,
    isSingleChat: isSingle,
    getMapperByType: mapper,
    getSendApiByChat: sendApi,
    buildFormPayload: buildPayload,
    toDbRecord: toRecord,
    normalizeMessageForUI: normalizeMsg,
    findMessageIndex: (id: string | number) => state.messageList.findIndex(m => m.messageId == id),
    chooseByIMessageType: (type: number) => ({ mapper: mapper(type), isSingle: type === MessageType.SINGLE_MESSAGE.code })
  };
}, {
  persist: [
    { key: `${StoresEnum.CHAT}_local`, paths: ["state.ignoreList"], storage: localStorage },
    { key: `${StoresEnum.CHAT}_session_chat`, paths: ["state.chatList", "state.currentChat"], storage: sessionStorage },
    { key: `${StoresEnum.CHAT}_session_message`, paths: ["state.messageList"], storage: sessionStorage }
  ],
  sync: { paths: ["state.chatList"], targetWindows: [StoresEnum.NOTIFY], sourceWindow: StoresEnum.MAIN }
});
