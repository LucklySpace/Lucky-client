// message.store.ts (优化版)
// 说明：保留原有外部接口与行为。优化：并行发送消息、简化重复逻辑、异步DB操作、移除未用工具函数、缓存成员查找表以提升性能。

import { defineStore } from "pinia";
import { IMessageType, MessageContentType, StoresEnum } from "@/constants";
import api from "@/api/index";
import { useUserStore } from "./user";
import { useChatMainStore } from "./chat";
import { FTSQueryBuilder, PageResult, Segmenter, useMappers } from "@/database";
import { highlightTextByTokens } from "@/utils/Strings";
import { CreateScreenWindow } from "@/windows/screen";
import { CreateRecordWindow } from "@/windows/record";
import { IMessage, IMessagePart } from "@/models";
import { useIdleTaskExecutor } from "@/hooks/useIdleTaskExecutor";
import { storage } from "@/utils/Storage";
import Chats from "@/database/entity/Chats";

const { singleMessageMapper, groupMessageMapper } = useMappers();
const userStore = useUserStore();
const chatStore = useChatMainStore();
const logger = useLogger();
const { addTask } = useIdleTaskExecutor({ maxWorkTimePerIdle: 12 });

interface State {
  messageList: Array<IMessage>;
  historyMessageList: Array<IMessage>;
  messageNum: number;
  messageSize: number;
  groupInfo: Record<string, any>;
  currentUrls: string[];
  messageCount: number;
  loading: boolean;
  error: string | null;
}

export const useMessageStore = defineStore(StoresEnum.MESSAGE, {
  state: (): State => ({
    messageList: [],
    historyMessageList: [],
    messageNum: 1,
    messageSize: 15,
    groupInfo: {},
    currentUrls: [],
    messageCount: 0,
    loading: false,
    error: null
  }),

  getters: {
    remainingQuantity: state => Math.max(0, state.messageCount - state.messageNum * state.messageSize),
    getOwnerId: () => userStore.userId || storage.get("userId")
  },

  actions: {
    handleReset() {
      Object.assign(this, {
        messageList: [],
        historyMessageList: [],
        messageNum: 1,
        messageCount: 0,
        currentUrls: [],
        groupInfo: {}
      });
    },

    async handleSendMessage(messageParts: IMessagePart[]) {
      if (!messageParts?.length) return;
      const currentChat = chatStore.currentChat;
      if (!currentChat) return logger.warn("No current chat, cannot send message");

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
          await this.uploadAndSendFile(m.file, currentChat, contentType).catch(e =>
            this.setError(e?.message || "File send failed")
          );
        })
      );

      // 并行处理文本发送
      await Promise.all(
        textMsgs.map(async m => {
          const form = this.handleCreateMessageContext({ text: m.content }, currentChat, MessageContentType.TEXT.code, {
            mentionedUserIds: Array.isArray(m.mentionedUserIds) ? m.mentionedUserIds : [],
            mentionAll: !!m.mentionAll,
            replyMessage: m.replyMessage
          });
          const apiFn = this._getSendApiByChat(currentChat);
          await this.sendSingle(form, currentChat, apiFn).catch(e => this.setError(e?.message || "Text send failed"));
        })
      );
    },

    async sendSingle(formData: any, currentChat: any, sendFn: Function) {
      const res = await sendFn(formData);
      this.handleCreateMessage(currentChat.toId, res, currentChat.chatType, true);
      return res;
    },

    async uploadAndSendFile(file: File, currentChat: any, contentType: number) {
      if (!file || !currentChat) throw new Error("Invalid params for uploadAndSendFile");

      const formData = new FormData();
      formData.append("file", file);

      const uploadRes: any = await api.UploadFile(formData);
      const ext = file.name.split(".").pop()?.toLowerCase() || "";

      const form = this.handleCreateMessageContext(
        { ...uploadRes, size: file.size, suffix: ext },
        currentChat,
        contentType
      );

      const apiFn = this._getSendApiByChat(currentChat);
      await this.sendSingle(form, currentChat, apiFn);

      return uploadRes;
    },

    handleCreateMessageContext(content: any, chat: any, messageContentType: number, meta: any = {}) {
      return this._buildFormPayload(content, chat, messageContentType, meta);
    },

    handleMoreMessage(): void {
      if (!chatStore.currentChat) return;
      this.messageNum++;
      this.handleGetMessageList(chatStore.currentChat);
    },

    async handleGetMessageList(chat: any) {
      if (!chat) return;
      if (this.messageCount === 0) await this.handleGetMessageCount();

      const ownId = this.getOwnerId;
      const offset = (this.messageNum - 1) * this.messageSize;
      const isSingle = this._isSingle(chat);
      chatStore.currentChatGroupMemberMap = chatStore.currentChatGroupMemberMap || [];

      const mapper = isSingle ? singleMessageMapper : groupMessageMapper;
      const messages = await mapper.findMessage(ownId, chat.toId, offset, this.messageSize);

      const userInfo = userStore.userInfo;
      const normalized = messages.map((msg: any) => this._normalizeMessageForUI(msg, ownId, userInfo, chat));
      this.messageList = [...normalized, ...this.messageList];
    },

    async handleGetMessageCount() {
      const chat = chatStore.currentChat;
      if (!chat) return;
      const mapper = chat.chatType === IMessageType.SINGLE_MESSAGE.code ? singleMessageMapper : groupMessageMapper;
      this.messageCount = await mapper.findMessageCount(chat.ownerId || chat.toId, chat.toId);
    },

    handleCreateMessage(id: string | number, message: any, messageType: number, isSender: boolean = false) {
      const currentChat = chatStore.currentChat;
      //if (currentChat?.id !== id) return;

      const ownId = this.getOwnerId;
      const userInfo = userStore.userInfo;
      this.messageList.push(this._normalizeMessageForUI(message, ownId, userInfo, currentChat));

      if (isSender) chatStore.handleCreateOrUpdateChat(message, currentChat?.toId as any);

      this.handleInsertToDatabase(message, messageType);
    },

    async handleInsertToDatabase(message: any, messageType: number) {
      const record = this._toDbRecord(message);
      const mapper = this._getMapperByType(messageType);
      addTask(() => {
        mapper.insert(record);
        const text = message.messageBody?.text;
        if (text) mapper.insertOrUpdateFTS({ ...record, messageBody: text });
      });
    },

    async handleSendRecallMessage(message: any, opts: { reason?: string; recallTime?: number } = {}) {
      if (!message?.messageId) return { ok: false, msg: "invalid message" };

      const ownerId = this.getOwnerId;
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
        await this.handleReCallMessage(payload);
        return { ok: true };
      } catch (err) {
        const msg = (err as any)?.message ?? "撤回消息失败";
        logger.error("[handleSendRecallMessage] recall failed:", err);
        this.setError(msg);
        return { ok: false, error: err, msg };
      }
    },

    async handleReCallMessage(data: any) {
      if (!data?.messageId) return this.setError("handleReCallMessage: invalid payload");

      const messageId = String(data.messageId);
      const messageType = Number(data.messageType ?? IMessageType.SINGLE_MESSAGE.code);
      const operatorId = data.operatorId ?? data.fromId ?? "";
      const recallTime = data.recallTime ?? Date.now();
      const reason = data.reason ?? "";

      const { mapper } = this._chooseByIMessageType(messageType);

      const recallPayload = {
        _recalled: true,
        operatorId,
        recallTime,
        reason,
        text: "已撤回一条消息"
      };

      const idx = this.messageList.findIndex((m: any) => String(m.messageId) === messageId);
      if (idx !== -1) {
        const old = this.messageList[idx];
        this.messageList[idx] = {
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
    },

    async handleSearchMessageUrl(msg: any): Promise<void> {
      const mapper = msg.messageType === IMessageType.SINGLE_MESSAGE.code ? singleMessageMapper : groupMessageMapper;
      this.currentUrls = await mapper.findMessageUrl(msg.fromId || msg.groupId, msg.toId);
    },

    async handleDelectMessage(message: any) {
      const idx = this.messageList.findIndex(item => item.messageId === message.messageId);
      if (idx !== -1) this.messageList.splice(idx, 1);

      const mapper = this._getMapperByType(message.messageType);
      addTask(async () => {
        await mapper.deleteById(message.messageId);
        await mapper.deleteFTSById(message.messageId);
      });
    },

    async handleAddGroupMember(membersList: string[], isInvite: boolean = false) {
      if (!membersList?.length) return logger.warn("Members list is empty.");
      const currentChat = chatStore.currentChat;

      await api
        .InviteGroupMember({
          groupId: currentChat?.id ?? "",
          userId: storage.get("userId") || "",
          memberIds: membersList,
          type: isInvite ? IMessageType.GROUP_INVITE.code : IMessageType.CREATE_GROUP.code
        })
        .catch(e => this.setError(e?.message || "Error adding group members"));
    },

    async handleApproveGroupInvite(inviteInfo: any) {
      await api
        .ApproveGroup({
          requestId: inviteInfo.requestId,
          groupId: inviteInfo.groupId ?? "",
          userId: storage.get("userId") || "",
          inviterId: inviteInfo.inviterId,
          approveStatus: inviteInfo.approveStatus
        })
        .catch(e => this.setError(e?.message || "Error approving group invite"));
    },

    handleUpdateMessage(message: any, update: any) {
      const mapper = this._getMapperByType(message.messageType);
      mapper.updateById(message.messageId, update as any);

      const idx = this._findMessageIndex(message.messageId);
      if (idx !== -1) this.messageList[idx] = { ...this.messageList[idx], ...update };
    },

    async handleClearMessage(chat: Chats) {

      if (chat.chatType !== IMessageType.SINGLE_MESSAGE.code) {
         await groupMessageMapper.clearChatHistory(chat.id, this.getOwnerId);
         this.handleReset();
         await this.handleGetMessageList(chat);
        return;
      }

      await singleMessageMapper.deleteByFormIdAndToId(chat.id, this.getOwnerId);
      await singleMessageMapper.deleteByFormIdAndToIdVirtual(this.getOwnerId, chat.id);
      this.handleReset();
      await this.handleGetMessageList(chat);
    },

    handleShowScreeenShot() {
      CreateScreenWindow(screen.availWidth, screen.availHeight);
    },

    handleShowRecord() {
      CreateRecordWindow(screen.availWidth, screen.availHeight);
    },

    async handleHistoryMessage(
      pageInfo: PageResult<any>,
      searchStr?: string | string[]
    ): Promise<{ list: any[]; total: number }> {
      try {
        const currentChat = chatStore.currentChat;
        if (!currentChat?.id) return { list: [], total: 0 };

        const ownId = this.getOwnerId;
        const toId = currentChat.id;
        if (!ownId || !toId) return { list: [], total: 0 };

        const isSingle = currentChat.chatType === IMessageType.SINGLE_MESSAGE.code;
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

        const memberLookup = new Map((chatStore.getCurrentGroupMembersExcludeSelf ?? []).map(m => [m.userId, m]));
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
            const name = isOwner ? userInfo.name : isSingle ? currentChat.name : member?.name ?? "未知";
            const avatar = isOwner ? userInfo.avatar : isSingle ? currentChat.avatar : member?.avatar ?? "";

            return { ...item, messageBody: body, name, avatar, isOwner };
          })
          .filter(Boolean);

        return { list: formatted, total: fts5RawPage.total ?? 0 };
      } catch (err) {
        logger.error(`handleHistoryMessage error: ${(err as any)?.message ?? err}`);
        return { list: [], total: 0 };
      }
    },

    _isSingle(chat: any): boolean {
      return chat?.chatType === IMessageType.SINGLE_MESSAGE.code;
    },

    _getMapperByType(messageType: number) {
      return messageType === IMessageType.SINGLE_MESSAGE.code ? singleMessageMapper : groupMessageMapper;
    },

    _getSendApiByChat(chat: any) {
      return chat.chatType === IMessageType.SINGLE_MESSAGE.code ? api.SendSingleMessage : api.SendGroupMessage;
    },

    _buildFormPayload(content: any, chat: any, messageContentType: number, meta: any = {}) {
      const chatType = chat?.chatType;
      const toKey = chatType === IMessageType.SINGLE_MESSAGE.code ? "toId" : "groupId";
      const payload: any = {
        fromId: this.getOwnerId,
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
    },

    _toDbRecord(message: any) {
      const record = { ...message, ownerId: this.getOwnerId, messageBody: JSON.stringify(message.messageBody) };
      delete record.messageTempId;
      return record;
    },

    _normalizeMessageForUI(msg: any, ownId: string, userInfo: any, chat: any) {
      const body = typeof msg.messageBody === "string" ? JSON.parse(msg.messageBody) : msg.messageBody;
      const isOwner = ownId === msg.fromId;
      const name = isOwner ? userInfo.name : chatStore.currentChatGroupMemberMap[msg.fromId]?.name || chat.name;
      const avatar = isOwner ? userInfo.avatar : chatStore.currentChatGroupMemberMap[msg.fromId]?.avatar || chat.avatar;
      return { ...msg, messageBody: body, name, avatar, isOwner };
    },

    _findMessageIndex(messageId: string | number) {
      return this.messageList.findIndex(item => item.messageId == messageId);
    },

    setError(err: string | null) {
      this.error = err;
      if (err) logger.error("[message-store] error:", err);
    },

    _chooseByIMessageType(messageType: number) {
      return {
        mapper: messageType === IMessageType.SINGLE_MESSAGE.code ? singleMessageMapper : groupMessageMapper,
        isSingle: messageType === IMessageType.SINGLE_MESSAGE.code
      };
    }
  },

  persist: [
    { key: `${StoresEnum.MESSAGE}_local`, paths: ["messageList"], storage: sessionStorage },
    { key: `${StoresEnum.MESSAGE}_session`, paths: ["messageCount"], storage: sessionStorage }
  ]
});
