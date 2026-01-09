// 常量定义
import { IMessageType, MessageContentType } from "@/constants";
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
// import { useUpdate } from "@/hooks/useUpdate"
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
//import loadWorker from "@/worker/LoadWorker";
// 状态管理和数据存储
import { useChatStore } from "@/store/modules/chat";
import { useUserStore } from "@/store/modules/user";
import { useCallStore } from "@/store/modules/call";
import { useSettingStore } from "@/store/modules/setting";
import { useFriendsStore } from "@/store/modules/friends";
// 数据库实体
import { initDatabase, useMappers } from "@/database";
import { IMessage, IMGroupMessage, IMSingleMessage } from "./models";
import { MessageQueue } from "./utils/MessageQueue";
import { AudioEnum } from "./hooks/useAudioPlayer";
// 获取和初始化数据库操作
const { chatsMapper, singleMessageMapper, groupMessageMapper, friendsMapper } = useMappers();
// 状态管理实例
const callStore = useCallStore();
const chatMessageStore = useChatStore();
const userStore = useUserStore();
const settingStore = useSettingStore();
const friendStore = useFriendsStore();
// 系统托盘
const { initSystemTray, flash } = useTray();
// 事件总线
const { onceEventDebounced } = useTauriEvent();
// 日志
const log = useLogger();
const { connect, disconnect, onMessage } = useWebSocketWorker();
// 异步（空闲）任务执行器
const exec = useIdleTaskExecutor({ maxWorkTimePerIdle: 12 });
// 消息队列 用于 削峰填谷
const messageQueue = new MessageQueue<any>();
// const { fetchVersion } = useUpdate();

/**
 * 客户端主初始化管理器
 * - 负责初始化客户端的关键路径（用户、数据库、聊天存储、WebSocket）。
 * - 异步执行后台任务（如数据同步、托盘、快捷键）。
 * - 提供启动、停止和清理方法。
 */
class MainManager {
  private static instance: MainManager;
  private backgroundTasksRunning = false;

  private constructor() { }

  /**
   * 获取 MainManager 单例实例。
   * @returns {MainManager} 单例实例。
   */
  public static getInstance(): MainManager {
    if (!MainManager.instance) {
      MainManager.instance = new MainManager();
    }
    return MainManager.instance;
  }

  /* ---------------------- 客户端主初始化入口 ---------------------- */

  /**
   * 初始化客户端（主入口）。
   * - 仅等待关键路径初始化（用户信息、数据库、聊天存储、WebSocket）。
   * - 后台任务（如数据同步、托盘、快捷键）异步执行。
   * - 初始化顺序：语言 > 用户 > 数据库 > 聊天存储 > WebSocket > 事件监听 > 后台任务。
   */
  async initClient() {
    const t0 = performance.now();
    log.prettyInfo("core", "客户端初始化开始");

    try {
      // 1. 启动语言加载
      this.initLanguage().catch(err => log.prettyWarn("init", "语言初始化失败（非致命）", err));

      // 2. 获取用户信息
      await this.initUser();

      // 3. 初始化数据库
      await this.initDatabase();

      // 4. 本地聊天存储初始化
      await this.initChatStore();

      // 5. 初始化 WebSocket
      await this.initWebSocket();

      // 6. 初始化事件监听。
      this.initEventListeners();

      // 7. 启动后台任务 数据库同步、托盘等
      this.runBackgroundTasks().catch(err => log.prettyError("core", "后台任务启动失败（非致命）", err));

      const t1 = performance.now();
      log.prettySuccess("core", `客户端关键路径初始化完成（${Math.round(t1 - t0)} ms）`);
    } catch (err) {
      log.prettyError("core", "客户端初始化致命错误", err);
    }
  }

  /* ---------------------- 关键路径子任务 ---------------------- */

  /**
   * 初始化语言设置。
   * - 加载国际化资源（如果存在）。
   */
  async initLanguage() {
    const t0 = performance.now();
    // 示例：await loadI18n(); // 如果有实际加载逻辑。
    const t1 = performance.now();
    log.prettyInfo("i18n", `语言初始化完成（${Math.round(t1 - t0)} ms）`);
  }

  /**
   * 初始化用户信息。
   * - 从存储或 API 获取用户数据。
   * - 失败时抛出错误（关键路径）。
   */
  private async initUser() {
    const t0 = performance.now();
    try {
      await userStore.handleGetUserInfo();
      log.prettySuccess("user", "用户信息初始化成功");
    } catch (err) {
      log.prettyError("user", "用户信息初始化失败", err);
      throw err;
    } finally {
      const t1 = performance.now();
      log.prettyInfo("user", `用户信息初始化耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /**
   * 初始化数据库。
   * - 使用用户 ID 初始化数据库连接。
   */
  private async initDatabase() {
    await initDatabase(userStore.userId);
  }

  /**
   * 初始化聊天存储。
   * - 处理本地聊天会话初始化。
   */
  async initChatStore() {
    const t0 = performance.now();
    try {
      await chatMessageStore.handleInitChat();
      log.prettySuccess("chat", "本地聊天存储初始化成功");
    } catch (err) {
      log.prettyError("chat", "本地聊天存储初始化失败", err);
      throw err;
    } finally {
      const t1 = performance.now();
      log.prettyInfo("chat", `聊天存储初始化耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /**
   * 初始化 WebSocket 连接。
   * - 先注册消息处理回调，再建立连接。
   * - 添加用户认证参数。
   */
  async initWebSocket() {
    const t0 = performance.now();
    try {
      const url = new URL(import.meta.env.VITE_API_SERVER_WS);
      url.searchParams.append("uid", userStore.userId);
      url.searchParams.append("token", userStore.token);

      onMessage((e: any) => {
        try {
          log.prettyInfo("websocket", "收到 WebSocket 消息:", e);
          this.handleWebSocketMessage(e);
        } catch (err) {
          log.prettyError("websocket", "处理 WebSocket 消息异常", err);
        }
      });

      connect(url.toString(), {
        payload: {
          code: 1000,
          token: userStore.token,
          data: "registrar",
          deviceType: import.meta.env.VITE_DEVICE_TYPE
        },
        heartbeat: { code: 1001, token: userStore.token, data: "heartbeat" },
        interval: import.meta.env.VITE_API_SERVER_HEARTBEAT,
        protocol: import.meta.env.VITE_API_PROTOCOL_TYPE
      });

      log.prettySuccess("websocket", "WebSocket 连接成功");
    } catch (err) {
      log.prettyError("websocket", "WebSocket 连接失败", err);
      throw err;
    } finally {
      const t1 = performance.now();
      log.prettyInfo("websocket", `WebSocket 初始化耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /**
   * 初始化事件监听。
   * - 监听全局事件，如消息撤回。
   */
  initEventListeners() {
    globalEventBus.on("message:recall", payload => {
      chatMessageStore.handleSendRecallMessage(payload);
    });
  }

  /* ---------------------- 后台任务子任务 ---------------------- */

  /**
   * 启动后台初始化任务。
   * - 使用 requestIdleCallback 或 setTimeout 延迟执行，避免阻塞主线程。
   * - 任务包括：文件下载目录、用户数据同步、托盘、快捷键。
   */
  private async runBackgroundTasks() {
    if (this.backgroundTasksRunning) return;
    this.backgroundTasksRunning = true;

    const executeTasks = async () => {
      log.prettyInfo("background", "开始后台初始化任务");

      const tasks = [
        this.initFileDownloadPath(),
        this.syncUserData(),
        this.initSystemTrayMenu(),
        this.initGlobalShortcuts()
      ];

      const results = await Promise.allSettled(tasks);
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          log.prettyWarn("background", `后台任务 #${index} 失败（非致命）`, result.reason);
        }
      });

      log.prettySuccess("background", "后台初始化任务完成");
    };

    if (typeof (window as any).requestIdleCallback === "function") {
      (window as any).requestIdleCallback(executeTasks);
    } else {
      setTimeout(executeTasks, 50);
    }
  }

  /**
   * 初始化文件下载目录。
   * - 如果未设置，使用系统默认下载目录。
   */
  async initFileDownloadPath() {
    const t0 = performance.now();
    try {
      if (ObjectUtils.isEmpty(settingStore.file.path)) {
        settingStore.file.path = await downloadDir();
        log.prettyInfo("file", "下载目录初始化为", settingStore.file.path);
      } else {
        log.prettyInfo("file", "已存在下载目录设置", settingStore.file.path);
      }
    } catch (err) {
      log.prettyWarn("file", "下载目录初始化失败（使用默认）", err);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("file", `下载目录初始化耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /**
   * 同步用户数据。
   * - 并行同步消息、会话和好友数据。
   */
  async syncUserData() {
    const t0 = performance.now();
    try {
      await Promise.all([this.syncOfflineMessages(), this.syncChatSessions(), this.syncFriends()]);
     
      log.prettySuccess("sync", "用户数据同步完成");
    } catch (err) {
      log.prettyError("sync", "用户数据同步失败", err);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("sync", `用户数据同步耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /**
   * 更新好友
   */
  syncFriends() {
    friendStore.loadNewFriends();
  }

  /**
   * 同步离线消息数据。
   * - 从 API 获取并插入数据库。
   */
  async syncOfflineMessages() {
    const t0 = performance.now();
    try {
      const chats = await chatsMapper.findLastChat();
      const sequence = chats?.[0]?.sequence || 0;
      const formData = { fromId: storage.get("userId"), sequence };
      const res: any = await api.GetMessageList(formData);

      if (!res) {
        log.prettyInfo("message", "无新离线消息");
        return;
      }

      if (res[IMessageType.SINGLE_MESSAGE.code]) {
        await singleMessageMapper.batchInsert(res[IMessageType.SINGLE_MESSAGE.code], {
          ownerId: storage.get("userId"),
          messageType: IMessageType.SINGLE_MESSAGE.code
        });
        singleMessageMapper.batchInsertFTS5(
          res[IMessageType.SINGLE_MESSAGE.code],
          {
            ownerId: storage.get("userId"),
            messageType: IMessageType.SINGLE_MESSAGE.code
          },
          200,
          exec
        );
      }

      if (res[IMessageType.GROUP_MESSAGE.code]) {
        await groupMessageMapper.batchInsert(res[IMessageType.GROUP_MESSAGE.code], {
          ownerId: storage.get("userId"),
          messageType: IMessageType.GROUP_MESSAGE.code
        });
        groupMessageMapper.batchInsertFTS5(
          res[IMessageType.GROUP_MESSAGE.code],
          {
            ownerId: storage.get("userId"),
            messageType: IMessageType.GROUP_MESSAGE.code
          },
          200,
          exec
        );
      }

      log.prettyInfo("message", "离线消息更新成功");
    } catch (err) {
      log.prettyError("message", "离线消息更新失败", err);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("message", `离线消息同步耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /**
   * 同步聊天会话数据。
   * - 从 API 获取并更新本地会话列表。
   */
  async syncChatSessions() {
    const t0 = performance.now();
    try {
      const lastChats = await chatsMapper.findLastChat();
      const sequence = lastChats?.[0]?.sequence ?? 0;
      const res: any = await api.GetChatList({
        fromId: storage.get("userId"),
        sequence
      });

      if (Array.isArray(res) && res.length > 0) {
        const transformed = res.map((chat: any) => {
          let parsedMessage: any = chat.message;
          try {
            if (typeof chat.message === "string" && chat.message.length > 0) {
              parsedMessage = JSON.parse(chat.message);
            }
          } catch {
            parsedMessage = chat.message;
          }
          const message = this.getMessageBodyByType(parsedMessage, chat.messageContentType);
          const newChat: Record<string, any> = { ...chat, message };
          delete newChat.messageContentType;
          return newChat;
        });

        await chatsMapper.batchInsert(transformed);
        chatsMapper.batchInsertFTS5(transformed, undefined, 200, exec);

        const list: any = await chatsMapper.selectList();
        chatMessageStore.handleSortChatList(list);
        log.prettyInfo("chat", "会话数据更新成功");
      } else {
        const list: any = await chatsMapper.selectList();
        chatMessageStore.handleSortChatList(list);
        log.prettyInfo("chat", "会话无新数据，使用本地列表");
      }
    } catch (err) {
      log.prettyError("chat", "会话数据更新失败", err);
      const list: any = await chatsMapper.selectList();
      chatMessageStore.handleSortChatList(list);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("chat", `会话同步耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /**
   * 根据消息类型获取消息体文本。
   * - 用于替换消息内容为可显示的字符串。
   * @param {any} messageObj 消息对象。
   * @param {any} messageContentType 消息内容类型。
   * @returns {string} 替换后的消息体。
   */
  getMessageBodyByType(messageObj: any, messageContentType: any): string {
    const code = parseInt(messageContentType);
    if (!messageObj || !messageContentType) return "";

    switch (code) {
      case MessageContentType.TEXT.code:
        return messageObj.message;
      case MessageContentType.IMAGE.code:
        return "[图片]";
      case MessageContentType.VIDEO.code:
        return "[视频]";
      case MessageContentType.AUDIO.code:
        return "[语音]";
      case MessageContentType.FILE.code:
        return "[文件]";
      case MessageContentType.LOCAL.code:
        return "[位置]";
      default:
        return "未知消息类型";
    }
  }

  /**
   * 初始化系统托盘菜单。
   * - 配置托盘图标、菜单和事件处理。
   */
  async initSystemTrayMenu() {
    const t0 = performance.now();
    try {
      await initSystemTray({
        id: "app-tray",
        tooltip: `${import.meta.env.VITE_APP_NAME}: ${userStore.name}(${userStore.userId})`,
        icon: "icons/32x32.png",
        empty_icon: "icons/empty.png",
        flashTime: 500,
        menuItems: [
          { id: "open", text: "打开窗口", action: () => ShowMainWindow() },
          {
            id: "quit",
            text: "退出",
            action: async () => {
              await exit(0);
            }
          }
        ],
        trayClick: (event: any) => {
          const { button, buttonState, type } = event;
          if (button === "Left" && buttonState === "Up" && type === "Click") {
            log.prettyInfo("tray", "鼠标左键点击打开主窗口");
            ShowMainWindow();
            flash(false);
          }
        },
        trayEnter: async ({ position }) => {
          const chatCount = chatMessageStore.getHaveMessageChat.length;
          if (chatCount > 0) {
            showOrCreateNotifyWindow(chatCount, position);
            await onceEventDebounced(
              "notify-win-click",
              async ({ payload }: any) => {
                if (!payload?.chatId) return;
                const item = chatMessageStore.getChatById(payload.chatId);
                if (!item) return;
                log.prettyInfo("tray", `通知窗口点击：切换到会话 ${item.chatId}`);
                try {
                  router.push("/message");
                  await Promise.all([chatMessageStore.handleChangeCurrentChat(item), chatMessageStore.handleResetMessage()]);
                  await ShowMainWindow();
                  await Promise.all([
                    chatMessageStore.handleGetMessageList(item),
                    chatMessageStore.handleUpdateReadStatus(item),
                    hideNotifyWindow()
                  ]);
                } catch (e) {
                  log.prettyError("tray", "通知点击处理失败", e);
                }
              },
              100
            );
          }
        },
        trayMove: () => { },
        trayLeave: (event: any) => {
          log.prettyInfo("tray", "鼠标移出关闭窗口", event);
          calculateHideNotifyWindow(event);
        }
      });
      log.prettySuccess("tray", "系统托盘初始化成功");
    } catch (err) {
      log.prettyError("tray", "系统托盘初始化失败", err);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("tray", `系统托盘初始化耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /**
   * 初始化全局快捷键。
   * - 注册截图等快捷键。
   */
  async initGlobalShortcuts() {
    const t0 = performance.now();
    try {
      useGlobalShortcut([
        {
          name: "screenshot",
          combination: "Ctrl+Shift+M",
          handler: () => {
            log.prettyInfo("shortcut", "开启截图");
            CreateScreenWindow(screen.availWidth, screen.availHeight);
          }
        }
      ]).init();
      log.prettySuccess("shortcut", "全局快捷键初始化成功");
    } catch (err) {
      log.prettyError("shortcut", "全局快捷键初始化失败", err);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("shortcut", `全局快捷键初始化耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /* ---------------------- WebSocket 消息处理 ---------------------- */

  /**
   * 处理 WebSocket 收到的消息。
   * - 使用消息队列处理以实现削峰填谷。
   * @param {any} res 收到的消息数据。
   */
  handleWebSocketMessage(res: any) {
    messageQueue.push(res).then(async item => {
      const { code, data } = item;

      // 处理强制下线
      if (code === IMessageType.FORCE_LOGOUT.code) {
        log.prettyWarn("websocket", "收到强制下线通知");
        await userStore.forceLogout(data?.message || "您的账号在其他设备登录");
        return;
      }

      // 处理登录过期
      if (code === IMessageType.LOGIN_OVER.code) {
        log.prettyWarn("websocket", "登录已过期");
        await userStore.forceLogout("登录已过期，请重新登录");
        return;
      }

      if (!data) return;

      if (code === IMessageType.SINGLE_MESSAGE.code || code === IMessageType.GROUP_MESSAGE.code) {
        if (data?.actionType == 1) {
          chatMessageStore.handleReCallMessage(data);
        } else {
          const message = IMessage.fromPlainByType(data);
          const id =
            code === IMessageType.SINGLE_MESSAGE.code
              ? (message as IMSingleMessage).fromId
              : (message as IMGroupMessage).groupId;

          if (settingStore.notification.message && message) {
            if (await appIsMinimizedOrHidden()) {
              flash(true);
            }
          }

          chatMessageStore.handleCreateOrUpdateChat(message, id);
          chatMessageStore.handleCreateMessage(id, message, code);
        }
      }

      if (code === IMessageType.VIDEO_MESSAGE.code) {
        callStore.handleCallMessage(data);
      }

      if (code === IMessageType.REFRESHTOKEN.code) {
        userStore.refreshToken();
      }
    });
  }

  /* ---------------------- 清理和销毁 ---------------------- */

  /**
   * 销毁管理器资源。
   * - 断开 WebSocket 等连接。
   */
  async destroy() {
    log.prettyInfo("core", "开始清理 MainManager 资源");
    try {
      disconnect();
      log.prettySuccess("core", "资源清理完成");
    } catch (err) {
      log.prettyError("core", "资源清理失败", err);
    }
  }
}

/** Hook: 获取 MainManager 实例。 */
export function useMainManager() {
  return MainManager.getInstance();
}