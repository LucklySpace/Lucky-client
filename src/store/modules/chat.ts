/**
 * Chat and Message Store
 * 整合聊天和消息功能的响应式状态管理模块
 * 
 * 优化目标：
 * 1. 使用响应式写法替代组合式API
 * 2. 合并重复逻辑，提高代码复用性
 * 3. 保持代码简洁、高效、稳定、可靠
 * 4. 提供完整注释便于维护
 */

import { defineStore } from "pinia";
import { IMessageType, MessageContentType, StoresEnum } from "@/constants";
import api from "@/api/index";
import Chats from "@/database/entity/Chats";
import SingleMessage from "@/database/entity/SingleMessage";
import GroupMessage from "@/database/entity/GroupMessage";
import { QueryBuilder, FTSQueryBuilder, useMappers, PageResult } from "@/database";
import { useUserStore } from "./user";
import { appIsMinimizedOrHidden, ShowMainWindow } from "@/windows/main";
import { storage } from "@/utils/Storage";
import { useChatInput } from "@/hooks/useChatInput";
import { useIdleTaskExecutor } from "@/hooks/useIdleTaskExecutor";
import { IMessage, IMessagePart } from "@/models";
import { useSettingStore } from "./setting";
import { AudioEnum, useAudioPlayer } from "@/hooks/useAudioPlayer";
import { CreateScreenWindow } from "@/windows/screen";
import { CreateRecordWindow } from "@/windows/record";
import { highlightTextByTokens } from "@/utils/Strings";
import { Segmenter } from "@/database";
import { ref, computed, reactive } from "vue";

// 初始化数据库映射器
const { chatsMapper, singleMessageMapper, groupMessageMapper } = useMappers();

// 用户类型定义
type User = { userId: string; name: string; avatar?: string | null };

// 状态接口定义
interface ChatMessageState {
  // 聊天相关状态
  chatList: Chats[];
  currentChat: Chats | null;
  currentChatGroupMemberMap: any[];
  isShowDetail: boolean;
  ignoreAllList: string[];
  chatDraftMap: Record<string, any>;

  // 消息相关状态
  messageList: Array<IMessage>;
  historyMessageList: Array<IMessage>;
  messageNum: number;
  messageSize: number;
  groupInfo: Record<string, any>;
  currentUrls: string[];
  messageCount: number;

  // 通用状态
  loading: boolean;
  error: string | null;
}

/**
 * 聊天和消息整合Store
 * 合并了聊天和消息功能，避免重复逻辑，提高性能和可维护性
 */
export const useChatStore = defineStore(StoresEnum.CHAT, () => {
  // 初始化其他store和工具
  const userStore = useUserStore();
  const settingStore = useSettingStore();
  const logger = useLogger();
  const { buildMessagePreview, buildDraftMessagePreview, findChatIndex, removeMentionHighlightsFromHtml } = useChatInput();
  const { addTask } = useIdleTaskExecutor({ maxWorkTimePerIdle: 12 });
  const { play } = useAudioPlayer();

  // 状态定义
  const chatList = ref<Chats[]>([]);
  const currentChat = ref<Chats | null>(null);
  const currentChatGroupMemberMap = ref<any[]>([]);
  const isShowDetail = ref<boolean>(false);
  const ignoreAllList = ref<string[]>([]);
  const chatDraftMap = ref<Record<string, any>>({});

  const messageList = ref<Array<IMessage>>([]);
  const historyMessageList = ref<Array<IMessage>>([]);
  const messageNum = ref<number>(1);
  const messageSize = ref<number>(15);
  const groupInfo = ref<Record<string, any>>({});
  const currentUrls = ref<string[]>([]);
  const messageCount = ref<number>(0);

  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // Getters
  /** 当前会话名称 */
  const getCurrentName = computed(() => currentChat.value?.name || "");

  /** 根据ID获取会话 */
  const getChatById = computed(() => (id: string | number) => chatList.value.find((c: Chats) => c.chatId === id) ?? null);

  /** 当前会话类型 */
  const getCurrentType = computed(() => currentChat.value?.chatType);

  /** 全局未读消息数 */
  const getTotalUnread = computed(() => chatList.value.reduce((s, c) => (c.isMute === 0 ? s + (c.unread || 0) : s), 0));

  /** 是否显示详情按钮 */
  const getShowDetailBtn = computed(() => !!currentChat.value);

  /** 是否显示详情面板 */
  const getShowDetail = computed(() => isShowDetail.value);

  /** 有未读消息的会话列表 */
  const getHaveMessageChat = computed(() => chatList.value.filter(c => c.unread > 0));

  /** 当前会话是否为群聊 */
  const getChatIsGroup = computed(() => currentChat.value?.chatType === IMessageType.GROUP_MESSAGE.code);

  /** 当前用户ID */
  const getOwnerId = computed(() => userStore.userId || storage.get("userId"));

  /** 获取当前群成员（排除自己） */
  const getCurrentGroupMembersExcludeSelf = computed((): User[] => {
    const raw = currentChatGroupMemberMap.value;
    const me = userStore.userId || storage.get("userId");
    let arr: any[] = Array.isArray(raw) ? raw : typeof raw === "object" ? Object.values(raw) : [];
    const mapMember = (m: any): User | null => {
      if (m == null) return null;
      if (typeof m === "string" || typeof m === "number") return { userId: String(m), name: String(m), avatar: null };
      const id = m.userId ?? m.id ?? m.uid ?? m.user_id ?? null;
      if (id == null) return null;
      const name = m.name ?? m.nick ?? m.nickname ?? m.displayName ?? m.username ?? String(id);
      const avatar = m.avatar ?? m.avatarUrl ?? m.img ?? m.head ?? null;
      return { userId: String(id), name: String(name), avatar: avatar != null ? String(avatar) : null };
    };
    return arr.map(mapMember).filter((x): x is User => x != null && x.userId !== me);
  });

  // 消息相关Getters
  /** 剩余消息数量 */
  const remainingQuantity = computed(() => Math.max(0, messageCount.value - messageNum.value * messageSize.value));

  /* ==================== 通用方法 ==================== */

  /**
   * 设置加载状态
   * @param flag 加载状态
   */
  const setLoading = (flag: boolean) => {
    loading.value = !!flag;
  };

  /**
   * 设置错误信息
   * @param err 错误信息
   */
  const setError = (err: string | null) => {
    error.value = err;
    if (err) logger.error?.("[chat-message-store] error:", err);
  };

  /* ==================== 聊天相关方法 ==================== */

  /**
   * 初始化聊天列表
   */
  const handleInitChat = async () => {
    setLoading(true);
    try {
      if (chatList.value.length === 0) {
        const data = await chatsMapper.selectList();
        if (Array.isArray(data) && data.length > 0) chatList.value = data;
      }
      setError(null);
    } catch (e: any) {
      setError(e?.message || "初始化会话列表失败");
    } finally {
      setLoading(false);
    }
  };

  /**
   * 切换当前会话
   * @param chatOrId 会话对象或会话ID
   */
  const handleChangeCurrentChat = async (chatOrId: Chats | string | number): Promise<void> => {
    saveDraftAsPreview();
    if (!chatOrId) {
      currentChat.value = null;
      return;
    }

    let chat: Chats | null = null;
    let idx =
      typeof chatOrId === "object"
        ? findChatIndex(chatList.value, (chatOrId as Chats).chatId)
        : findChatIndex(chatList.value, chatOrId as string | number);

    if (idx === -1) {
      // 内存中没有：如果传入了对象则把对象 upsert 到内存并置为 current
      if (typeof chatOrId === "object") {
        const newIdx = upsertChat(chatOrId as Chats);
        chat = chatList.value[newIdx];
      } else {
        // 传入 id 但内存中没有：标记错误并返回
        currentChat.value = null;
        setError("会话不存在");
        return;
      }
    } else {
      // 内存中有：尝试从本地 DB 拉取最新数据并去掉 mention 高亮
      chat = chatList.value[idx];
      try {
        const dbChat: Chats | null = await chatsMapper.selectById(chat.chatId);
        if (dbChat) {
          chat.message = removeMentionHighlightsFromHtml(dbChat.message, { returnPlainText: true });
        }
      } catch (e) {
        logger.warn("[chat-message-store] removeMentionHighlights failed", e);
      }

      // 若是群聊：从服务端获取群成员并缓存（用于 name 映射等）
      if (getChatIsGroup.value) {
        const res: any = await api.GetGroupMember({ groupId: chat.toId });
        currentChatGroupMemberMap.value = res || {};
      }
      handleSortChatList();
    }

    currentChat.value = chat;
    // 切换会话时重置消息状态
    handleResetMessage();
  };

  /**
   * 通过目标信息创建/切换会话
   * @param targetInfo 目标信息（好友或群组）
   * @param chatType 会话类型
   */
  const handleChangeCurrentChatByTarget = async (targetInfo: { [key: string]: string | number }, chatType: number) => {
    const fromId = getOwnerId.value;
    const targetId = (targetInfo as any).friendId ?? (targetInfo as any).groupId;
    const existingIdx = chatList.value.findIndex(c => c.toId === targetId && c.chatType === chatType);
    if (existingIdx !== -1) {
      await handleUpdateReadStatus(chatList.value[existingIdx], 0);
      currentChat.value = chatList.value[existingIdx];
      return;
    }

    try {
      setLoading(true);
      const res = (await api.CreateChat({ fromId, toId: targetId, chatType })) as Chats;
      if (!res) throw new Error("创建会话失败");
      handleUpdateChatWithMessage(res);
      upsertChat(res);
      handleSortChatList();
      currentChat.value = res;
      setError(null);
    } catch (e: any) {
      setError(e?.message || "创建会话失败");
    } finally {
      setLoading(false);
    }
  };

  /**
   * 更新会话未读状态
   * @param chat 会话对象
   * @param unread 未读数
   */
  const handleUpdateReadStatus = async (chat: Chats, unread: number = 0): Promise<void> => {
    if (!chat) return;
    const idx = findChatIndex(chatList.value, chat.chatId);
    if (idx === -1) {
      setError("会话未找到");
      return;
    }
    chatList.value[idx].unread = unread;
    addTask(() =>
      chatsMapper
        .updateById(chat.chatId, { unread } as Chats)
        .catch(e => logger.error("[chat-message-store] update unread fail", e))
    );
  };

  /**
   * 创建或更新会话
   * @param message 消息对象
   * @param id 会话ID
   */
  const handleCreateOrUpdateChat = async (message: IMessage | undefined, id: string | number) => {
    const ownerId = getOwnerId.value;
    const qb = new QueryBuilder<Chats>().select().and(q => q.eq("ownerId", ownerId).eq("toId", id));

    try {
      setLoading(true);
      let chat: Chats | null = null;

      // 1) 本地 DB 查询
      const chats: Chats[] | null = await chatsMapper.selectList(qb);
      if (Array.isArray(chats) && chats.length > 0) {
        chat = chats[0];

        if (message?.fromId != getOwnerId.value) {
          triggerNotification(chat, message);
        }

        const idx = findChatIndex(chatList.value, chat.chatId);
        if (idx !== -1) {
          // 内存已有 -> 更新内存对象
          handleUpdateChatWithMessage(chatList.value[idx], message);
        } else {
          // 内存无 -> 使用 DB 数据作为基础，标记为新并插入内存
          handleUpdateChatWithMessage(chat, message, true);
          upsertChat(chat);
        }
      } else {
        // 2) 本地 DB 没有 -> 尝试从服务端拉取会话信息
        chat = await fetchChatFromServer(ownerId, id);
        if (chat) {
          handleUpdateChatWithMessage(chat, message, true);
          upsertChat(chat);
        }
      }

      if (chat) handleSortChatList();
      setError(null);
    } catch (err: any) {
      setError(err?.message || "创建或更新会话失败");
      logger.error("[chat-message-store] handleCreateOrUpdateChat error", err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 根据消息更新会话信息
   * @param chat 会话对象
   * @param message 消息对象
   * @param isNew 是否为新会话
   */
  const handleUpdateChatWithMessage = (chat: Chats, message?: IMessage, isNew: boolean = false) => {
    if (!chat) return;
    try {
      if (message) {
        const preview = buildPreviewFromMessage(message, true);
        if (preview) {
          const isCurrent = String(chat.toId) === String(currentChat.value?.toId);
          if (!isCurrent && !isNew) {
            // 不是当前会话且不是新会话：增加未读并设置 HTML preview（包含高亮）
            chat.unread = (chat.unread || 0) + 1;
            chat.message = preview.html;
          } else {
            // 当前会话：显示纯文本 preview
            chat.message = preview.plainText;
          }
          chat.messageTime = message.messageTime || Date.now();
          chat.sequence = message.messageTime || Date.now();
          // 持久化 preview（将 original 或 plainText 写入 DB），通过空闲任务执行
          persistPreviewToDb({ ...chat, message: preview.originalText || preview.plainText });
        } else {
          // 无 preview 的兜底
          chat.message = "";
          chat.messageTime = message.messageTime || Date.now();
          chat.sequence = message.messageTime || Date.now();
          persistPreviewToDb({ ...chat, message: "" });
        }
      } else {
        // message 未提供 -> 清空 preview 与未读
        chat.message = "";
        chat.messageTime = Date.now();
        chat.sequence = Date.now();
        chat.unread = 0;
        persistPreviewToDb({ ...chat, message: "" });
      }
    } catch (e: any) {
      logger.error("[chat-message-store] handleUpdateChatWithMessage error", e);
    }
  };

  /**
   * 删除会话
   * @param chat 会话对象
   */
  const handleDeleteChat = async (chat: Chats) => {
    if (!chat) return;
    const idx = findChatIndex(chatList.value, chat.chatId);
    if (idx !== -1) {
      addTask(async () => {
        await chatsMapper.deleteById(chat.chatId);
        await chatsMapper.deleteFTSById(chat.chatId);
      });
      chatList.value.splice(idx, 1);
    }
    if (currentChat.value?.chatId === chat.chatId) currentChat.value = null;
  };

  /**
   * 删除消息敏感字段
   * @param message 消息对象
   */
  const handleDeleteMessage = (message: SingleMessage | GroupMessage) => {
    if (message && (message as any).messageContentType) delete (message as any).messageContentType;
  };

  /**
   * 置顶会话
   * @param chat 会话对象
   */
  const handlePinChat = async (chat: Chats) => {
    if (!chat) return;
    const idx = findChatIndex(chatList.value, chat.chatId);
    if (idx === -1) return;
    try {
      const newTop = (chatList.value[idx].isTop || 0) === 1 ? 0 : 1;
      chatList.value[idx].isTop = newTop;
      await chatsMapper.updateById(chat.chatId, { isTop: newTop } as Chats);
      handleSortChatList();
    } catch (e: any) {
      setError(e?.message || "更新置顶状态失败");
      throw e;
    }
  };

  /**
   * 设置会话免打扰
   * @param chat 会话对象
   */
  const handleMuteChat = async (chat: Chats) => {
    if (!chat) return;
    const idx = findChatIndex(chatList.value, chat.chatId);
    if (idx === -1) return;
    try {
      const newMute = (chatList.value[idx].isMute || 0) === 1 ? 0 : 1;
      chatList.value[idx].isMute = newMute;
      await chatsMapper.updateById(chat.chatId, { isMute: newMute } as Chats);
      handleSortChatList();
    } catch (e: any) {
      setError(e?.message || "更新免打扰失败");
      throw e;
    }
  };

  /**
   * 会话列表排序
   * @param customList 自定义会话列表
   */
  const handleSortChatList = (customList?: Chats[]) => {
    const list = customList || chatList.value;
    chatList.value = [...list].sort((a, b) => {
      const topDiff = (b.isTop || 0) - (a.isTop || 0);
      return topDiff !== 0 ? topDiff : (b.messageTime || 0) - (a.messageTime || 0);
    });
  };

  /**
   * 忽略所有未读会话
   */
  const handleIgnoreAll = () => {
    getHaveMessageChat.value.forEach(item => {
      const id = String(item.chatId);
      if (!ignoreAllList.value.includes(id)) ignoreAllList.value.push(id);
    });
    logger.info("[chat-message-store] ignore all messages");
  };

  /**
   * 跳转到指定会话
   */
  const handleJumpToChat = async () => {
    if (currentChat.value) {
      try {
        ShowMainWindow();
      } catch (e) {
        logger.warn("[chat-message-store] open main window fail", e);
      }
    }
  };

  /**
   * 根据ID获取会话
   * @param id 会话ID
   */
  const handleGetChat = (id: any): Chats | undefined => {
    return chatList.value.find(c => c.id === id);
  };

  /**
   * 保存草稿为预览
   */
  const saveDraftAsPreview = async () => {
    const chatId = currentChat.value?.chatId;
    if (!chatId) return;

    const draftHtml = getDraft(chatId);
    if (!draftHtml) return;

    const preview = buildDraftMessagePreview(String(chatId), draftHtml);
    if (preview) {
      const stub: Partial<any> = { chatId, message: preview, messageTime: Date.now() };
      upsertChat(stub as any);
    }
  };

  /**
   * 设置草稿
   * @param chatId 会话ID
   * @param html 草稿内容
   */
  const setDraft = (chatId: string | number, html: string) => {
    if (!chatId) return;
    const id = String(chatId);
    if (!chatDraftMap.value) chatDraftMap.value = {};
    chatDraftMap.value[id] = html ?? "";
  };

  /**
   * 获取草稿
   * @param chatId 会话ID
   */
  const getDraft = (chatId: string | number) => {
    if (!chatId) return "";
    return (chatDraftMap.value || {})[String(chatId)] || undefined;
  };

  /**
   * 清除草稿
   * @param chatId 会话ID
   */
  const clearDraft = (chatId: string | number) => {
    if (!chatId) return;
    const id = String(chatId);
    if (chatDraftMap.value && id in chatDraftMap.value) delete chatDraftMap.value[id];
  };

  /**
   * 切换详情面板显示
   */
  const handleChatDetail = () => {
    isShowDetail.value = !isShowDetail.value;
  };

  /**
   * Upsert会话到内存列表
   * @param chat 会话对象
   */
  const upsertChat = (chat: Partial<Chats> & { chatId?: any }): number => {
    if (!chat || chat.chatId == null) return -1;
    const idx = findChatIndex(chatList.value, chat.chatId);
    if (idx !== -1) {
      chatList.value[idx] = { ...chatList.value[idx], ...chat };
      return idx;
    }
    chatList.value.push(chat as Chats);
    return chatList.value.length - 1;
  };

  /**
   * 持久化预览到数据库
   * @param chatObj 会话对象
   */
  const persistPreviewToDb = (chatObj: Partial<Chats>) => {
    if (!chatObj || !chatObj.chatId) return;
    addTask(() => {
      chatsMapper.insertOrUpdate(chatObj).catch(err => logger.warn("[chat-message-store] persist preview fail", err));
      chatsMapper.insertOrUpdateFTS(chatObj);
    });
  };

  /**
   * 根据消息构建预览
   * @param message 消息对象
   * @param asHtml 是否返回HTML
   */
  const buildPreviewFromMessage = (message?: IMessage, asHtml = true) => {
    if (!message) return null;
    try {
      return buildMessagePreview(message, {
        currentUserId: getOwnerId.value,
        highlightClass: "mention-highlight",
        asHtml
      });
    } catch (e) {
      logger.warn("[chat-message-store] buildMessagePreview failed", e);
      return null;
    }
  };

  /**
   * 从服务端获取会话信息
   * @param ownerId 用户ID
   * @param toId 目标ID
   */
  const fetchChatFromServer = async (ownerId: string | number, toId: string | number) => {
    try {
      const res = (await api.GetChat({ ownerId, toId })) as Chats;
      if (!res) throw new Error("拉取会话信息失败");
      return res;
    } catch (err: any) {
      logger.warn("[chat-message-store] GetChat failed", err);
      setError(err?.message || "拉取会话信息失败");
      return null;
    }
  };

  /**
   * 触发通知
   * @param chat 会话对象
   * @param message 消息对象
   */
  const triggerNotification = async (chat: Chats, message?: IMessage) => {
    if (settingStore.notification.message && chat.isMute === 0 && message) {
      play(AudioEnum.MESSAGE_ALERT);
    }
  };

  /* ==================== 消息相关方法 ==================== */

  /**
   * 重置消息状态
   */
  const handleResetMessage = () => {
    messageList.value = [];
    historyMessageList.value = [];
    messageNum.value = 1;
    messageCount.value = 0;
    currentUrls.value = [];
    groupInfo.value = {};
  };

  /**
   * 发送消息
   * @param messageParts 消息部分列表
   */
  const handleSendMessage = async (messageParts: IMessagePart[]) => {
    if (!messageParts?.length) return;
    const currentChatValue = currentChat.value;
    if (!currentChatValue) return logger.warn("No current chat, cannot send message");

    const fileMsgs = messageParts.filter(m => ["image", "video", "file"].includes(m.type));
    const textMsgs = messageParts.filter(m => m.type === "text");

    // 并行处理文件上传和发送（提升性能，原为串行）
    await Promise.all(
      fileMsgs.map(async m => {
        if (!m.file) return logger.warn("File message missing file", m);
        const contentType =
          m.type === "image"
            ? MessageContentType.IMAGE.code
            : m.type === "video"
              ? MessageContentType.VIDEO.code
              : MessageContentType.FILE.code;
        await uploadAndSendFile(m.file, currentChatValue, contentType).catch(e =>
          setError(e?.message || "File send failed")
        );
      })
    );

    // 并行处理文本发送
    await Promise.all(
      textMsgs.map(async m => {
        const form = handleCreateMessageContext({ text: m.content }, currentChatValue, MessageContentType.TEXT.code, {
          mentionedUserIds: Array.isArray(m.mentionedUserIds) ? m.mentionedUserIds : [],
          mentionAll: !!m.mentionAll,
          replyMessage: m.replyMessage
        });
        const apiFn = getSendApiByChat(currentChatValue);
        await sendSingle(form, currentChatValue, apiFn).catch(e => setError(e?.message || "Text send failed"));
      })
    );
  };

  /**
   * 发送单条消息
   * @param formData 表单数据
   * @param currentChat 当前会话
   * @param sendFn 发送函数
   */
  const sendSingle = async (formData: any, currentChat: any, sendFn: Function) => {
    const res = await sendFn(formData);
    handleCreateMessage(currentChat.toId, res, currentChat.chatType, true);
    return res;
  };

  /**
   * 上传并发送文件
   * @param file 文件对象
   * @param currentChat 当前会话
   * @param contentType 内容类型
   */
  const uploadAndSendFile = async (file: File, currentChat: any, contentType: number) => {
    if (!file || !currentChat) throw new Error("Invalid params for uploadAndSendFile");

    const formData = new FormData();
    formData.append("file", file);

    const uploadRes: any = await api.UploadFile(formData);
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    const form = handleCreateMessageContext(
      { ...uploadRes, size: file.size, suffix: ext },
      currentChat,
      contentType
    );

    const apiFn = getSendApiByChat(currentChat);
    await sendSingle(form, currentChat, apiFn);

    return uploadRes;
  };

  /**
   * 创建消息上下文
   * @param content 内容
   * @param chat 会话
   * @param messageContentType 消息内容类型
   * @param meta 元数据
   */
  const handleCreateMessageContext = (content: any, chat: any, messageContentType: number, meta: any = {}) => {
    return buildFormPayload(content, chat, messageContentType, meta);
  };

  /**
   * 加载更多消息
   */
  const handleMoreMessage = (): void => {
    if (!currentChat.value) return;
    messageNum.value++;
    handleGetMessageList(currentChat.value);
  };

  /**
   * 获取消息列表
   * @param chat 会话对象
   */
  const handleGetMessageList = async (chat: any) => {
    if (!chat) return;
    if (messageCount.value === 0) await handleGetMessageCount();

    const ownId = getOwnerId.value;
    const offset = (messageNum.value - 1) * messageSize.value;
    const isSingle = isSingleChat(chat);
    currentChatGroupMemberMap.value = currentChatGroupMemberMap.value || [];

    const mapper = isSingle ? singleMessageMapper : groupMessageMapper;
    const messages = await mapper.findMessage(ownId, chat.toId, offset, messageSize.value);

    const userInfo = userStore.userInfo;
    const normalized = messages.map((msg: any) => normalizeMessageForUI(msg, ownId, userInfo, chat));
    messageList.value = [...normalized, ...messageList.value];
  };

  /**
   * 获取消息总数
   */
  const handleGetMessageCount = async () => {
    const chat = currentChat.value;
    if (!chat) return;
    const mapper = chat.chatType === IMessageType.SINGLE_MESSAGE.code ? singleMessageMapper : groupMessageMapper;
    messageCount.value = await mapper.findMessageCount(chat.ownerId || chat.toId, chat.toId);
  };

  /**
   * 创建消息
   * @param id 会话ID
   * @param message 消息对象
   * @param messageType 消息类型
   * @param isSender 是否为发送者
   */
  const handleCreateMessage = (id: string | number, message: any, messageType: number, isSender: boolean = false) => {
    const currentChatValue = currentChat.value;

    const ownId = getOwnerId.value;
    const userInfo = userStore.userInfo;
    messageList.value.push(normalizeMessageForUI(message, ownId, userInfo, currentChatValue));

    if (isSender) handleCreateOrUpdateChat(message, currentChatValue?.toId as any);

    handleInsertToDatabase(message, messageType);
  };

  /**
   * 插入消息到数据库
   * @param message 消息对象
   * @param messageType 消息类型
   */
  const handleInsertToDatabase = async (message: any, messageType: number) => {
    const record = toDbRecord(message);
    const mapper = getMapperByType(messageType);
    addTask(() => {
      mapper.insert(record);
      const text = message.messageBody?.text;
      if (text) mapper.insertOrUpdateFTS({ ...record, messageBody: text });
    });
  };

  /**
   * 发送撤回消息
   * @param message 消息对象
   * @param opts 选项
   */
  const handleSendRecallMessage = async (message: any, opts: { reason?: string; recallTime?: number } = {}) => {
    if (!message?.messageId) return { ok: false, msg: "invalid message" };

    const ownerId = getOwnerId.value;
    const msgId = String(message.messageId);
    const messageType = Number(message.messageType ?? IMessageType.SINGLE_MESSAGE.code);
    const messageContentType = Number(message.messageContentType ?? MessageContentType.TEXT.code);
    const recallTime = opts.recallTime ?? Date.now();
    const reason = opts.reason ?? "已撤回";

    const payload = {
      actionType: 1,
      operatorId: ownerId,
      recallTime,
      reason,
      fromId: ownerId,
      messageTempId: message.messageTempId ?? "",
      messageId: msgId,
      messageContentType,
      messageTime: message.messageTime ?? Date.now(),
      messageType,
      messageBody: {}
    };

    try {
      await api.RecallMessage(payload);
      logger.info(`[handleSendRecallMessage] recall success messageId=${msgId}`);
      await handleReCallMessage(payload);
      return { ok: true };
    } catch (err) {
      const msg = (err as any)?.message ?? "撤回消息失败";
      logger.error("[handleSendRecallMessage] recall failed:", err);
      setError(msg);
      return { ok: false, error: err, msg };
    }
  };

  /**
   * 处理撤回消息
   * @param data 数据
   */
  const handleReCallMessage = async (data: any) => {
    if (!data?.messageId) return setError("handleReCallMessage: invalid payload");

    const messageId = String(data.messageId);
    const messageType = Number(data.messageType ?? IMessageType.SINGLE_MESSAGE.code);
    const operatorId = data.operatorId ?? data.fromId ?? "";
    const recallTime = data.recallTime ?? Date.now();
    const reason = data.reason ?? "";

    const { mapper } = chooseByIMessageType(messageType);

    const recallPayload = {
      _recalled: true,
      operatorId,
      recallTime,
      reason,
      text: "已撤回一条消息"
    };

    const idx = messageList.value.findIndex((m: any) => String(m.messageId) === messageId);
    if (idx !== -1) {
      const old = messageList.value[idx];
      messageList.value[idx] = {
        ...old,
        messageBody: recallPayload,
        messageContentType: MessageContentType.TIP?.code ?? 99
      };
    }

    addTask(async () => {
      if (!mapper) return logger.warn("[handleReCallMessage] no mapper, skip db update for messageId=" + messageId);
      const up = {
        messageBody: JSON.stringify(recallPayload),
        messageContentType: MessageContentType.TIP?.code ?? 99,
        updateTime: Date.now()
      };
      await mapper.updateById(messageId, up);
      await mapper.deleteFTSById(messageId);
      logger.info("[handleReCallMessage] db updated messageId=" + messageId);
    });
  };

  /**
   * 搜索消息URL
   * @param msg 消息对象
   */
  const handleSearchMessageUrl = async (msg: any): Promise<void> => {
    const mapper = msg.messageType === IMessageType.SINGLE_MESSAGE.code ? singleMessageMapper : groupMessageMapper;
    currentUrls.value = await mapper.findMessageUrl(msg.fromId || msg.groupId, msg.toId);
  };

  /**
   * 删除消息
   * @param message 消息对象
   */
  const handleDeleteMessageFromList = async (message: any) => {
    const idx = messageList.value.findIndex(item => item.messageId === message.messageId);
    if (idx !== -1) messageList.value.splice(idx, 1);

    const mapper = getMapperByType(message.messageType);
    addTask(async () => {
      await mapper.deleteById(message.messageId);
      await mapper.deleteFTSById(message.messageId);
    });
  };

  /**
   * 添加群成员
   * @param membersList 成员列表
   * @param isInvite 是否为邀请
   */
  const handleAddGroupMember = async (membersList: string[], isInvite: boolean = false) => {
    if (!membersList?.length) return logger.warn("Members list is empty.");
    const currentChatValue = currentChat.value;

    await api
      .InviteGroupMember({
        groupId: currentChatValue?.id ?? "",
        userId: storage.get("userId") || "",
        memberIds: membersList,
        type: isInvite ? IMessageType.GROUP_INVITE.code : IMessageType.CREATE_GROUP.code
      })
      .catch(e => setError(e?.message || "Error adding group members"));
  };

  /**
   * 批准群邀请
   * @param inviteInfo 邀请信息
   */
  const handleApproveGroupInvite = async (inviteInfo: any) => {
    await api
      .ApproveGroup({
        requestId: inviteInfo.requestId,
        groupId: inviteInfo.groupId ?? "",
        userId: storage.get("userId") || "",
        inviterId: inviteInfo.inviterId,
        approveStatus: inviteInfo.approveStatus
      })
      .catch(e => setError(e?.message || "Error approving group invite"));
  };

  /**
   * 更新消息
   * @param message 消息对象
   * @param update 更新内容
   */
  const handleUpdateMessage = (message: any, update: any) => {
    const mapper = getMapperByType(message.messageType);
    mapper.updateById(message.messageId, update as any);

    const idx = findMessageIndex(message.messageId);
    if (idx !== -1) messageList.value[idx] = { ...messageList.value[idx], ...update };
  };

  /**
   * 清空消息
   * @param chat 会话对象
   */
  const handleClearMessage = async (chat: Chats) => {
    if (chat.chatType !== IMessageType.SINGLE_MESSAGE.code) {
      await groupMessageMapper.clearChatHistory(chat.id, getOwnerId.value);
      handleResetMessage();
      await handleGetMessageList(chat);
      return;
    }

    await singleMessageMapper.deleteByFormIdAndToId(chat.id, getOwnerId.value);
    await singleMessageMapper.deleteByFormIdAndToIdVirtual(getOwnerId.value, chat.id);
    handleResetMessage();
    await handleGetMessageList(chat);
  };

  /**
   * 显示截图窗口
   */
  const handleShowScreenshot = () => {
    CreateScreenWindow(screen.availWidth, screen.availHeight);
  };

  /**
   * 显示录音窗口
   */
  const handleShowRecord = () => {
    CreateRecordWindow(screen.availWidth, screen.availHeight);
  };

  /**
   * 获取历史消息
   * @param pageInfo 分页信息
   * @param searchStr 搜索字符串
   */
  const handleHistoryMessage = async (
    pageInfo: PageResult<any>,
    searchStr?: string | string[]
  ): Promise<{ list: any[]; total: number }> => {
    try {
      const currentChatValue = currentChat.value;
      if (!currentChatValue?.id) return { list: [], total: 0 };

      const ownId = getOwnerId.value;
      const toId = currentChatValue.id;
      if (!ownId || !toId) return { list: [], total: 0 };

      const isSingle = currentChatValue.chatType === IMessageType.SINGLE_MESSAGE.code;
      const searchMapper = isSingle ? singleMessageMapper : groupMessageMapper;
      if (!searchMapper) return { list: [], total: 0 };

      const qb = new FTSQueryBuilder<any>();
      const params: (string | number)[] = isSingle ? [ownId, toId, toId, ownId] : [ownId, toId];
      qb.raw(
        isSingle ? "((fromId = ? AND toId = ?) OR (fromId = ? AND toId = ?))" : "ownerId = ? AND groupId = ?",
        ...params
      ).orderByAsc("sequence");

      let tokens: string[] = [];
      if (Array.isArray(searchStr)) {
        tokens = searchStr.map(String);
      } else if (typeof searchStr === "string" && searchStr.trim()) {
        if (searchStr.includes(" ")) {
          tokens = searchStr.trim().split(/\s+/);
        } else {
          try {
            tokens = await Segmenter.segment(searchStr);
          } catch {
            tokens = /[\p{Script=Han}]/u.test(searchStr)
              ? Array.from(searchStr)
              : searchStr.split(/\s+/).filter(Boolean);
          }
        }
      }

      tokens = tokens.map(t => t.trim().replace(/["']/g, "")).filter(Boolean);

      if (tokens.length > 0) {
        const matchExpr = tokens.join(" ");
        qb.setMatchColumn("messageBody")
          .matchKeyword(matchExpr, "and")
          .addSnippetSelect("excerpt", "snippet({table}, 0, '<b>', '</b>', '...', 10)")
          .setRankingExpr("bm25({table})", "DESC");
      } else {
        qb.isNotNull("messageBody");
      }

      const fts5RawPage = await searchMapper.searchFTS5Page(qb, pageInfo.page, pageInfo.size);
      const ids = fts5RawPage.records?.map((i: any) => i.messageId).filter(Boolean) ?? [];
      if (!ids.length) return { list: [], total: fts5RawPage.total ?? 0 };

      const rawPage = await searchMapper.selectByIds(ids, "messageTime", "desc");
      const records = Array.isArray(rawPage) ? rawPage : [];
      if (!records.length) return { list: [], total: fts5RawPage.total ?? 0 };

      const memberLookup = new Map((getCurrentGroupMembersExcludeSelf.value ?? []).map(m => [m.userId, m]));
      const userInfo = userStore.userInfo ?? {};

      const formatted = records
        .map(item => {
          if (!item) return null;
          let body: any;
          try {
            body = typeof item.messageBody === "string" ? JSON.parse(item.messageBody) : item.messageBody;
          } catch {
            body = { text: String(item.messageBody ?? "") };
          }

          if (tokens.length > 0 && body?.text) {
            body.text = highlightTextByTokens(body.text, tokens);
          }

          const isOwner = ownId === item.fromId;
          const member = isSingle ? null : memberLookup.get(item.fromId);
          const name = isOwner ? userInfo.name : isSingle ? currentChatValue.name : member?.name ?? "未知";
          const avatar = isOwner ? userInfo.avatar : isSingle ? currentChatValue.avatar : member?.avatar ?? "";

          return { ...item, messageBody: body, name, avatar, isOwner };
        })
        .filter(Boolean);

      return { list: formatted, total: fts5RawPage.total ?? 0 };
    } catch (err) {
      logger.error(`handleHistoryMessage error: ${(err as any)?.message ?? err}`);
      return { list: [], total: 0 };
    }
  };

  /* ==================== 内部辅助方法 ==================== */

  /**
   * 判断是否为单聊
   * @param chat 会话对象
   */
  const isSingleChat = (chat: any): boolean => {
    return chat?.chatType === IMessageType.SINGLE_MESSAGE.code;
  };

  /**
   * 根据消息类型获取映射器
   * @param messageType 消息类型
   */
  const getMapperByType = (messageType: number) => {
    return messageType === IMessageType.SINGLE_MESSAGE.code ? singleMessageMapper : groupMessageMapper;
  };

  /**
   * 根据会话获取发送API
   * @param chat 会话对象
   */
  const getSendApiByChat = (chat: any) => {
    return chat.chatType === IMessageType.SINGLE_MESSAGE.code ? api.SendSingleMessage : api.SendGroupMessage;
  };

  /**
   * 构建表单载荷
   * @param content 内容
   * @param chat 会话
   * @param messageContentType 消息内容类型
   * @param meta 元数据
   */
  const buildFormPayload = (content: any, chat: any, messageContentType: number, meta: any = {}) => {
    const chatType = chat?.chatType;
    const toKey = chatType === IMessageType.SINGLE_MESSAGE.code ? "toId" : "groupId";
    const payload: any = {
      fromId: getOwnerId.value,
      messageBody: content,
      messageTempId: `${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      messageTime: Date.now(),
      messageContentType,
      messageType: chatType,
      [toKey]: chat?.id || ""
    };

    if (Array.isArray(meta.mentionedUserIds) && meta.mentionedUserIds.length) {
      payload.mentionedUserIds = [...new Set(meta.mentionedUserIds)];
    }
    if (typeof meta.mentionAll === "boolean") payload.mentionAll = meta.mentionAll;
    if (meta.replyMessage && typeof meta.replyMessage === "object") payload.replyMessage = meta.replyMessage;

    return payload;
  };

  /**
   * 转换为数据库记录
   * @param message 消息对象
   */
  const toDbRecord = (message: any) => {
    const record = { ...message, ownerId: getOwnerId.value, messageBody: JSON.stringify(message.messageBody) };
    delete record.messageTempId;
    return record;
  };

  /**
   * 标准化消息用于UI显示
   * @param msg 消息对象
   * @param ownId 用户ID
   * @param userInfo 用户信息
   * @param chat 会话对象
   */
  const normalizeMessageForUI = (msg: any, ownId: string, userInfo: any, chat: any) => {
    const body = typeof msg.messageBody === "string" ? JSON.parse(msg.messageBody) : msg.messageBody;
    const isOwner = ownId === msg.fromId;
    const name = isOwner ? userInfo.name : currentChatGroupMemberMap.value[msg.fromId]?.name || chat.name;
    const avatar = isOwner ? userInfo.avatar : currentChatGroupMemberMap.value[msg.fromId]?.avatar || chat.avatar;
    return { ...msg, messageBody: body, name, avatar, isOwner };
  };

  /**
   * 查找消息索引
   * @param messageId 消息ID
   */
  const findMessageIndex = (messageId: string | number) => {
    return messageList.value.findIndex(item => item.messageId == messageId);
  };

  /**
   * 根据消息类型选择映射器
   * @param messageType 消息类型
   */
  const chooseByIMessageType = (messageType: number) => {
    return {
      mapper: messageType === IMessageType.SINGLE_MESSAGE.code ? singleMessageMapper : groupMessageMapper,
      isSingle: messageType === IMessageType.SINGLE_MESSAGE.code
    };
  };

  return {
    // 状态
    chatList,
    currentChat,
    currentChatGroupMemberMap,
    isShowDetail,
    ignoreAllList,
    chatDraftMap,
    messageList,
    historyMessageList,
    messageNum,
    messageSize,
    groupInfo,
    currentUrls,
    messageCount,
    loading,
    error,

    // Getters
    getCurrentName,
    getChatById,
    getCurrentType,
    getTotalUnread,
    getShowDetailBtn,
    getShowDetail,
    getHaveMessageChat,
    getChatIsGroup,
    getOwnerId,
    getCurrentGroupMembersExcludeSelf,
    remainingQuantity,

    // Actions
    setLoading,
    setError,
    handleInitChat,
    handleChangeCurrentChat,
    handleChangeCurrentChatByTarget,
    handleUpdateReadStatus,
    handleCreateOrUpdateChat,
    handleUpdateChatWithMessage,
    handleDeleteChat,
    handleDeleteMessage,
    handlePinChat,
    handleMuteChat,
    handleSortChatList,
    handleIgnoreAll,
    handleJumpToChat,
    handleGetChat,
    saveDraftAsPreview,
    setDraft,
    getDraft,
    clearDraft,
    handleChatDetail,
    upsertChat,
    persistPreviewToDb,
    buildPreviewFromMessage,
    fetchChatFromServer,
    triggerNotification,
    handleResetMessage,
    handleSendMessage,
    sendSingle,
    uploadAndSendFile,
    handleCreateMessageContext,
    handleMoreMessage,
    handleGetMessageList,
    handleGetMessageCount,
    handleCreateMessage,
    handleInsertToDatabase,
    handleSendRecallMessage,
    handleReCallMessage,
    handleSearchMessageUrl,
    handleDeleteMessageFromList,
    handleAddGroupMember,
    handleApproveGroupInvite,
    handleUpdateMessage,
    handleClearMessage,
    handleShowScreenshot,
    handleShowRecord,
    handleHistoryMessage,
    isSingleChat,
    getMapperByType,
    getSendApiByChat,
    buildFormPayload,
    toDbRecord,
    normalizeMessageForUI,
    findMessageIndex,
    chooseByIMessageType
  };
}, {
  persist: [
    // 聊天相关持久化
    {
      key: `${StoresEnum.CHAT}_local`,
      paths: ["chatDraftMap", "currentChatGroupMemberMap", "ignoreAllList"],
      storage: localStorage
    },
    {
      key: `${StoresEnum.CHAT}_session_chat`,
      paths: ["chatList", "currentChat"],
      storage: sessionStorage
    },
    // 消息相关持久化
    {
      key: `${StoresEnum.CHAT}_session_message`,
      paths: ["messageList", "messageCount"],
      storage: sessionStorage
    }
  ],

  // 多窗口同步配置
  sync: {
    paths: ["chatList"],
    targetWindows: [StoresEnum.NOTIFY],
    sourceWindow: StoresEnum.MAIN
  }
});