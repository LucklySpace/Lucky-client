import api from "@/api/index";
import defaultImg from "@/assets/avatar/default.jpg";
import { StoresEnum } from "@/constants";
import useCrypto from "@/hooks/useCrypto";
import { useWebSocketWorker } from "@/hooks/useWebSocketWorker";
import { safeExecute, ValidationError } from "@/utils/ExceptionHandler";
import { storage } from "@/utils/Storage";
import tokenManager from "@/utils/TokenManager"; // 导入刚才优化的管理器
import { HideLoginWindow, ShowLoginWindow } from "@/windows/login";
import { CloseMainWindow, CreateMainWindow } from "@/windows/main";
import { ElMessage } from "element-plus";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

// ==================== 类型定义 ====================

export enum LoginStatus {
  IDLE = "idle",
  LOGGING_IN = "logging_in",
  LOGGED_IN = "logged_in",
  LOGGING_OUT = "logging_out",
}

interface UserInfo {
  userId?: string;
  avatar?: string;
  name?: string;
  nickname?: string;
  [key: string]: any;
}

interface AuthRefreshTokenResult {
  userId: string;
  accessToken: string;
}


interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  userId: string;
  accessExpiresAt: number;
  refreshExpiresAt?: number;
}

// ==================== Store ====================

export const useUserStore = defineStore(StoresEnum.USER, () => {
  // 1. 核心依赖
  const { md5 } = useCrypto();
  const { disconnect: wsDisconnect, destroy: wsDestroy } = useWebSocketWorker();

  // 2. 响应式状态 (State)
  // Token 仅在内存保留 AccessToken，刷新需走 TokenManager
  const token = ref("");
  const userInfo = ref<UserInfo>({});
  const status = ref<LoginStatus>(LoginStatus.IDLE);
  const emojiPackIds = ref<string[]>([]);

  // 3. 计算属性 (Getters)
  const isLogged = computed(() => status.value === LoginStatus.LOGGED_IN);
  const isLoading = computed(() => [LoginStatus.LOGGING_IN, LoginStatus.LOGGING_OUT].includes(status.value));

  const avatar = computed(() => userInfo.value.avatar || defaultImg);
  const name = computed(() => userInfo.value.name || userInfo.value.nickname || "Unknown");
  const userId = computed(() => userInfo.value.userId || "");

  // ==================== 核心动作 (Actions) ====================

  /**
   * 初始化检查 (App启动调用)
   * 尝试从 TokenManager 恢复会话，避免用户重复登录
   */
  const initSession = async () => {
    const accessToken = await tokenManager.getAccess();
    if (accessToken) {
      token.value = accessToken;
      status.value = LoginStatus.LOGGED_IN;
      // 可选：静默刷新用户信息
      handleGetUserInfo(true);
    }
  };

  /** 登录逻辑 */
  const login = async (form: any) => {
    if (isLoading.value) return;

    status.value = LoginStatus.LOGGING_IN;
    token.value = "";
    userInfo.value = {};
    storage.remove("token");

    try {
      // 1. 网络请求
      const res: any = await api.Login(form);

      if (!res?.accessToken || !res?.userId) {
        throw new ValidationError("登录响应无效");
      }

      // 2. 并行处理：安全存储 + 状态更新
      await Promise.all([
        await tokenManager.set({
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          accessExpiresAt: res.accessExpiresAt || Date.now() + 7200000,
          refreshExpiresAt: res.refreshExpiresAt
        }),
        (async () => {
          token.value = res.accessToken;
          storage.set("userId", res.userId);
          storage.set("token", res.accessToken);
          userInfo.value.userId = res.userId;
        })()
      ]);

      status.value = LoginStatus.LOGGED_IN;

      // 3. 界面流转 (非阻塞)
      // 先加载数据，同时切换窗口，提升感知速度
      handleGetUserInfo();
      await switchWindowToMain();

    } catch (e: any) {
      status.value = LoginStatus.IDLE;
      throw e; // 让 UI 层处理具体的错误提示
    }
  };

  /** 退出登录 */
  const logout = async (options: { silent?: boolean; force?: boolean } = {}) => {
    if (status.value === LoginStatus.LOGGING_OUT) return;
    status.value = LoginStatus.LOGGING_OUT;

    const { silent = false, force = false } = options;
    const uid = userId.value;

    try {
      // 1. 清理工作 (WebSocket & Backend)
      disconnectWebSocket();

      if (uid && !force) {
        // 发送退出请求但不阻塞后续清理
        safeExecute(() => api.LoginOut({ userId: uid }), { silent: true });
      }

      // 2. 清除本地凭证
      token.value = "";
      userInfo.value = {};
      await tokenManager.clear();

      // 3. 窗口切换
      await switchWindowToLogin();

      if (!silent) ElMessage.success("已退出登录");
    } finally {
      status.value = LoginStatus.IDLE;
    }
  };

  /**
   * 刷新 AccessToken
   */
  const refreshToken = async () => {
    tokenManager.getRefresh().then(async (refreshToken) => {
      if (refreshToken) {
        api.RefreshToken(refreshToken).then((res: any) => {
          if (res) {
            token.value = res.accessToken;
            storage.set("token", res.accessToken);
          }
        });
      }
    });
  }

  /** 强制下线 (被踢/Token失效) */
  const forceLogout = (reason?: string) => {
    if (reason) ElMessage.warning(reason);
    logout({ silent: true, force: true });
  };

  // ==================== 数据获取 ====================

  /** 获取/更新用户信息 */
  const handleGetUserInfo = async (silent = false) => {
    if (!userId.value) return;

    const res = await safeExecute<UserInfo>(
      () => api.GetUserInfo({ userId: userId.value }),
      { silent }
    );

    if (res) {
      userInfo.value = { ...userInfo.value, ...res };
      // 懒加载表情包，不阻塞主流程
      fetchUserEmojis();
    }
  };

  const fetchUserEmojis = async () => {
    const res: any = await api.GetUserEmojis({ userId: userId.value });

    if (res) emojiPackIds.value = res;
  };

  const updateUserInfo = async (profile: Partial<UserInfo>) => {
    const res = await safeExecute(() => api.UpdateUserInfo(profile));
    if (res) await handleGetUserInfo(true);
  };

  const uploadAvatar = async (file: File) => {
    const md5Str = await md5(file);
    const formData = new FormData();
    formData.append("identifier", md5Str);
    formData.append("file", file);

    const res = await safeExecute(() => api.uploadAvatar(formData));
    if (res) ElMessage.success("头像上传成功");
    return res;
  };

  // ==================== 辅助逻辑 ====================

  const disconnectWebSocket = () => {
    wsDisconnect();
    wsDestroy();
  };

  /** 窗口切换：登录 -> 主窗口 */
  const switchWindowToMain = async () => {
    // 技巧：先创建主窗口，准备好后再隐藏登录窗口，避免闪烁
    await CreateMainWindow();
    // 可选：在这里发送事件给主窗口通知它加载数据
    HideLoginWindow(); // 不 await，让其在后台关闭
  };

  /** 窗口切换：主窗口 -> 登录 */
  const switchWindowToLogin = async () => {
    await ShowLoginWindow();
    CloseMainWindow(); // 不 await
  };

  return {
    // State (只读或通过 Action 修改)
    token,
    userInfo,
    status,
    emojiPackIds,

    // Getters
    isLogged,
    isLoading,
    avatar,
    name,
    userId,

    // Actions
    initSession,
    login,
    logout,
    forceLogout,
    handleGetUserInfo,
    updateUserInfo,
    uploadAvatar,

    // Low-level Access (如果拦截器需要)
    getAccess: () => tokenManager.getAccess(),
    refreshToken,
  };
}, {
  // Pinia 持久化配置 (仅存储非敏感 UI 数据)
  persist: [
    {
      key: `${StoresEnum.USER}_ui`,
      paths: ["userInfo"],
      storage: localStorage,
    }
  ]
});