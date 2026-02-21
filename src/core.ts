// ==================== 导入 ====================

// 常量和类型
import { MessageContentType, MessageType } from "@/constants";
import { IMessage, IMessageAction, IMGroupMessage, IMSingleMessage } from "./models";

// 数据库
import { initDatabase, useMappers } from "@/database";

// Hooks
import { globalEventBus } from "@/hooks/useEventBus";
import { useIdleTaskExecutor } from "@/hooks/useIdleTaskExecutor";
import { initAllCache } from "@/hooks/useImageCache";
import { useGlobalScheduler } from "@/hooks/useScheduler";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useTray } from "@/hooks/useTray";
import { useWebSocketWorker } from "@/hooks/useWebSocketWorker";
import { useGlobalShortcut } from "./hooks/useGlobalShortcut";

// i18n
import { globalI18n } from "@/i18n";

// Store
import { useCallStore } from "@/store/modules/call";
import { useChatStore } from "@/store/modules/chat";
import { useFriendsStore } from "@/store/modules/friends";
import { useGroupStore } from "@/store/modules/group";
import { useMessageStore } from "@/store/modules/message";
import { useSettingStore } from "@/store/modules/setting";
import { useUserStore } from "@/store/modules/user";

// 工具
import { MessageQueue, Priority } from "@/utils/MessageQueue";
import ObjectUtils from "@/utils/ObjectUtils";

// 路由和窗口
import router from "@/router";
import { appIsMinimizedOrHidden, ShowMainWindow } from "@/windows/main";
import { calculateHideNotifyWindow, hideNotifyWindow, showOrCreateNotifyWindow } from "@/windows/notify";
import { CreateScreenWindow } from "@/windows/screen";

// API 和 Tauri
import api from "@/api/index";
import { downloadDir } from "@tauri-apps/api/path";
import { exit } from "@tauri-apps/plugin-process";

// ==================== 工具函数 ====================

/** 性能计时装饰器 - 简化重复的计时逻辑 */
async function withTiming<T>(
  tag: string,
  label: string,
  fn: () => Promise<T>,
  log: ReturnType<typeof useLogger>
): Promise<T> {
  const t0 = performance.now();
  try {
    const result = await fn();
    log.prettySuccess(tag, `${label}成功`);
    return result;
  } catch (err) {
    log.prettyError(tag, `${label}失败`, err);
    throw err;
  } finally {
    log.prettyInfo(tag, `${label}耗时 ${Math.round(performance.now() - t0)} ms`);
  }
}

/** 获取翻译函数 */
const getT = () => globalI18n.global.t as (key: string) => string;

/** 获取消息内容类型的显示文本 */
const getMessageDisplayText = (code: number, msg?: any): string => {
  const t = getT();

  if (code === MessageContentType.TEXT.code) {
    return msg.message ?? msg.text ?? "";
  }

  const previewMap: Record<number, string> = {
    [MessageContentType.IMAGE.code]: t("pages.chat.preview.image"),
    [MessageContentType.VIDEO.code]: t("pages.chat.preview.video"),
    [MessageContentType.AUDIO.code]: t("pages.chat.preview.audio"),
    [MessageContentType.FILE.code]: t("pages.chat.preview.file"),
    [MessageContentType.LOCATION.code]: t("pages.chat.preview.location"),
  };

  return previewMap[code] ?? t("pages.chat.preview.unknown");
};

/** 安全调度空闲任务 */
const scheduleIdleTask = (fn: () => void, delay = 50) => {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(fn);
  } else {
    setTimeout(fn, delay);
  }
};

const { connect, disconnect, onMessage } = useWebSocketWorker();

// ==================== 主管理器 ====================

/**
 * IM 客户端主初始化管理器
 * - 关键路径：用户 → 数据库 → 聊天存储 → WebSocket
 * - 后台任务：文件目录、数据同步、托盘、快捷键
 */
class MainManager {
  private static instance: MainManager;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // 延迟初始化的依赖
  private readonly log = useLogger();
  private readonly exec = useIdleTaskExecutor({ maxWorkTimePerIdle: 12 });
  private readonly messageQueue = new MessageQueue<any>({
    maxFrameTime: 6, // 每帧最多 6ms，保证 60fps
    initialBatchSize: 20, // 初始批大小
    maxBatchSize: 200, // 高峰期最大批量
    backpressureThreshold: 500, // 背压阈值
    enablePriority: true, // 启用优先级
  });
  private readonly tray = useTray();
  private readonly tauriEvent = useTauriEvent();

  // Store 实例
  private readonly stores = {
    user: useUserStore(),
    chat: useChatStore(),
    message: useMessageStore(),
    call: useCallStore(),
    setting: useSettingStore(),
    friend: useFriendsStore(),
    group: useGroupStore(),
  };

  // Mapper 实例
  private readonly mappers = useMappers();

  private constructor() { }

  static getInstance(): MainManager {
    return (MainManager.instance ??= new MainManager());
  }

  // ==================== 公共 API ====================

  /** 初始化客户端（主入口） */
  async initClient(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const t0 = performance.now();
      this.log.prettyInfo("core", "客户端初始化开始");

      try {
        // 1. 初始化语言
        this.initLanguage();

        // 2. 初始化用户信息
        await this.initUser();

        // 3. 初始化数据库
        await this.initDatabase();

        // 4. 初始化聊天存储
        await this.initChatStore();

        // 5. 初始化 WebSocket
        void this.initWebSocket().catch(err => {
          this.log.prettyWarn("ws", "WebSocket 初始化失败（已降级为离线模式）", err);
        });

        // 6. 初始化其他依赖
        this.initEventListeners();

        // 7. 初始化后台任务
        this.initBackgroundTasks();

        this.initialized = true;

        this.log.prettySuccess("core", `客户端初始化完成（${Math.round(performance.now() - t0)} ms）`);

      } catch (err) {
        this.initialized = false;
        this.log.prettyError("core", "客户端初始化致命错误", err);
        throw err;
      }
    })().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  /** 销毁资源 */
  async destroy(): Promise<void> {
    this.log.prettyInfo("core", "开始清理资源");
    try {
      disconnect();
      this.initialized = false;
      this.log.prettySuccess("core", "资源清理完成");
    } catch (err) {
      this.log.prettyError("core", "资源清理失败", err);
    }
  }

  // ==================== 关键路径初始化 ====================

  private initLanguage(): void {
    this.log.prettyInfo("i18n", "语言初始化完成");
  }

  private initUser(): Promise<void> {
    return withTiming(
      "user",
      "用户信息初始化",
      async () => {
        await this.stores.user.handleGetUserInfo();
      },
      this.log
    );
  }

  private initDatabase(): Promise<void> {
    return withTiming(
      "db",
      "数据库初始化",
      () => initDatabase(this.stores.user.userId, { deferFTS: true }),
      this.log
    );
  }

  private initChatStore(): Promise<void> {
    return withTiming("chat", "聊天存储初始化", () => this.stores.chat.handleInitChat(), this.log);
  }

  /**
   * 初始化定时任务（按需启用）
   * @deprecated 暂时禁用，在 initClient 中取消注释 this.initScheduler() 来启用
   */
  // @ts-expect-error 保留备用，暂未启用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private initScheduler(): Promise<void> {
    return withTiming(
      "scheduler",
      "定时任务初始化",
      () =>
        Promise.resolve().then(() => {
          const scheduler = useGlobalScheduler({
            onTick: ({ taskId }) => {
              if (taskId === "refresh") {
                this.syncFriends();
              }
            },
            onCompleted: () => { /* 任务完成回调 */ },
          });

          // 定时刷新任务：每 30 秒执行
          scheduler.startInterval("refresh", 30000, { immediate: true });
        }),
      this.log
    );
  }

  initImageCache() {
    return withTiming("image", "图片缓存初始化", () => initAllCache(this.stores.user.userId), this.log);
  }

  /**
   * 初始化 WebSocket 连接
   * - 先注册消息处理回调，再建立连接
   * - 添加用户认证参数
   */
  private async initWebSocket(): Promise<void> {
    return withTiming(
      "ws",
      "WebSocket初始化",
      async () => {
        const currentUserId = this.stores.user.userId;
        const accessToken = await this.stores.user.getAccess();

        if (!accessToken || !currentUserId) {
          throw new Error("无有效的 Token 或用户 ID");
        }

        const url = new URL(import.meta.env.VITE_API_SERVER_WS);
        url.searchParams.append("uid", currentUserId);
        url.searchParams.append("token", accessToken);

        onMessage((e: any) => {
          this.log.prettyInfo("websocket", "收到 WebSocket 消息:", e);
          this.handleMessage(e);
        });

        connect(url.toString(), {
          payload: {
            code: MessageType.REGISTER.code,
            token: accessToken,
            data: "registrar",
            deviceType: import.meta.env.VITE_DEVICE_TYPE,
          },
          heartbeat: { code: MessageType.HEART_BEAT.code, token: accessToken, data: "heartbeat" },
          interval: import.meta.env.VITE_API_SERVER_HEARTBEAT,
          protocol: import.meta.env.VITE_API_PROTOCOL_TYPE,
        });
      },
      this.log
    );
  }

  private initEventListeners(): void {
    globalEventBus.on("message:recall", payload => {
      this.stores.message.handleSendRecallMessage(payload);
    });
  }

  // ==================== 后台任务 ====================

  private initBackgroundTasks(): void {
    scheduleIdleTask(async () => {
      this.log.prettyInfo("background", "开始后台任务");

      const firstWave = [this.initDownloadPath(), this.initSystemTray(), this.initShortcuts()];
      const firstResults = await Promise.allSettled(firstWave);
      firstResults.forEach((r, i) => {
        if (r.status === "rejected") this.log.prettyWarn("background", `后台任务(优先) #${i} 失败`, r.reason);
      });

      scheduleIdleTask(() => {
        void this.initImageCache().catch(err => {
          this.log.prettyWarn("image", "图片缓存初始化失败", err);
        });
      }, 200);

      scheduleIdleTask(async () => {
        const secondWave = [this.syncAllData()];
        const secondResults = await Promise.allSettled(secondWave);
        secondResults.forEach((r, i) => {
          if (r.status === "rejected") this.log.prettyWarn("background", `后台任务(延后) #${i} 失败`, r.reason);
        });
        this.log.prettySuccess("background", "后台任务完成");
      }, 500);
    });
  }

  private async initDownloadPath(): Promise<void> {
    if (ObjectUtils.isEmpty(this.stores.setting.file.path)) {
      this.stores.setting.file.path = await downloadDir();
      this.log.prettyInfo("file", "下载目录:", this.stores.setting.file.path);
    }
  }

  private async syncAllData(): Promise<void> {
    return withTiming(
      "sync",
      "用户数据同步",
      () => Promise.all([
        this.syncOfflineMessages(),
        this.syncChatSessions(),
        this.syncFriends(),
      ]).then(() => { }),
      this.log
    );
  }

  private syncFriends(): void {
    const { friend } = this.stores;
    friend.loadNewFriends();
    friend.loadGroups();
    friend.loadContacts();
  }

  private async syncOfflineMessages(): Promise<void> {
    const { singleMessageMapper, groupMessageMapper } = this.mappers;
    const ownerId = this.stores.user.userId;

    const insertConfig = { ownerId, messageType: 0 };

    // 处理私聊消息
    singleMessageMapper.findLastMessage().then(res => {

      const sequence = res?.sequence;
      sequence && api.GetSingleMessageList({ fromId: ownerId, sequence }).then(async res => {

        if (!res || !Array.isArray(res) || res.length === 0) {
          this.log.prettyDebug("message", "无新私聊离线消息");
          return;
        }

        insertConfig.messageType = MessageType.SINGLE_MESSAGE.code;
        await singleMessageMapper.batchInsert(res as any, insertConfig);
        singleMessageMapper.batchInsertFTS5(res as any, insertConfig, 200, this.exec);

        this.log.prettyInfo("message", "私聊离线消息同步成功");
      });

    });

    // 处理群聊消息
    groupMessageMapper.findLastMessage().then(res => {

      const sequence = res?.sequence;

      sequence && api.GetGroupMessageList({ fromId: ownerId, sequence }).then(async res => {

        if (!res || !Array.isArray(res) || res.length === 0) {
          this.log.prettyDebug("message", "无新群聊离线消息");
          return;
        }

        insertConfig.messageType = MessageType.GROUP_MESSAGE.code;
        await groupMessageMapper.batchInsert(res as any, insertConfig);
        groupMessageMapper.batchInsertFTS5(res as any, insertConfig, 200, this.exec);

        this.log.prettyInfo("message", "群聊离线消息同步成功");
      });
    });
  }

  private async syncChatSessions(): Promise<void> {
    const { chatsMapper } = this.mappers;
    const { chat } = this.stores;
    const ownerId = this.stores.user.userId;

    chatsMapper.findLastChat().then(async lastChat => {
      const sequence = lastChat?.[0]?.sequence ?? 0;
      const res: any = await api.GetChatList({ fromId: ownerId, sequence });

      if (Array.isArray(res) && res.length > 0) {
        const transformed = res.map((item: any) => {
          let parsedMessage = item.message;
          try {
            if (typeof item.message === "string" && item.message) {
              parsedMessage = JSON.parse(item.message);
            }
          } catch {
            /* 忽略解析错误 */
          }

          const { messageContentType, ...rest } = item;
          return { ...rest, message: this.formatMessagePreview(parsedMessage, messageContentType) };
        });

        await chatsMapper.batchInsertOrUpdate(transformed);
        chatsMapper.batchInsertOrUpdateFTS(transformed);
      }
      this.log.prettyInfo("chat", "会话同步成功");
    }).catch(async err => {
      this.log.prettyInfo("chat", "会话同步错误", err);
    }).finally(async () => {
      // 重新加载并排序聊天列表
      chat.chatList = await chatsMapper.selectList() ?? [];
      chat.handleSortChatList();
    });
  }

  private async initSystemTray(): Promise<void> {
    const { user, chat, message: messageStore } = this.stores;

    await this.tray.initSystemTray({
      id: "app-tray",
      tooltip: `${import.meta.env.VITE_APP_NAME}: ${user.name}(${user.userId})`,
      icon: "icons/32x32.png",
      empty_icon: "icons/empty.png",
      flashTime: 500,
      menuItems: [
        { id: "open", text: "打开窗口", action: ShowMainWindow },
        { id: "quit", text: "退出", action: () => exit(0) },
      ],
      trayClick: ({ button, buttonState, type }: any) => {
        if (button === "Left" && buttonState === "Up" && type === "Click") {
          ShowMainWindow();
          this.tray.flash(false);
        }
      },
      trayEnter: async ({ position }: any) => {
        const unreadChats = chat.getHaveMessageChat;
        if (unreadChats.length === 0) return;

        showOrCreateNotifyWindow(unreadChats.length, position);

        await this.tauriEvent.onceEventDebounced(
          "notify-win-click",
          async ({ payload }: any) => {
            const item = chat.getChatById(payload?.chatId);
            if (!item) return;

            try {
              router.push("/message");
              await Promise.all([chat.handleChangeCurrentChat(item), messageStore.handleResetMessage()]);
              await ShowMainWindow();
              await Promise.all([
                messageStore.handleGetMessageList(item),
                chat.handleUpdateReadStatus(item),
                hideNotifyWindow(),
              ]);
            } catch (e) {
              this.log.prettyError("tray", "通知点击处理失败", e);
            }
          },
          100
        );
      },
      trayMove: () => { },
      trayLeave: calculateHideNotifyWindow,
    });

    this.log.prettySuccess("tray", "系统托盘初始化成功");
  }

  private async initShortcuts(): Promise<void> {
    useGlobalShortcut([
      {
        name: "screenshot",
        combination: "Ctrl+Shift+M",
        handler: () => {
          this.log.prettyInfo("shortcut", "开启截图");
          CreateScreenWindow(screen.availWidth, screen.availHeight);
        },
      },
    ]).init();

    this.log.prettySuccess("shortcut", "快捷键初始化成功");
  }

  // ==================== 消息处理 ====================

  private handleMessage(res: any): void {
    // 根据消息类型确定优先级
    const priority = this.getMessagePriority(res.code);

    // 使用消息队列 避免消息风暴
    this.messageQueue.push(res, priority).then(async item => {
      const { code, data } = item;

      // 注册相关（静默处理）
      if (code === MessageType.REGISTER_SUCCESS.code || code === MessageType.HEART_BEAT_SUCCESS.code) {
        return;
      }

      if (code === MessageType.REGISTER_FAILED.code) {
        this.log.prettyError("websocket", "注册失败");
        return;
      }

      if (code === MessageType.HEART_BEAT_FAILED.code) {
        this.log.prettyWarn("websocket", "心跳失败");
        return;
      }

      if (!data) return;

      // 认证相关（高优先级已处理）
      if (code === MessageType.FORCE_LOGOUT.code) {
        return this.stores.user.forceLogout(data?.message || "您的账号在其他设备登录");
      }
      if (code === MessageType.LOGIN_EXPIRED.code) {
        return this.stores.user.forceLogout("登录已过期，请重新登录");
      }
      // 刷新Token
      if (code === MessageType.REFRESH_TOKEN.code) {
        return this.stores.user.refreshToken();
      }

      // 聊天消息
      if (code === MessageType.SINGLE_MESSAGE.code || code === MessageType.GROUP_MESSAGE.code) {
        await this.handleChatMessage(code, data);
        return;
      }

      // 视频消息
      if (code === MessageType.VIDEO_MESSAGE.code) {
        this.stores.call.handleCallMessage(data);
      }

      // 群组操作
      if (code === MessageType.GROUP_OPERATION.code) {
        this.stores.group.applyGroupOperation(code, data);
      }

      // 消息操作
      if (code === MessageType.MESSAGE_OPERATION.code) {
        const message = IMessageAction.fromPlain(data);
        this.stores.message.handleReCallMessage(message);
      }
    });
  }

  /** 根据消息类型获取优先级 */
  private getMessagePriority(code: number): number {
    // 紧急：强制登出、登录过期
    if (code === MessageType.FORCE_LOGOUT.code || code === MessageType.LOGIN_EXPIRED.code) {
      return Priority.URGENT;
    }
    // 高优先级：视频通话
    if (code === MessageType.VIDEO_MESSAGE.code) {
      return Priority.HIGH;
    }
    // 低优先级：心跳、注册响应
    if (code === MessageType.HEART_BEAT_SUCCESS.code || code === MessageType.REGISTER_SUCCESS.code) {
      return Priority.LOW;
    }
    // 普通：聊天消息等
    return Priority.NORMAL;
  }

  /**
   * 解析聊天消息的目标会话 ID（私聊取对方 ID，群聊取群 ID）
   */
  private resolveChatTargetId(message: IMessage, code: number): string | number | null {
    if (!message) return null;
    if (code === MessageType.SINGLE_MESSAGE.code) {
      const single = message as IMSingleMessage;
      const myId = this.stores.user.userId;
      return String(single.fromId) === myId ? single.toId : single.fromId;
    }
    if (code === MessageType.GROUP_MESSAGE.code) {
      return (message as IMGroupMessage).groupId;
    }
    return null;
  }

  private async handleChatMessage(code: number, data: any): Promise<void> {
    const { chat, setting, message: messageStore } = this.stores;
    const message = IMessage.fromPlainByType(data);
    if (!message) return;

    const targetId = this.resolveChatTargetId(message, code);
    if (targetId == null) return;

    if (setting.notification.message && (await appIsMinimizedOrHidden())) {
      this.tray.flash(true);
    }

    const existingChat = chat.getChatByToId(targetId);
    chat.handleCreateOrUpdateChat(message, existingChat ?? null);
    messageStore.handleCreateMessage(targetId, message, code);
  }

  // ==================== 工具方法 ====================

  /** 格式化消息预览文本 */
  private formatMessagePreview(messageObj: any, contentType: any): string {
    if (!messageObj || !contentType) return "";
    const code = parseInt(contentType, 10);
    return getMessageDisplayText(code, messageObj);
  }

}

// ==================== 导出 ====================

export function useMainManager(): MainManager {
  return MainManager.getInstance();
}
