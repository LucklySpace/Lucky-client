import { StoresEnum } from "@/constants";
import api from "@/api/index";
import { CreateMainWindow, CloseMainWindow } from "@/windows/main";
import { HideLoginWindow, ShowLoginWindow } from "@/windows/login";
import { storage } from "@/utils/Storage";
import { useWebSocketWorker } from "@/hooks/useWebSocketWorker";
import { ElMessage } from "element-plus";
import defaultImg from "@/assets/avatar/default.jpg";
import useCrypo from "@/hooks/useCrypo";

// 用户信息接口
interface UserInfo {
  avatar?: string;
  name?: string;
  [key: string]: any; // 允许其他属性
}

// 定义 store 状态接口
interface UserState {
  token: string;
  userId: string;
  userInfo: UserInfo;
}

// 登录状态枚举
export enum LoginStatus {
  IDLE = "idle",
  LOGGING_IN = "logging_in",
  LOGGED_IN = "logged_in",
  LOGGING_OUT = "logging_out"
}

/**
 * 用户状态管理
 * 使用 Pinia setup 语法重构，提供响应式状态管理和方法
 */
export const useUserStore = defineStore(StoresEnum.USER, () => {
  // 响应式状态
  const token = ref<string>("");
  const userId = ref<string>("");
  const userInfo = ref<UserInfo>({});
  const userEmojiPackIds = ref<String[]>([]);
  const loginStatus = ref<LoginStatus>(LoginStatus.IDLE);
  const { md5 } = useCrypo();

  // 计算属性
  /**
   * 获取用户头像
   * 如果没有设置头像，则返回默认头像
   */
  const avatar = computed(() => userInfo.value?.avatar ?? defaultImg);

  /**
   * 获取用户名称
   */
  const name = computed(() => userInfo.value?.name || "");

  /**
   * 是否已登录
   */
  const isLoggedIn = computed(() => !!token.value && !!userId.value);

  /**
   * 是否正在登录/退出
   */
  const isLoading = computed(() =>
    loginStatus.value === LoginStatus.LOGGING_IN ||
    loginStatus.value === LoginStatus.LOGGING_OUT
  );

  /**
   * 日志记录器
   */
  const logger = useLogger();

  /**
   * 用户登录
   * @param loginForm 登录表单数据
   * @throws 登录失败时抛出错误
   */
  const login = async (loginForm: any): Promise<void> => {
    if (loginStatus.value === LoginStatus.LOGGING_IN) {
      logger.warn("登录操作正在进行中，请勿重复提交");
      return;
    }

    loginStatus.value = LoginStatus.LOGGING_IN;

    // 重置用户状态
    resetUserState();

    try {
      const res: any = await api.Login(loginForm);

      if (!res || !res.accessToken || !res.userId) {
        throw new Error("登录响应数据不完整");
      }

      // 保存用户信息到本地存储
      token.value = res.accessToken;
      userId.value = res.userId;
      saveToStorage();

      loginStatus.value = LoginStatus.LOGGED_IN;

      // 创建主窗口并关闭登录窗口
      await CreateMainWindow();
      await HideLoginWindow();

      logger.info("用户登录成功", { userId: res.userId });
    } catch (error) {
      loginStatus.value = LoginStatus.IDLE;
      const errorMsg = error instanceof Error ? error.message : "登录失败";
      logger.error("用户登录失败", error);
      throw new Error(errorMsg);
    }
  };

  /**
   * 刷新 Token
   * @throws 刷新失败时抛出错误
   */
  const refreshToken = async (): Promise<void> => {
    try {
      const res: any = await api.RefreshToken();

      if (!res || !res.token) {
        throw new Error("Token 刷新响应数据不完整");
      }

      token.value = res.token;
      saveToStorage();

      logger.info("Token 刷新成功");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Token 刷新失败";
      logger.error("Token 刷新失败", error);
      throw new Error(errorMsg);
    }
  };

  /**
   * 更新用户信息
   * @param profile 用户资料
   * @throws 更新失败时抛出错误
   */
  const updateUserInfo = async (profile: any): Promise<void> => {
    try {
      const res: any = await api.UpdateUserInfo(profile);

      if (!res) {
        throw new Error("更新用户信息失败");
      }

      await handleGetUserInfo();
      logger.info("用户信息更新成功");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "更新用户信息失败";
      logger.error("更新用户信息失败", error);
      throw new Error(errorMsg);
    }
  };

  /**
   * 上传用户头像
   * @param file 头像文件
   * @returns 上传结果
   * @throws 上传失败时抛出错误
   */
  const uploadUserAvatar = async (file: File): Promise<any> => {
    try {
      if (!file) {
        throw new Error("文件不能为空");
      }

      const md5Str = await md5(file)
      const formData = new FormData();
      formData.append("identifier", md5Str.toString());
      formData.append("file", file);

      const res: any = await api.uploadAvatar(formData);

      if (!res) {
        throw new Error("上传头像失败");
      }

      logger.info("用户头像上传成功");
      return res;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "上传头像失败";
      logger.error("上传头像失败", error);
      throw new Error(errorMsg);
    }
  };

  /**
   * 获取用户信息
   * @throws 获取失败时抛出错误
   */
  const handleGetUserInfo = async (): Promise<void> => {
    try {
      const currentUserId = userId.value;

      if (!currentUserId) {
        throw new Error("用户ID不存在");
      }

      // 获取用户基本信息
      const userRes: any = await api.GetUserInfo({ userId: currentUserId });

      if (userRes) {
        userInfo.value = userRes;
      } else {
        logger.warn("获取用户信息返回空数据");
      }

      // 获取用户表情包（非关键数据，失败不影响主流程）
      try {
        const emojiRes: any = await api.GetUserEmojis({ userId: currentUserId });
        if (emojiRes) {
          userEmojiPackIds.value = emojiRes;
        }
      } catch (emojiError) {
        logger.warn("获取用户表情包失败", emojiError);
      }

      logger.info("用户信息获取成功");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "获取用户信息失败";
      logger.error("获取用户信息失败", error);
      throw new Error(errorMsg);
    }
  };

  /**
   * 退出登录
   * @param options 退出选项
   * @param options.showWindow 是否显示登录窗口，默认 true
   * @param options.closeMain 是否关闭主窗口，默认 true
   * @throws 退出失败时抛出错误
   */
  const loginOut = async (options: { showWindow?: boolean; closeMain?: boolean } = {}): Promise<void> => {
    const { showWindow = true, closeMain = true } = options;

    if (loginStatus.value === LoginStatus.LOGGING_OUT) {
      logger.warn("退出操作正在进行中");
      return;
    }

    loginStatus.value = LoginStatus.LOGGING_OUT;

    try {
      const currentUserId = userId.value;

      // 1. 断开 WebSocket 连接
      try {
        const { disconnect, destroy } = useWebSocketWorker();
        disconnect();
        destroy();
        logger.info("WebSocket 连接已断开");
      } catch (wsError) {
        logger.warn("断开 WebSocket 时发生错误", wsError);
      }

      // 2. 调用后端退出接口
      if (currentUserId) {
        try {
          await api.LoginOut({ userId: currentUserId });
        } catch (apiError) {
          logger.warn("调用退出接口失败（非致命）", apiError);
        }
      }

      // 3. 清空本地状态
      resetUserState();

      // 4. 窗口操作
      if (closeMain) {
        await CloseMainWindow();
      }
      if (showWindow) {
        await ShowLoginWindow();
      }

      ElMessage.success("已退出登录");
      logger.info("用户退出登录成功");
    } catch (error) {
      // 即使出错也要清空本地状态
      resetUserState();
      logger.error("退出登录时发生错误", error);
    } finally {
      loginStatus.value = LoginStatus.IDLE;
    }
  };

  /**
   * 强制退出（被踢下线等场景）
   */
  const forceLogout = async (reason?: string): Promise<void> => {
    logger.warn("强制退出登录", { reason });

    // 断开 WebSocket
    try {
      const { disconnect, destroy } = useWebSocketWorker();
      disconnect();
      destroy();
    } catch (e) {
      // ignore
    }

    resetUserState();

    await CloseMainWindow();
    await ShowLoginWindow();

    if (reason) {
      ElMessage.warning(reason);
    }
  };

  // 将用户信息保存到本地存储
  const saveToStorage = () => {
    storage.set("token", token.value);
    storage.set("userId", userId.value);
  };

  // 重置用户状态
  const resetUserState = () => {
    token.value = "";
    userId.value = "";
    userInfo.value = {};
    userEmojiPackIds.value = [];
    loginStatus.value = LoginStatus.IDLE;
    storage.remove("token");
    storage.remove("userId");
  };

  // 返回 store 的内容
  return {
    // 状态
    token,
    userId,
    userInfo,
    userEmojiPackIds,
    loginStatus,

    // 计算属性
    avatar,
    name,
    isLoggedIn,
    isLoading,

    // 方法
    login,
    refreshToken,
    updateUserInfo,
    uploadUserAvatar,
    handleGetUserInfo,
    loginOut,
    forceLogout,
    saveToStorage,
    resetUserState
  };
}, {
  persist: [
    {
      key: `${StoresEnum.USER}_local`,
      paths: ["token", "userId", "userInfo"],
      storage: localStorage
    },
    {
      key: `${StoresEnum.USER}_session`,
      paths: [],
      storage: sessionStorage
    }
  ]
});
