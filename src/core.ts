// 常量定义
import { MessageType, MessageContentType } from "@/constants";
// 本地工具和存储
import { storage } from "@/utils/Storage";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useGlobalShortcut } from "./hooks/useGlobalShortcut";
import ObjectUtils from "@/utils/ObjectUtils";
import { downloadDir } from "@tauri-apps/api/path";
import { useTray } from "@/hooks/useTray";
import { exit } from "@tauri-apps/plugin-process";
import { useIdleTaskExecutor } from "@/hooks/useIdleTaskExecutor";
import { globalEventBus } from "@/hooks/useEventBus";
import { initAllCache } from "@/hooks/useImageCache"

// 路由
import router from "@/router";
// 窗口操作
import { CreateScreenWindow } from "@/windows/screen";
import { calculateHideNotifyWindow, hideNotifyWindow, showOrCreateNotifyWindow } from "@/windows/notify";
import { appIsMinimizedOrHidden, ShowMainWindow } from "@/windows/main";
// 数据请求
import api from "@/api/index";
// 配置和初始化
import { useWebSocketWorker } from "@/hooks/useWebSocketWorker";
import { useGlobalScheduler } from "@/hooks/useScheduler";
// 状态管理和数据存储
import { useChatStore } from "@/store/modules/chat";
import { useUserStore } from "@/store/modules/user";
import { useCallStore } from "@/store/modules/call";
import { useSettingStore } from "@/store/modules/setting";
import { useFriendsStore } from "@/store/modules/friends";
// 数据库实体
import { initDatabase, useMappers } from "@/database";
import { IMessage, IMGroupMessage, IMSingleMessage } from "./models";
import { MessageQueue, Priority } from "@/utils/MessageQueue";

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

/** 消息内容类型到显示文本的映射 */
const MESSAGE_DISPLAY_MAP: Record<number, string | ((msg: any) => string)> = {
  [MessageContentType.TEXT.code]: (msg) => msg.message,
  [MessageContentType.IMAGE.code]: "[图片]",
  [MessageContentType.VIDEO.code]: "[视频]",
  [MessageContentType.AUDIO.code]: "[语音]",
  [MessageContentType.FILE.code]: "[文件]",
  [MessageContentType.LOCATION.code]: "[位置]",
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

  // 延迟初始化的依赖
  private readonly log = useLogger();
  private readonly exec = useIdleTaskExecutor({ maxWorkTimePerIdle: 12 });
  private readonly messageQueue = new MessageQueue<any>({
    maxFrameTime: 8,           // 每帧最多 8ms，保证 60fps
    initialBatchSize: 20,      // 初始批大小
    maxBatchSize: 200,         // 高峰期最大批量
    backpressureThreshold: 500, // 背压阈值
    enablePriority: true,      // 启用优先级
  });
  private readonly tray = useTray();
  private readonly tauriEvent = useTauriEvent();

  // Store 实例
  private readonly stores = {
    user: useUserStore(),
    chat: useChatStore(),
    call: useCallStore(),
    setting: useSettingStore(),
    friend: useFriendsStore(),
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

    const t0 = performance.now();
    this.log.prettyInfo("core", "客户端初始化开始");

    try {
      // 1. 语言初始化
      this.initLanguage();

      // 2. 关键路径：串行执行（有依赖关系）
      await this.initUser();
      await this.initDatabase();

      // 3. 并行执行：聊天存储 + WebSocket（无依赖）
      await Promise.all([this.initChatStore()]);

      // 4. WebSocket
      this.initWebSocket();

      // 5. 事件监听
      this.initEventListeners();

      // 6. 后台任务（非阻塞）
      this.initBackgroundTasks();

      // 7. 定时任务
      //this.initScheduler();

      // 8. 图片缓存初始化
      this.initImageCache();

      this.initialized = true;

      this.log.prettySuccess("core", `客户端初始化完成（${Math.round(performance.now() - t0)} ms）`);
    } catch (err) {
      this.log.prettyError("core", "客户端初始化致命错误", err);
      throw err;
    }
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
    // 语言加载（非阻塞）
    Promise.resolve().then(() => {
      this.log.prettyInfo("i18n", "语言初始化完成");
    });
  }

  private initUser(): Promise<void> {
    return withTiming("user", "用户信息初始化", () => this.stores.user.handleGetUserInfo(), this.log);
  }

  private initDatabase(): Promise<void> {
    return withTiming("db", "数据库初始化", () => initDatabase(this.stores.user.userId), this.log);
  }

  private initChatStore(): Promise<void> {
    return withTiming("chat", "聊天存储初始化", () => this.stores.chat.handleInitChat(), this.log);
  }

  private initScheduler() {
    return withTiming("scheduler", "定时任务初始化", () => Promise.resolve().then(() => {
      const scheduler = useGlobalScheduler({
        onTick: ({ taskId, runCount }) => {
          if (taskId === "refresh") {
            this.syncFriends();
          }
        },
        onCompleted: (taskId) => { }
      });

      // 定时刷新任务：每 30 秒执行
      scheduler.startInterval("refresh", 30000, { immediate: true });
    }), this.log);
  }

  initImageCache() {
    return withTiming("image", "图片缓存初始化", () => initAllCache(this.stores.user.userId), this.log);
  }

  /**
  * 初始化 WebSocket 连接。
  * - 先注册消息处理回调，再建立连接。
  * - 添加用户认证参数。
  */
  private async initWebSocket(): Promise<void> {
    return withTiming(
      "ws",
      "WebSocket初始化",
      async () => {

        const { userId, token } = this.stores.user;
        const url = new URL(import.meta.env.VITE_API_SERVER_WS);
        url.searchParams.append("uid", userId);
        url.searchParams.append("token", token);

        onMessage((e: any) => {
          this.log.prettyInfo("websocket", "收到 WebSocket 消息:", e);
          this.handleMessage(e);
        });

        connect(url.toString(), {
          payload: {
            code: MessageType.REGISTER.code,
            token: token,
            data: "registrar",
            deviceType: import.meta.env.VITE_DEVICE_TYPE
          },
          heartbeat: { code: MessageType.HEART_BEAT.code, token: token, data: "heartbeat" },
          interval: import.meta.env.VITE_API_SERVER_HEARTBEAT,
          protocol: import.meta.env.VITE_API_PROTOCOL_TYPE
        });
      },
      this.log
    );
  }

  private initEventListeners(): void {
    globalEventBus.on("message:recall", (payload) => {
      this.stores.chat.handleSendRecallMessage(payload);
    });
  }

  // ==================== 后台任务 ====================

  private initBackgroundTasks(): void {
    scheduleIdleTask(async () => {
      this.log.prettyInfo("background", "开始后台任务");

      const tasks = [
        this.initDownloadPath(),
        this.syncAllData(),
        this.initSystemTray(),
        this.initShortcuts(),
      ];

      const results = await Promise.allSettled(tasks);
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          this.log.prettyWarn("background", `后台任务 #${i} 失败`, r.reason);
        }
      });

      this.log.prettySuccess("background", "后台任务完成");
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
      () =>
        Promise.all([
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
    const { chatsMapper, singleMessageMapper, groupMessageMapper } = this.mappers;
    const ownerId = storage.get("userId");

    const chats = await chatsMapper.findLastChat();
    const sequence = chats?.[0]?.sequence || 0;
    const res: any = await api.GetMessageList({ fromId: ownerId, sequence });

    if (!res) {
      this.log.prettyInfo("message", "无新离线消息");
      return;
    }

    const insertConfig = { ownerId, messageType: 0 };

    // 处理私聊消息
    const singleMsgs = res[MessageType.SINGLE_MESSAGE.code];
    if (singleMsgs) {
      insertConfig.messageType = MessageType.SINGLE_MESSAGE.code;
      await singleMessageMapper.batchInsert(singleMsgs, insertConfig);
      singleMessageMapper.batchInsertFTS5(singleMsgs, insertConfig, 200, this.exec);
    }

    // 处理群聊消息
    const groupMsgs = res[MessageType.GROUP_MESSAGE.code];
    if (groupMsgs) {
      insertConfig.messageType = MessageType.GROUP_MESSAGE.code;
      await groupMessageMapper.batchInsert(groupMsgs, insertConfig);
      groupMessageMapper.batchInsertFTS5(groupMsgs, insertConfig, 200, this.exec);
    }

    this.log.prettyInfo("message", "离线消息同步成功");
  }

  private async syncChatSessions(): Promise<void> {
    const { chatsMapper } = this.mappers;
    const { chat } = this.stores;

    try {
      const lastChats = await chatsMapper.findLastChat();
      const sequence = lastChats?.[0]?.sequence ?? 0;
      const res: any = await api.GetChatList({ fromId: storage.get("userId"), sequence });

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

        await chatsMapper.batchInsert(transformed);
        chatsMapper.batchInsertFTS5(transformed, undefined, 200, this.exec);
      }

      const list: any = await chatsMapper.selectList();
      chat.handleSortChatList(list);
      this.log.prettyInfo("chat", "会话同步成功");
    } catch (err) {
      // 失败时仍加载本地数据
      const list: any = await chatsMapper.selectList();
      chat.handleSortChatList(list);
      throw err;
    }
  }

  private async initSystemTray(): Promise<void> {
    const { user, chat } = this.stores;

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
              await Promise.all([chat.handleChangeCurrentChat(item), chat.handleResetMessage()]);
              await ShowMainWindow();
              await Promise.all([
                chat.handleGetMessageList(item),
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

    this.messageQueue.push(res, priority).then(async (item) => {
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

      // 认证相关（高优先级已处理）
      if (code === MessageType.FORCE_LOGOUT.code) {
        return this.stores.user.forceLogout(data?.message || "您的账号在其他设备登录");
      }
      if (code === MessageType.LOGIN_EXPIRED.code) {
        return this.stores.user.forceLogout("登录已过期，请重新登录");
      }
      if (code === MessageType.REFRESH_TOKEN.code) {
        return this.stores.user.refreshToken();
      }

      if (!data) return;

      // 聊天消息
      if (code === MessageType.SINGLE_MESSAGE.code || code === MessageType.GROUP_MESSAGE.code) {
        await this.handleChatMessage(code, data);
        return;
      }

      // 视频消息
      if (code === MessageType.VIDEO_MESSAGE.code) {
        this.stores.call.handleCallMessage(data);
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

  private async handleChatMessage(code: number, data: any): Promise<void> {
    const { chat, setting } = this.stores;

    // 撤回消息
    if (data?.actionType === 1) {
      chat.handleReCallMessage(data);
      return;
    }

    const message = IMessage.fromPlainByType(data);
    const chatId =
      code === MessageType.SINGLE_MESSAGE.code
        ? (message as IMSingleMessage).fromId
        : (message as IMGroupMessage).groupId;

    // 新消息通知
    if (setting.notification.message && message && (await appIsMinimizedOrHidden())) {
      this.tray.flash(true);
    }

    chat.handleCreateOrUpdateChat(message, chatId);
    chat.handleCreateMessage(chatId, message, code);
  }

  // ==================== 工具方法 ====================

  /** 格式化消息预览文本 */
  private formatMessagePreview(messageObj: any, contentType: any): string {
    if (!messageObj || !contentType) return "";

    const code = parseInt(contentType);
    const formatter = MESSAGE_DISPLAY_MAP[code];

    if (typeof formatter === "function") {
      return formatter(messageObj);
    }
    return formatter ?? "未知消息类型";
  }
}

// ==================== 导出 ====================

export function useMainManager(): MainManager {
  return MainManager.getInstance();
}
