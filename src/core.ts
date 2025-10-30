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
import { useChatMainStore } from "@/store/modules/chat";
import { useMessageStore } from "@/store/modules/message";
import { useUserStore } from "@/store/modules/user";
import { useCallStore } from "@/store/modules/call";
import { useSettingStore } from "@/store/modules/setting";
import { useFriendsStore } from "@/store/modules/friends";

// 数据库实体
import { useMappers } from "@/database";
import { IMessage, IMGroupMessage, IMSingleMessage } from "./models";
import { MessageQueue } from "./utils/MessageQueue";
import { AudioEnum } from "./hooks/useAudioPlayer";

// 获取和初始化数据库操作
const { chatsMapper, singleMessageMapper, groupMessageMapper, friendsMapper } = useMappers();

// 状态管理实例
const callStore = useCallStore();
const chatStore = useChatMainStore();
const userStore = useUserStore();
const messageStore = useMessageStore();
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

// 消息队列  用于 削峰填谷
const messageQueue = new MessageQueue<any>();

// const { fetchVersion } = useUpdate();

/**
 *
 * - 将初始化拆分为：关键路径（Sync）+ 后台任务（Idle）
 * - 提供 start/stop/cleanup
 */
class MainManager {
  private static instance: MainManager;

  private backgroundTasksRunning = false;

  private constructor() {}

  public static getInstance(): MainManager {
    if (!MainManager.instance) {
      MainManager.instance = new MainManager();
    }
    return MainManager.instance;
  }

  /**
   * 启动客户端（主入口）
   * - 仅等待关键初始化（用户信息、chat store、WebSocket 注册）
   * - 其它耗时/可延后任务放到后台执行
   */
  async initClient() {
    const t0 = performance.now();
    log.prettyInfo("core", "客户端初始化开始");

    try {
      // 1) 启动语言加载（轻量，可并行）
      this.initLanguage().catch(err => log.prettyWarn("init", "initLanguage failed (non-fatal)", err));

      // 2) 获取用户信息 —— **关键路径**（必须完成以便后续鉴权）
      await this.initUserSafe();

      // 3) 本地会话初始化（快速，本地操作）
      this.initChatStore().catch(err => log.prettyError("core", "initChatStore 失败（非致命）", err));

      // 4) 启动后台任务（数据库、离线同步、托盘、快捷键等）
      this.runBackgroundInit().catch(err => log.prettyError("core", "runBackgroundInit 失败（非致命）", err));

      // 5) 初始化 WebSocket（注册 onMessage -> 再 connect）
      await this.initWebSocketSafe();

      this.initListen();

      const t1 = performance.now();

      log.prettySuccess("core", `客户端关键路径初始化完成（${Math.round(t1 - t0)} ms）`);
    } catch (err) {
      log.prettyError("core", "initClient 致命错误", err);
    }
  }

  /* ---------------------- 关键子任务（可被单独调用） ---------------------- */

  /** 初始化语言（轻量） */
  async initLanguage() {
    const t0 = performance.now();
    // 如果有语言加载逻辑放这里（示例用注释）
    // await loadI18n();
    const t1 = performance.now();
    log.prettyInfo("i18n", `语言初始化完成（${Math.round(t1 - t0)} ms）`);
  }

  /** 初始化会话（本地） */
  async initChatStore() {
    const t0 = performance.now();
    try {
      await chatStore.handleInit();
      log.prettySuccess("user", "本地会话初始化成功");
    } catch (err) {
      log.prettyError("user", "本地会话初始化失败", err);
      throw err; // 关键路径失败需要抛出
    } finally {
      const t1 = performance.now();
      log.prettyInfo("user", `initChat 耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  initListen() {
    globalEventBus.on("message:recall", payload => {
      messageStore.handleSendRecallMessage(payload);
    });
  }

  /**
   * 初始化 WebSocket：先注册 onMessage，再发起 connect（确保不会漏消息）
   *
   */
  async initWebSocketSafe() {
    const t0 = performance.now();
    try {
      const url = new URL(import.meta.env.VITE_API_SERVER_WS);

      // 添加用户id 和 token 用于 用户鉴权
      url.searchParams.append("uid", userStore.userId);
      url.searchParams.append("token", userStore.token);

      onMessage((e: any) => {
        try {
          log.prettyInfo("websocket", "收到 ws 消息:", e);
          this.handleWebSocketMessage(e);
        } catch (err) {
          log.prettyError("websocket", "处理 ws 消息时抛出异常", err);
        }
      });

      // 发起连接
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

      log.prettySuccess("websocket", "WebSocket连接成功");
    } catch (err) {
      log.prettyError("websocket", "WebSocket连接失败", err);
      throw err; // 关键路径，考虑失败重试或上报
    } finally {
      const t1 = performance.now();
      log.prettyInfo("websocket", `initWebSocket 耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /** 初始化文件下载目录（如果未配置） */
  async initFileDownload() {
    const t0 = performance.now();
    try {
      if (ObjectUtils.isEmpty(settingStore.file.path)) {
        settingStore.file.path = await downloadDir();
        log.prettyInfo("file", "下载目录初始化为", settingStore.file.path);
      } else {
        log.prettyInfo("file", "已存在下载目录设置", settingStore.file.path);
      }
    } catch (err) {
      log.prettyWarn("file", "初始化下载目录失败（使用默认或稍后重试）", err);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("file", `initFileDownload 耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /* ---------------------- 后台初始化（空闲时执行） ---------------------- */

  /** 初始化数据库（FTS 等） */
  async initDatabase() {
    const t0 = performance.now();
    try {
      await Promise.all([
        chatsMapper.createFTSTable(),
        singleMessageMapper.createFTSTable(),
        groupMessageMapper.createFTSTable(),
        friendsMapper.createFTSTable()
      ]);
      log.prettySuccess("database", "数据库 FTS 表初始化成功");
    } catch (err) {
      log.prettyError("database", "数据库初始化失败（可重试）", err);
      // 不抛出：数据库失败不应阻塞 UI 启动
    } finally {
      const t1 = performance.now();
      log.prettyInfo("database", `initDatabase 耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /* ---------------------- 各项实现（可单独调用） ---------------------- */

  /** 同步用户数据（离线消息、会话、好友）——耗时，置于后台 */
  async syncUserData() {
    const t0 = performance.now();
    try {
      // 并行拉取消息与会话（由你原来的实现组成）
      // 注意：updateMessageData 与 updateChatData 各自内部包含 DB 操作（可能耗时）
      await Promise.all([this.updateMessageData(), this.updateChatData()]);
      // 好友信息稍后刷新（非阻塞）
      friendStore.loadNewFriends();
      log.prettySuccess("sync", "用户数据同步完成");
    } catch (err) {
      log.prettyError("sync", "同步用户数据失败（可重试）", err);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("sync", `syncUserData 耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /** 获取并更新离线消息数据（保留原实现，但加上错误隔离） */
  async updateMessageData() {
    const t0 = performance.now();
    try {
      const chats = await chatsMapper.findLastChat();
      const sequence = chats?.[0]?.sequence || 0;
      const formData = { fromId: storage.get("userId"), sequence };

      const res: any = await api.GetMessageList(formData);
      if (!res) {
        log.prettyInfo("core", "GetMessageList 无新数据");
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

      log.prettyInfo("core", "消息数据更新成功");
    } catch (err) {
      log.prettyError("core", "更新离线消息失败", err);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("core", `updateMessageData 耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /** 获取并更新会话数据（保留原实现并加日志/错误隔离） */
  async updateChatData() {
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
          const message = this.replaceMessageBody(parsedMessage, chat.messageContentType);
          const newChat: Record<string, any> = { ...chat, message };
          delete newChat.messageContentType;
          return newChat;
        });

        try {
          await chatsMapper.batchInsert(transformed);
          chatsMapper.batchInsertFTS5(transformed, undefined, 200, exec);
          log.prettyInfo("core", `批量插入 ${transformed.length} 条会话到 FTS`);
        } catch (batchErr) {
          log.prettyWarn("core", "batchInsertFTS5 失败，降级到逐条插入", batchErr);
          for (const item of transformed) {
            try {
              await chatsMapper.insertOrUpdate(item);
            } catch (singleErr) {
              log.prettyError("core", "单条插入失败，忽略并继续", singleErr);
            }
          }
        }

        const list: any = await chatsMapper.selectList();
        chatStore.handleSortChatList(list);
        log.prettyInfo("core", "会话数据批量更新成功");
      } else {
        const list: any = await chatsMapper.selectList();
        chatStore.handleSortChatList(list);
        log.prettyInfo("core", "会话无新数据，使用本地列表排序");
      }
    } catch (err) {
      log.prettyError("core", "更新会话数据失败", err);
      const list: any = await chatsMapper.selectList();
      chatStore.handleSortChatList(list);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("core", `updateChatData 耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /** 更新好友数据（后台） */
  async updateFriendData() {
    const t0 = performance.now();
    try {
      const res: any = await api.GetContacts({ userId: storage.get("userId") });
      if (res && res.length > 0) {
        await friendsMapper.deleteById(storage.get("userId"));
        await friendsMapper.batchInsert(res);
        log.prettyInfo("core", "好友数据更新成功");
      }
    } catch (err) {
      log.prettyError("core", "更新好友数据失败", err);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("core", `updateFriendData 耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /** 根据消息类型返回替代文本（保留并简化原逻辑） */
  replaceMessageBody(messageObj: any, messageContentType: any) {
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

  /** 初始化快捷键（后台执行） */
  async initShortcut() {
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
      log.prettySuccess("shortcut", "初始化快捷键成功");
    } catch (err) {
      log.prettyError("shortcut", "快捷键初始化失败", err);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("shortcut", `initShortcut 耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /* ---------------------- 其它小工具 & UI 功能 ---------------------- */

  /**
   * 初始化系统托盘（后台执行）
   * - 配置托盘图标、菜单、事件（点击/悬浮）
   * - 优化通知窗口点击响应速度：并行加载会话数据，延迟非关键操作
   */
  async initTray() {
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
            log.prettyInfo("tray", "鼠标左键点击抬起 打开主窗口");
            ShowMainWindow();
            flash(false);
          }
        },
        trayEnter: async ({ position }) => {
          // 托盘悬浮：显示通知窗口（如果有未读消息）
          const chatCount = chatStore.getHaveMessageChat.length;
          if (chatCount > 0) {
            showOrCreateNotifyWindow(chatCount, position);
            // 监听通知窗口点击
            await onceEventDebounced(
              "notify-win-click",
              async ({ payload }: any) => {
                if (!payload?.chatId) return;
                const item = chatStore.getChatById(payload.chatId);
                if (!item) return;
                log.prettyInfo("tray", `通知窗口点击：切换到会话 ${item.id}`);
                try {
                  // 切换路由
                  router.push("/message");
                  // 并行执行关键操作
                  await Promise.all([chatStore.handleChangeCurrentChat(item), messageStore.handleReset()]);
                  // 优先显示主窗口
                  await ShowMainWindow();
                  await Promise.all([
                    messageStore.handleGetMessageList(item),
                    chatStore.handleUpdateReadStatus(item),
                    hideNotifyWindow()
                  ]);
                } catch (e) {
                  log.prettyError("tray", "处理通知点击失败", e);
                }
              },
              100
            ); // 降低防抖时间到 100ms，提升响应速度
          }
        },
        trayMove: () => {},
        trayLeave: (event: any) => {
          log.prettyInfo("tray", "鼠标移出关闭窗口", event);
          calculateHideNotifyWindow(event);
        }
      });
      log.prettySuccess("tray", "系统托盘初始化成功");
    } catch (err) {
      log.prettyError("tray", "初始化系统托盘失败（可忽略）", err);
    } finally {
      const t1 = performance.now();
      log.prettyInfo("tray", `initTray 耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /**
   *  处理WebSocket收到的消息
   *  @param data
   */
  handleWebSocketMessage(res: any) {
    messageQueue.push(res).then(async item => {
      const { code, data } = item;
      if (!data) return;
      if (code === IMessageType.SINGLE_MESSAGE.code || code === IMessageType.GROUP_MESSAGE.code) {
        // 处理消息
        if (data?.actionType == 1) {
          messageStore.handleReCallMessage(data);
        } else {
          // 处理消息
          const message = IMessage.fromPlainByType(data);
          const id =
            code === IMessageType.SINGLE_MESSAGE.code
              ? (message as IMSingleMessage).fromId
              : (message as IMGroupMessage).groupId;

          if (settingStore.notification.message && message) {
            // 窗口最小化时，托盘闪烁
            if (await appIsMinimizedOrHidden()) {
              // 系统托盘闪烁
              flash(true);
            }
          }

          // 更新或创建会话
          chatStore.handleCreateOrUpdateChat(message, id);
          // 插入新消息
          messageStore.handleCreateMessage(id, message, code);
        }
      }
      if (code === IMessageType.VIDEO_MESSAGE.code) {
        // 处理视频消息
        callStore.handleCallMessage(data);
      }
      if (code === IMessageType.REFRESHTOKEN.code) {
        // 刷新token
        userStore.refreshToken();
      }
    });
  }

  /* ---------------------- WebSocket 消息处理 ---------------------- */

  /** 销毁管理器（退出时调用） */
  async destroy() {
    log.prettyInfo("core", "开始清理 MainManager 资源");
    try {
      disconnect();
      // 如果需要，也可以清理其他资源
      log.prettySuccess("core", "清理完成");
    } catch (err) {
      log.prettyError("core", "destroy 出错", err);
    }
  }

  /** 安全初始化用户（捕获错误并记录） */
  private async initUserSafe() {
    const t0 = performance.now();
    try {
      await userStore.handleGetUserInfo();
      log.prettySuccess("user", "用户信息初始化成功");
    } catch (err) {
      log.prettyError("user", "初始化用户信息失败", err);
      throw err; // 关键路径失败需要抛出
    } finally {
      const t1 = performance.now();
      log.prettyInfo("user", `initUser 耗时 ${Math.round(t1 - t0)} ms`);
    }
  }

  /* ---------------------- 销毁/清理 ---------------------- */

  /** 将耗时任务安排在空闲时间执行以避免阻塞渲染/启动流程 */
  private async runBackgroundInit() {
    if (this.backgroundTasksRunning) return;
    this.backgroundTasksRunning = true;

    const run = async () => {
      log.prettyInfo("background", "开始后台初始化任务（requestIdle）");

      const tasks = [
        this.initFileDownload(), // 设置下载目录（轻/中）
        this.initDatabase(), // 数据库初始化（较慢）
        this.syncUserData(), // 同步离线消息/会话/好友（较慢）
        this.initTray(), // 托盘（UI 相关）
        this.initShortcut() // 注册快捷键
      ];

      // 并行执行，记录各自结果
      const results = await Promise.allSettled(tasks);
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          log.prettyWarn("background", `后台任务 #${i} 失败（非致命）`, r.reason);
        }
      });

      log.prettySuccess("background", "后台初始化任务完成（部分任务可能失败但不影响主流程）");
    };

    // 优先使用 requestIdleCallback（若存在），否则使用 setTimeout
    if (typeof (window as any).requestIdleCallback === "function") {
      (window as any).requestIdleCallback(() => run());
    } else {
      // 延迟一帧再运行，避免阻塞首次渲染
      setTimeout(() => run(), 50);
    }
  }
}

/** hook */
export function useMainManager() {
  return MainManager.getInstance();
}
