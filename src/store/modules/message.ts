import api from "@/api/index";
import { isTextType, MessageContentType, MessageType, StoresEnum } from "@/constants";
import { PageResult, useMappers } from "@/database";
import type Chats from "@/database/entity/Chats";
import { useChatInput } from "@/hooks/useChatInput";
import useCrypto from "@/hooks/useCrypto";
import { useIdleTaskExecutor } from "@/hooks/useIdleTaskExecutor";
import { IMessage, IMessageAction, IMessagePart, IMGroupMessage, IMSingleMessage, RecallMessageBody } from "@/models";
import { safeExecute } from "@/utils/ExceptionHandler";
import { storage } from "@/utils/Storage";
import { defineStore } from "pinia";
import { computed, reactive } from "vue";
import { useChatStore } from "./chat";
import { useGroupStore } from "./group";
import { useSearchStore } from "./search";
import { useUserStore } from "./user";

// ==================== 类型定义 ====================

interface MessageState {
  messageList: IMessage[];
  historyList: IMessage[];
  currentUrls: string[];
  loading: boolean;
  error: string | null;
}

// ==================== Store 定义 ====================

export const useMessageStore = defineStore(StoresEnum.MESSAGE, () => {
  // ==================== 依赖 ====================
  const { singleMessageMapper, groupMessageMapper } = useMappers();
  const userStore = useUserStore();
  const chatStore = useChatStore();
  const groupStore = useGroupStore();
  const searchStore = useSearchStore();
  const log = useLogger();
  const { buildMessagePreview } = useChatInput();
  const { addTask } = useIdleTaskExecutor({ maxWorkTimePerIdle: 12 });
  const { md5 } = useCrypto();

  // ==================== 状态 ====================
  const state = reactive<MessageState>({
    messageList: [],
    historyList: [],
    currentUrls: [],
    loading: false,
    error: null
  });

  const page = reactive({ num: 1, size: 20, total: 0 });

  // ==================== 核心工具 ====================
  const ownerId = computed(() => userStore.userId || storage.get("userId"));
  const isSingle = (chat: any) => chat?.chatType === MessageType.SINGLE_MESSAGE.code;
  const mapper = (type: number) => type === MessageType.SINGLE_MESSAGE.code ? singleMessageMapper : groupMessageMapper;
  const sendApi = (chat: any) => isSingle(chat) ? api.SendSingleMessage : api.SendGroupMessage;

  // ==================== 内部工具 ====================
  const exec = <T>(fn: () => Promise<T>, opts?: { op?: string; fallback?: T }) =>
    safeExecute(fn, { operation: opts?.op, fallback: opts?.fallback, silent: !opts?.op });

  const parseBody = (raw: unknown): Record<string, any> => {
    if (raw == null) return {};
    if (typeof raw === "object") return Array.isArray(raw) ? { parts: raw } : raw as Record<string, any>;
    if (typeof raw !== "string") return { text: String(raw) };
    try {
      const parsed = JSON.parse(raw.trim());
      return typeof parsed === "object" && parsed ? (Array.isArray(parsed) ? { parts: parsed } : parsed) : { text: String(parsed) };
    } catch { return { text: raw }; }
  };

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
   * 构建消息发送参数
   */
  const buildPayload = (content: any, chat: any, contentType: number, meta: any = {}) => {
    const messageBody = { ...content };
    if (meta.replyMessage) messageBody.replyMessage = meta.replyMessage;
    if (meta.mentionedUserIds?.length) messageBody.mentionedUserIds = [...new Set(meta.mentionedUserIds)];
    if (meta.mentionAll) messageBody.mentionAll = meta.mentionAll;

    return {
      fromId: ownerId.value,
      messageBody,
      messageTempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      messageTime: Date.now(),
      messageContentType: contentType,
      messageType: chat?.chatType,
      [isSingle(chat) ? "toId" : "groupId"]: chat?.toId || ""
    };
  };

  /**
   * 转换为记录
   */
  const toRecord = (msg: any) => {
    const r = { ...msg, ownerId: ownerId.value, messageBody: stringifyBody(msg?.messageBody) };
    delete r.messageTempId;
    return r;
  };

  // ==================== 消息操作 ====================
  const resetMessages = () => {
    state.messageList = [];
    state.historyList = [];
    state.currentUrls = [];
    Object.assign(page, { num: 1, total: 0 });
  };

  const FILE_CONTENT_TYPE: Record<string, number> = {
    image: MessageContentType.IMAGE.code,
    video: MessageContentType.VIDEO.code,
    file: MessageContentType.FILE.code,
  };

  const sendOnePart = async (part: IMessagePart, chat: Chats): Promise<void> => {
    if (part.type === "text") {
      const payload = buildPayload(
        { text: part.content },
        chat,
        MessageContentType.TEXT.code,
        {
          replyMessage: part.replyMessage,
          mentionedUserIds: part.mentionedUserIds ?? [],
          mentionAll: part.mentionAll,
        }
      );
      await exec(() => send(payload, chat), { op: "sendText" });
      return;
    }
    if (part.file && FILE_CONTENT_TYPE[part.type] != null) {
      await exec(
        () => uploadAndSend(part.file!, chat, FILE_CONTENT_TYPE[part.type], part.replyMessage),
        { op: "sendFile" }
      );
    }
  };

  const sendMessage = async (parts: IMessagePart[]) => {
    const chat = chatStore.currentChat;
    if (!parts?.length || !chat) return;
    await Promise.all(parts.map(p => sendOnePart(p, chat)));
  };

  /**
   * 发送消息到服务端，本地列表由 WebSocket 回包后 handleCreateMessage 写入
   */
  const send = async (payload: any, chat: Chats) => {
    return sendApi(chat)(payload);
  };

  const uploadAndSend = async (file: File, chat: Chats, contentType: number, replyMessage?: any) => {
    const md5Str = await md5(file);
    const formData = new FormData();
    formData.append("identifier", md5Str.toString());
    formData.append("file", file);

    const uploadRes: any =
      contentType === MessageContentType.IMAGE.code
        ? await api.uploadImage(formData)
        : await api.UploadFile(formData);

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const payload = buildPayload({ ...uploadRes, size: file.size, suffix: ext }, chat, contentType, { replyMessage });
    await send(payload, chat);
    return uploadRes;
  };

  const loadMore = () => {
    const chat = chatStore.currentChat;
    if (!chat) return;
    page.num++;
    getMessages(chat);
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
    const chat = chatStore.currentChat;
    if (!chat) return;
    page.total = await exec(() => mapper(chat.chatType).findMessageCount(chat.ownerId || chat.toId, chat.toId), { fallback: 0 }) || 0;
  };

  /**
   * 写入一条收到的消息：更新当前会话列表并落库
   */
  const createMessage = (targetId: string | number, message: any, messageType: number) => {
    if (String(targetId) === String(chatStore.currentChat?.toId)) {
      state.messageList.push(normalizeMsg(message, chatStore.currentChat!));
    }
    persistMessage(message, messageType);
  };

  /**
   * 将消息持久化到 DB 并更新 FTS（仅文本）
   */
  const persistMessage = (message: any, messageType: number) => {
    const record = toRecord(message);
    const m = mapper(messageType);
    addTask(() => {
      m.insert(record);
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
    if (result !== undefined) log.prettyDebug("消息已撤回", result);
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
    if (type === MessageType.SINGLE_MESSAGE.code) return chatStore.getCurrentName;
    if (type === MessageType.GROUP_MESSAGE.code) {
      const member = groupStore.getMembersExcludeSelf.find(m => m.userId === id);
      return member?.name || member?.userId;
    }
  };

  const searchUrls = async (msg: any) => {
    state.currentUrls = await exec(() => mapper(msg.messageType).findMessageUrl(msg.fromId || msg.groupId, msg.toId), { fallback: [] }) || [];
  };

  /**
   * 搜索当前会话的历史消息
   */
  const searchHistory = async (pageInfo: PageResult<any>, searchStr?: string | string[]): Promise<{ list: any[]; total: number }> => {
    const chat = chatStore.currentChat;
    if (!chat?.toId) return { list: [], total: 0 };

    const chatContext = {
      toId: chat.toId,
      chatType: chat.chatType,
      name: chat.name,
      avatar: chat.avatar
    };

    const memberMap = new Map(groupStore.getMembersExcludeSelf.map(m => [m.userId, m]));
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

  // ==================== 导出 ====================
  return {
    // 状态
    state, page,
    messageList: computed({ get: () => state.messageList, set: v => { state.messageList = v; } }),
    historyMessageList: computed({ get: () => state.historyList, set: v => { state.historyList = v; } }),
    currentUrls: computed({ get: () => state.currentUrls, set: v => { state.currentUrls = v; } }),
    loading: computed({ get: () => state.loading, set: v => { state.loading = v; } }),
    error: computed({ get: () => state.error, set: v => { state.error = v; } }),

    // 计算属性
    remainingQuantity: computed(() => Math.max(0, page.total - page.num * page.size)),
    getOwnerId: ownerId,

    // 状态管理
    setLoading: (v: boolean) => { state.loading = v; },
    setError: (e: string | null) => { state.error = e; if (e) log.error?.("[MessageStore]", e); },

    // 消息操作
    handleResetMessage: resetMessages,
    handleSendMessage: sendMessage,
    sendSingle: send,
    uploadAndSendFile: uploadAndSend,
    handleMoreMessage: loadMore,
    handleGetMessageList: getMessages,
    handleGetMessageCount: getMessageCount,
    handleCreateMessage: createMessage,
    handleInsertToDatabase: persistMessage,
    handleSendRecallMessage: recallMessage,
    handleReCallMessage: handleRecall,
    handleSearchMessageUrl: searchUrls,
    handleHistoryMessage: searchHistory,
    handleUpdateMessage: updateMessage,
    handleClearMessage: clearMessages,
    handleDeleteMessageFromList: deleteMessage,

    // 工具
    isSingleChat: isSingle,
    getMapperByType: mapper,
    getSendApiByChat: sendApi,
    buildFormPayload: buildPayload,
    toDbRecord: toRecord,
    normalizeMessageForUI: normalizeMsg,
    findMessageIndex: (id: string | number) => state.messageList.findIndex(m => m.messageId == id),
    chooseByIMessageType: (type: number) => ({ mapper: mapper(type), isSingle: type === MessageType.SINGLE_MESSAGE.code }),
    buildPreviewFromMessage: buildMessagePreview,
  };
}, {
  persist: [
    { key: `${StoresEnum.MESSAGE}_session_message`, paths: ["state.messageList"], storage: sessionStorage }
  ]
});
