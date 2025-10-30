import { defineStore } from "pinia";
import { IMessageType, StoresEnum } from "@/constants";
import api from "@/api/index";
import Chats from "@/database/entity/Chats";
import { QueryBuilder, useMappers } from "@/database";
import { useUserStore } from "./user";
import { appIsMinimizedOrHidden, ShowMainWindow } from "@/windows/main";
import { storage } from "@/utils/Storage";
import { useChatInput } from "@/hooks/useChatInput";
import { useIdleTaskExecutor } from "@/hooks/useIdleTaskExecutor";
import { IMessage } from "@/models";
import { useSettingStore } from "./setting";
import { AudioEnum, useAudioPlayer } from "@/hooks/useAudioPlayer";
import SingleMessage from "@/database/entity/SingleMessage";
import GroupMessage from "@/database/entity/GroupMessage";

// mapper 与 store/工具初始化（保持为模块级单例）
const { chatsMapper } = useMappers();
const userStore = useUserStore();
const settingStore = useSettingStore();
const logger = useLogger();
const { buildMessagePreview, buildDraftMessagePreview, findChatIndex, removeMentionHighlightsFromHtml } =
  useChatInput();
const { addTask } = useIdleTaskExecutor({ maxWorkTimePerIdle: 12 });
const { play } = useAudioPlayer();

// 简单用户类型定义（store getter 返回用）
type User = { userId: string; name: string; avatar?: string | null };

// state 类型定义
interface State {
  chatList: Chats[]; // 本地会话列表（内存）
  currentChat: Chats | null; // 当前选中的会话
  currentChatGroupMemberMap: any[]; // 当前群成员信息（任意格式）
  isShowDetail: boolean; // 是否显示详情面板
  ignoreAllList: string[]; // 被忽略提醒的会话 id 列表
  chatDraftMap?: Record<string, any>; // 会话草稿（内存）
  loading: boolean; // 全局 loading 标志
  error: string | null; // 全局错误信息
}

/**
 * 聊天主 store（Pinia）
 * - 管理会话列表、当前会话、会话预览、未读、置顶等功能
 * - 保持与原实现兼容：不修改业务行为，仅添加注释
 */
export const useChatMainStore = defineStore(StoresEnum.CHAT, {
  state: (): State => ({
    chatList: [],
    currentChat: null,
    currentChatGroupMemberMap: [],
    isShowDetail: false,
    ignoreAllList: [],
    chatDraftMap: {},
    loading: false,
    error: null
  }),

  getters: {
    // 当前会话名称（若无返回空串）
    getCurrentName: state => state.currentChat?.name || "",

    // 按 chatId 获取会话对象（或 null）
    getChatById: state => (id: string | number) => state.chatList.find((c: Chats) => c.chatId === id) ?? null,

    // 当前会话类型（数字 code）
    getCurrentType: state => state.currentChat?.chatType,

    // 全局未读数（免打扰的会话不计入）
    getTotalUnread: state => state.chatList.reduce((s, c) => (c.isMute === 0 ? s + (c.unread || 0) : s), 0),

    // 是否展示详情按钮（是否存在当前会话）
    getShowDetailBtn: state => !!state.currentChat,

    // 是否显示详情面板
    getShowDetail: state => state.isShowDetail,

    // 返回所有有未读的会话列表
    getHaveMessageChat: state => state.chatList.filter(c => c.unread > 0),

    // 当前会话是否为群聊
    getChatIsGroup: state => state.currentChat?.chatType === IMessageType.GROUP_MESSAGE.code,

    // 当前用户 id（优先取 userStore，否则落到 local storage）
    getOwnerId: () => userStore.userId || storage.get("userId"),

    /**
     * 返回当前群成员（排除自己）
     * - 支持多种传入格式：数组 / 对象字典 / id 数组 / 字符串等
     * - 规范化为 { userId, name, avatar } 数组
     */
    getCurrentGroupMembersExcludeSelf(): User[] {
      const raw = this.currentChatGroupMemberMap;
      const me = this.getOwnerId;
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
    }
  },

  actions: {
    /**
     * 初始化 store（从本地 DB 加载会话列表）
     * - 只在 chatList 为空时从 chatsMapper 拉取
     */
    async handleInit() {
      this.setLoading(true);
      try {
        if (this.chatList.length === 0) {
          const data = await chatsMapper.selectList();
          if (Array.isArray(data) && data.length > 0) this.chatList = data;
        }
        this.setError(null);
      } catch (e: any) {
        this.setError(e?.message || "初始化会话列表失败");
      } finally {
        this.setLoading(false);
      }
    },

    /**
     * 切换当前会话
     * - 支持传入 chat 对象或 chatId
     * - 会保存当前草稿，去数据库拉取最新 preview（用于清除 mention 高亮）
     * - 若为群会话，会从服务端拉群成员并设置 currentChatGroupMemberMap
     */
    async handleChangeCurrentChat(chatOrId: Chats | string | number): Promise<void> {
      this.saveDraftAsPreview();
      if (!chatOrId) {
        this.currentChat = null;
        return;
      }

      let chat: Chats | null = null;
      let idx =
        typeof chatOrId === "object"
          ? this._findChatIndexLocal((chatOrId as Chats).chatId)
          : this._findChatIndexLocal(chatOrId as string | number);

      if (idx === -1) {
        // 内存中没有：如果传入了对象则把对象 upsert 到内存并置为 current
        if (typeof chatOrId === "object") {
          const newIdx = this._upsertChat(chatOrId as Chats);
          chat = this.chatList[newIdx];
        } else {
          // 传入 id 但内存中没有：标记错误并返回
          this.currentChat = null;
          this.setError("会话不存在");
          return;
        }
      } else {
        // 内存中有：尝试从本地 DB 拉取最新数据并去掉 mention 高亮
        chat = this.chatList[idx];
        try {
          const dbChat: Chats | null = await chatsMapper.selectById(chat.chatId);
          if (dbChat) {
            chat.message = removeMentionHighlightsFromHtml(dbChat.message, { returnPlainText: true });
          }
        } catch (e) {
          logger.warn("[chat-store] removeMentionHighlights failed", e);
        }

        // 若是群聊：从服务端获取群成员并缓存（用于 name 映射等）
        if (this.getChatIsGroup) {
          const res: any = await api.GetGroupMember({ groupId: chat.toId });
          this.currentChatGroupMemberMap = res || {};
        }
        this.handleSortChatList();
      }

      this.currentChat = chat;
    },

    /**
     * 通过目标信息（friend 或 group）创建/切换会话
     * - 如果已存在则切换并把未读清零
     * - 否则调用 API CreateChat 创建会话并 upsert
     */
    async handleCurrentChangeByTarget(targetInfo: { [key: string]: string | number }, chatType: number) {
      const fromId = this.getOwnerId;
      const targetId = (targetInfo as any).friendId ?? (targetInfo as any).groupId;
      const existingIdx = this.chatList.findIndex(c => c.toId === targetId && c.chatType === chatType);
      if (existingIdx !== -1) {
        await this.handleUpdateReadStatus(this.chatList[existingIdx], 0);
        this.currentChat = this.chatList[existingIdx];
        return;
      }

      try {
        this.setLoading(true);
        const res = (await api.CreateChat({ fromId, toId: targetId, chatType })) as Chats;
        if (!res) throw new Error("创建会话失败");
        this.handleUpdateChatWithMessage(res);
        this._upsertChat(res);
        this.handleSortChatList();
        this.currentChat = res;
        this.setError(null);
      } catch (e: any) {
        this.setError(e?.message || "创建会话失败");
      } finally {
        this.setLoading(false);
      }
    },

    /**
     * 更新会话的未读数并持久化到 DB（通过空闲任务 addTask 异步执行）
     */
    async handleUpdateReadStatus(chat: Chats, unread: number = 0): Promise<void> {
      if (!chat) return;
      const idx = this._findChatIndexLocal(chat.chatId);
      if (idx === -1) {
        this.setError("会话未找到");
        return;
      }
      this.chatList[idx].unread = unread;
      addTask(() =>
        chatsMapper
          .updateById(chat.chatId, { unread } as Chats)
          .catch(e => logger.error("[chat-store] update unread fail", e))
      );
    },

    /**
     * 核心：收到消息后创建或更新会话（合并本地 DB / 服务端 / 内存）
     * - 优先从本地 DB 查询会话（QueryBuilder）
     * - 若 DB 中存在则更新 preview/unread 并 upsert 到内存
     * - 若 DB 无则尝试从服务端拉取
     * - 调用此函数通常来自收到消息后的消息路由（handleIncomingMessage）
     */
    async handleCreateOrUpdateChat(message: IMessage | undefined, id: string | number) {
      const ownerId = this.getOwnerId;
      const qb = new QueryBuilder<Chats>().select().and(q => q.eq("ownerId", ownerId).eq("toId", id));

      try {
        this.setLoading(true);
        let chat: Chats | null = null;

        // 1) 本地 DB 查询
        const chats: Chats[] | null = await chatsMapper.selectList(qb);
        if (Array.isArray(chats) && chats.length > 0) {
          chat = chats[0];

          if (message?.fromId != this.getOwnerId) {
            this._triggerNotification(chat, message);
          }

          const idx = this._findChatIndexLocal(chat.chatId);
          if (idx !== -1) {
            // 内存已有 -> 更新内存对象
            this.handleUpdateChatWithMessage(this.chatList[idx], message);
          } else {
            // 内存无 -> 使用 DB 数据作为基础，标记为新并插入内存
            this.handleUpdateChatWithMessage(chat, message, true);
            this._upsertChat(chat);
          }
        } else {
          // 2) 本地 DB 没有 -> 尝试从服务端拉取会话信息
          chat = await this._fetchChatFromServer(ownerId, id);
          if (chat) {
            this.handleUpdateChatWithMessage(chat, message, true);
            this._upsertChat(chat);
          }
        }

        if (chat) this.handleSortChatList();
        this.setError(null);
      } catch (err: any) {
        this.setError(err?.message || "创建或更新会话失败");
        logger.error("[chat-store] handleCreateOrUpdateChat error", err);
      } finally {
        this.setLoading(false);
      }
    },

    /**
     * 根据消息更新会话的 preview/unread/时间等字段（在内存中）
     * - message 可选：如果传入 message 则计算 preview 并持久化 preview 到 DB（异步）
     * - isNew 标志：当会话是新创建时，处理 unread 逻辑不同
     */
    handleUpdateChatWithMessage(chat: Chats, message?: IMessage, isNew: boolean = false) {
      if (!chat) return;
      try {
        if (message) {
          const preview = this._buildPreviewFromMessage(message, true);
          if (preview) {
            const isCurrent = String(chat.toId) === String(this.currentChat?.toId);
            if (!isCurrent && !isNew) {
              // 不是当前会话且不是新会话：增加未读并设置 HTML preview（包含高亮）
              chat.unread = (chat.unread || 0) + 1;
              chat.message = preview.html;
              // flash(true).catch(e => logger.warn("[chat-store] flash tray failed", e));
            } else {
              // 当前会话：显示纯文本 preview
              chat.message = preview.plainText;
            }
            chat.messageTime = message.messageTime || Date.now();
            chat.sequence = message.messageTime || Date.now();
            // 持久化 preview（将 original 或 plainText 写入 DB），通过空闲任务执行
            this._persistPreviewToDb({ ...chat, message: preview.originalText || preview.plainText });
          } else {
            // 无 preview 的兜底
            chat.message = "";
            chat.messageTime = message.messageTime || Date.now();
            chat.sequence = message.messageTime || Date.now();
            this._persistPreviewToDb({ ...chat, message: "" });
          }
        } else {
          // message 未提供 -> 清空 preview 与未读
          chat.message = "";
          chat.messageTime = Date.now();
          chat.sequence = Date.now();
          chat.unread = 0;
          this._persistPreviewToDb({ ...chat, message: "" });
        }
      } catch (e: any) {
        logger.error("[chat-store] handleUpdateChatWithMessage error", e);
      }
    },

    /**
     * 删除会话（内存 + DB）
     * - 使用 addTask 将 DB 删除放到空闲任务执行器中
     */
    async handleDeleteChat(chat: Chats) {
      if (!chat) return;
      const idx = this._findChatIndexLocal(chat.chatId);
      if (idx !== -1) {
        addTask(async () => {
          await chatsMapper.deleteById(chat.chatId);
          await chatsMapper.deleteFTSById(chat.chatId);
        });
        this.chatList.splice(idx, 1);
      }
      if (this.currentChat?.chatId === chat.chatId) this.currentChat = null;
    },

    /**
     * 删除消息的敏感字段（UI/前端显示专用）
     */
    handleDeleteMessage(message: SingleMessage | GroupMessage) {
      if (message && (message as any).messageContentType) delete (message as any).messageContentType;
    },

    /**
     * 置顶会话（切换 isTop 并持久化）
     */
    async handlePinChat(chat: Chats) {
      if (!chat) return;
      const idx = this._findChatIndexLocal(chat.chatId);
      if (idx === -1) return;
      try {
        const newTop = (this.chatList[idx].isTop || 0) === 1 ? 0 : 1;
        this.chatList[idx].isTop = newTop;
        await chatsMapper.updateById(chat.chatId, { isTop: newTop } as Chats);
        this.handleSortChatList();
      } catch (e: any) {
        this.setError(e?.message || "更新置顶状态失败");
        throw e;
      }
    },

    /**
     * 会话免打扰设置（切换 isMute 并持久化）
     */
    async handleMuteChat(chat: Chats) {
      if (!chat) return;
      const idx = this._findChatIndexLocal(chat.chatId);
      if (idx === -1) return;
      try {
        const newMute = (this.chatList[idx].isMute || 0) === 1 ? 0 : 1;
        this.chatList[idx].isMute = newMute;
        await chatsMapper.updateById(chat.chatId, { isMute: newMute } as Chats);
        this.handleSortChatList();
      } catch (e: any) {
        this.setError(e?.message || "更新免打扰失败");
        throw e;
      }
    },

    /**
     * 会话列表排序：优先 isTop，然后按 messageTime 降序
     */
    handleSortChatList(customList?: Chats[]) {
      const list = customList || this.chatList;
      this.chatList = [...list].sort((a, b) => {
        const topDiff = (b.isTop || 0) - (a.isTop || 0);
        return topDiff !== 0 ? topDiff : (b.messageTime || 0) - (a.messageTime || 0);
      });
    },

    /**
     * 忽略所有未读会话（将有未读的会话 id 加入 ignoreAllList）
     */
    handleIgnoreAll() {
      this.getHaveMessageChat.forEach(item => {
        const id = String(item.chatId);
        if (!this.ignoreAllList.includes(id)) this.ignoreAllList.push(id);
      });
      logger.info("[chat-store] ignore all messages");
    },

    /**
     * 把主窗口打开并切换到当前会话（如果存在）
     */
    async handleJumpToChat() {
      if (this.currentChat) {
        try {
          ShowMainWindow();
        } catch (e) {
          logger.warn("[chat-store] open main window fail", e);
        }
      }
    },

    // 通过 id 获取 chat（按旧字段 id）
    handleGetChat(id: any): Chats | undefined {
      return this.chatList.find(c => c.id === id);
    },

    /**
     * 保存当前输入草稿并把 preview 写回内存（用于切换会话时保存草稿）
     */
    async saveDraftAsPreview() {
      const chatId = this.currentChat?.chatId;
      if (!chatId) return;

      const draftHtml = this.getDraft(chatId);
      if (!draftHtml) return;

      const preview = buildDraftMessagePreview(String(chatId), draftHtml);
      if (preview) {
        const stub: Partial<any> = { chatId, message: preview, messageTime: Date.now() };
        this._upsertChat(stub as any);
      }
    },

    // 草稿相关：设置/获取/清除
    setDraft(chatId: string | number, html: string) {
      if (!chatId) return;
      const id = String(chatId);
      if (!(this as any).chatDraftMap) (this as any).chatDraftMap = {};
      (this as any).chatDraftMap[id] = html ?? "";
    },

    getDraft(chatId: string | number) {
      if (!chatId) return "";
      return ((this as any).chatDraftMap || {})[String(chatId)] || undefined;
    },

    clearDraft(chatId: string | number) {
      if (!chatId) return;
      const id = String(chatId);
      if ((this as any).chatDraftMap && id in (this as any).chatDraftMap) delete (this as any).chatDraftMap[id];
    },

    // loading / error setter（统一管理）
    setLoading(flag: boolean) {
      this.loading = !!flag;
    },

    setError(err: string | null) {
      this.error = err;
      if (err) logger.error?.("[chat-store] error:", err);
    },

    // 切换详情面板显示
    handleChatDetail() {
      this.isShowDetail = !this.isShowDetail;
    },

    /**
     * 在内存 chatList 中查找索引（优先使用 hook）
     * - 兼容回退：如果 hook 抛错则用 findIndex
     */
    _findChatIndexLocal(chatId: string | number) {
      try {
        return findChatIndex(this.chatList, chatId);
      } catch (e) {
        return this.chatList.findIndex(c => c.chatId === chatId);
      }
    },

    /**
     * upsert 会话到内存 chatList（保持响应性）
     * - 如果存在则合并并返回索引；不存在则 push 并返回新索引
     */
    _upsertChat(chat: Partial<Chats> & { chatId?: any }): number {
      if (!chat || chat.chatId == null) return -1;
      const idx = this._findChatIndexLocal(chat.chatId);
      if (idx !== -1) {
        this.chatList[idx] = { ...this.chatList[idx], ...chat };
        return idx;
      }
      this.chatList.push(chat as Chats);
      return this.chatList.length - 1;
    },

    /**
     * 将 preview 写入本地 DB（异步，通过 addTask 提交）
     * - 这里不阻塞 UI，持久化会在空闲时执行
     */
    _persistPreviewToDb(chatObj: Partial<Chats>) {
      if (!chatObj || !chatObj.chatId) return;
      addTask(() => {
        chatsMapper.insertOrUpdate(chatObj).catch(err => logger.warn("[chat-store] persist preview fail", err));
        chatsMapper.insertOrUpdateFTS(chatObj);
      });
    },

    /**
     * 根据消息构建 preview（使用 useChatInput 提供的 buildMessagePreview）
     * - asHtml 控制是否返回 HTML preview（默认 true）
     */
    _buildPreviewFromMessage(message?: IMessage, asHtml = true) {
      if (!message) return null;
      try {
        return buildMessagePreview(message, {
          currentUserId: this.getOwnerId,
          highlightClass: "mention-highlight",
          asHtml
        });
      } catch (e) {
        logger.warn("[chat-store] buildMessagePreview failed", e);
        return null;
      }
    },

    /**
     * 从服务端拉取会话信息（fallback，当本地 DB 没有会话时使用）
     * - 返回 Chats 或 null（并在失败时记录错误）
     */
    async _fetchChatFromServer(ownerId: string | number, toId: string | number) {
      try {
        const res = (await api.GetChat({ ownerId, toId })) as Chats;
        if (!res) throw new Error("拉取会话信息失败");
        return res;
      } catch (err: any) {
        logger.warn("[chat-store] GetChat failed", err);
        this.setError(err?.message || "拉取会话信息失败");
        return null;
      }
    },

    /**
     * 内部通知触发器：播放消息提示音并在窗口最小化时闪烁托盘
     * - 在 handleCreateOrUpdateChat 中被调用（当 chat 来自 DB）
     */
    async _triggerNotification(chat: Chats, message?: IMessage) {
      // // 支持消息声音通知  和 非免打扰
      //     if (settingStore.notification.message && chatFromDb.isMute === 0) {
      //       // 播放提示音
      //       play(AudioEnum.MESSAGE_ALERT);
      //       // 窗口最小化时，托盘闪烁
      //       if (await appIsMinimizedOrHidden()) {
      //         // 系统托盘闪烁
      //         flash(true);
      //       }
      //     }
      if (settingStore.notification.message && chat.isMute === 0 && message) {
        play(AudioEnum.MESSAGE_ALERT);
      }
    }
  },
  // 本地持久化配置（哪些 state 写到 local/session storage）
  persist: [
    {
      key: `${StoresEnum.CHAT}_local`,
      paths: ["chatDraftMap", "currentChatGroupMemberMap", "ignoreAllList"],
      storage: localStorage
    },
    {
      key: `${StoresEnum.CHAT}_session`,
      paths: ["chatList", "currentChat"],
      storage: sessionStorage
    }
  ],
  // 多窗口同步配置（将 chatList 同步到通知窗口）
  sync: {
    paths: ["chatList"],
    targetWindows: [StoresEnum.NOTIFY],
    sourceWindow: StoresEnum.MAIN
  }
});
