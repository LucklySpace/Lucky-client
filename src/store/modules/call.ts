import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import { MessageType, StoresEnum } from "@/constants";
import { emitTo } from "@tauri-apps/api/event";
import {
  CloseCallAcceptWindow,
  CreateCallAcceptWindow,
  CreateCallWindow,
  waitForWindowReady
} from "@/windows/call";
import { useChatStore } from "@/store/modules/chat";
import api from "@/api";
import { Participant } from "@/types/env";
import { useLogger } from "@/hooks/useLogger";

const chatStore = useChatStore();
const logger = useLogger();

interface State {
  friendInfo: any;
  state: number;
  calldata: any;
  roomId: string | undefined;
  layoutMode: "grid" | "speaker" | "right-list";
  participants: Participant[];
  isScreenShared: boolean;
  hostId: string | undefined;
}

const CALL_LOADED_EVENT = "call-loaded";
const CALL_LOADEDS_EVENT = "call-loadeds";

export const useCallStore = defineStore(StoresEnum.CALL, {
  state: (): State => ({
    friendInfo: {},
    state: 0,
    calldata: {},
    roomId: "",
    layoutMode: "grid",
    participants: [],
    isScreenShared: false,
    hostId: undefined
  }),
  getters: {
    localParticipant: state => state.participants.find(p => p.isLocal),
    participantCount: state => state.participants.length,
    getFriendAvatar(): any {
      return this.friendInfo?.avatar;
    }
  },
  actions: {
    /* ---------- 发起通话 ---------- */
    async handleCreateCallMessage() {
      const current = chatStore.currentChat;
      if (!current) return;

      // 单聊
      if (current.chatType === MessageType.SINGLE_MESSAGE.code) {
        this.friendInfo = current;
        try {
          const online = await api.GetOnline({ userId: this.friendInfo.id });
          if (!online) {
            ElMessage.error("对方不在线");
            return;
          }

          const ok = await this._createAndReadyWindow("正在通话中", "/singlecall", { show: true, waitTimeoutMs: 3000 });
          if (!ok) {
            ElMessage.error("创建通话窗口失败");
            return;
          }

          // 告知子窗口初始加载类型
          await this._emitSafe(CALL_LOADEDS_EVENT, { type: MessageType.RTC_START_VIDEO_CALL.code, data: "" });
        } catch (err) {
          logger.error("Error checking online status:", err);
          ElMessage.error("无法检查在线状态");
        }
        return;
      }

      // 群聊
      if (current.chatType === MessageType.GROUP_MESSAGE.code) {
        this.roomId = current.chatId;
        // group call: 隐藏/传参按需要
        const ok = await this._createAndReadyWindow(
          "正在通话中",
          "/groupcall",
          {
            show: true,
            waitTimeoutMs: 6000
          },
          true
        );
        if (!ok) {
          ElMessage.error("创建群聊通话窗口失败");
        }
        return;
      }
    },

    /* ---------- 处理收到的通话消息 ---------- */
    async handleCallMessage(data: any) {
      if (!data || typeof data.type !== "number") return;

      // 仅处理 RTC 相关类型
      if (data.type < MessageType.RTC_START_VIDEO_CALL.code || data.type > MessageType.RTC_CANDIDATE.code) {
        return;
      }

      this.calldata = data;

      // 映射事件处理器（将逻辑拆成小函数，便于维护）
      const handlers = new Map<number, () => Promise<void>>();

      handlers.set(MessageType.RTC_START_VIDEO_CALL.code, async () => {
        // 收到通话请求：准备 main call window（隐藏） + 弹出 accept 窗口
        this.friendInfo = chatStore.handleGetChat(data.fromId) || {};
        // const mainOk = await this._createAndReadyWindow("正在通话中", "/singlecall", { show: false });
        // if (!mainOk) {
        //   logger.warn("主通话窗口创建失败，但仍尝试显示接听窗口");
        // }
        try {
          await CreateCallAcceptWindow();
        } catch (err) {
          logger.error("CreateCallAcceptWindow failed:", err);
        }
      });

      handlers.set(MessageType.RTC_ACCEPT.code, async () => {
        await this._emitSafe(CALL_LOADED_EVENT, { type: MessageType.RTC_ACCEPT.code, data });
      });

      handlers.set(MessageType.RTC_REJECT.code, async () => {
        ElMessage.error("对方已拒绝");
        await this._emitSafe(CALL_LOADED_EVENT, { type: MessageType.RTC_REJECT.code, data });
      });

      handlers.set(MessageType.RTC_FAILED.code, async () => {
        ElMessage.error("通话失败");
        await this._emitSafe(CALL_LOADED_EVENT, { type: MessageType.RTC_FAILED.code, data });
      });

      handlers.set(MessageType.RTC_HANDUP.code, async () => {
        ElMessage.error("对方已挂断");
        await this._emitSafe(CALL_LOADED_EVENT, { type: MessageType.RTC_HANDUP.code, data });
      });

      handlers.set(MessageType.RTC_CANCEL.code, async () => {
        ElMessage.error("对方已取消");
        try {
          await CloseCallAcceptWindow();
        } catch (err) {
          logger.warn("CloseCallAcceptWindow failed:", err);
        }
        await this._emitSafe(CALL_LOADED_EVENT, { type: MessageType.RTC_CANCEL.code, data });
      });

      const h = handlers.get(data.type);
      if (h) {
        try {
          await h();
        } catch (err) {
          logger.error("call message handler error:", err);
        }
      } else {
        logger.debug("未处理的通话类型：", data.type);
      }
    },

    /* ---------- 接受通话（接听按钮） ---------- */
    async handleShowCallWindow() {
      try {
        const ok = await this._createAndReadyWindow("正在通话中", "/singlecall", { show: true, waitTimeoutMs: 3000 });
        if (!ok) {
          ElMessage.error("创建通话窗口失败");
          return;
        }
        await this._emitSafe(CALL_LOADED_EVENT, { type: MessageType.RTC_START_VIDEO_CALL.code, data: this.calldata });
        await CloseCallAcceptWindow();
      } catch (err) {
        logger.error("handleShowCallWindow failed:", err);
      }
    },

    /* ---------- 拒绝通话（拒绝按钮） ---------- */
    async handleCloseCallWindow() {
      try {
        await CloseCallAcceptWindow();
      } catch (err) {
        logger.warn("CloseCallAcceptWindow failed:", err);
      }
      await this._emitSafe(CALL_LOADED_EVENT, { type: MessageType.RTC_REJECT.code, data: this.calldata });
    },

    /* ---------- helper: 创建并等待通话窗口准备就绪 ---------- */
    async _createAndReadyWindow(
      title: string,
      route: string,
      opts?: { show?: boolean; waitTimeoutMs?: number },
      isFullScreen: boolean = false
    ): Promise<boolean> {
      try {
        await CreateCallWindow(title, route, opts?.show ?? true, isFullScreen);
        // 等待子窗口 ready，最多等待 opts.waitTimeoutMs（默认 3000）
        const timeout = opts?.waitTimeoutMs ?? 3000;
        await waitForWindowReady(StoresEnum.CALL, timeout);
        return true;
      } catch (err) {
        logger.error("create window failed:", err);
        return false;
      }
    },

    /* ---------- helper: 安全发送事件到子窗口 ---------- */
    async _emitSafe(event: string, payload: any) {
      try {
        await emitTo(StoresEnum.CALL, event, payload);
      } catch (err) {
        logger.warn(`emitTo ${event} failed:`, err);
      }
    }
  },
  persist: [
    {
      key: `${StoresEnum.CALL}_local`,
      paths: ["friendInfo", "calldata", "roomId"],
      storage: localStorage
    },
    {
      key: `${StoresEnum.CALL}_session`,
      paths: [],
      storage: sessionStorage
    }
  ]
});
