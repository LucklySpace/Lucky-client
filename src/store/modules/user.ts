import { StoresEnum } from "@/constants";
import api from "@/api/index";
import { CreateMainWindow } from "@/windows/main";
import { HideLoginWindow } from "@/windows/login";
import { storage } from "@/utils/Storage";
import defaultImg from "@/assets/avatar/default.jpg";
import { ref, computed } from "vue";

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

/**
 * 用户状态管理
 * 使用 Pinia setup 语法重构，提供响应式状态管理和方法
 */
export const useUserStore = defineStore(StoresEnum.USER, () => {
  // 响应式状态
  const token = ref<string>("");
  const userId = ref<string>("");
  const userInfo = ref<UserInfo>({});

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

  // 用户登录
  const login = async (loginForm: any) => {
    try {
      const res: any = await api.Login(loginForm);
      if (res) {
        // 保存用户信息到本地存储
        token.value = res.accessToken;
        userId.value = res.userId;
        saveToStorage();

        // 创建主窗口并关闭登录窗口
        CreateMainWindow();
        HideLoginWindow();
      } else {
        // 登录失败的处理
        console.error("登录失败", res?.message);
      }
    } catch (error) {
      console.error("登录请求出错", error);
    }
  };

  // 刷新token
  const refreshToken = async () => {
    try {
      const res: any = await api.RefreshToken();
      if (res) {
        token.value = res.token;
        saveToStorage();
      } else {
        console.error("获取用户token失败", res?.message);
      }
    } catch (error) {
      console.error("获取用户token出错", error);
    }
  };

  // 更新用户信息
  const updateUserInfo = async (profile: any) => {
    const res: any = await api.UpdateUserInfo(profile);
    if (res) {
      handleGetUserInfo();
    } else {
      console.error("更新用户信息失败", res?.message);
    }
  };

  // 上传用户头像
  const uploadUserAvatar = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res: any = await api.uploadImage(formData);
      if (!res) {
        console.error("上传用户头像失败", res);
      }
      return res;
    } catch (error) {
      console.error("上传用户头像出错", error);
    }
  };

  // 获取用户信息
  const handleGetUserInfo = async () => {
    try {
      const res: any = await api.GetUserInfo({ userId: userId.value });
      if (res) {
        userInfo.value = res;
      } else {
        console.error("获取用户信息失败", res?.message);
      }
    } catch (error) {
      console.error("获取用户信息请求出错", error);
    }
  };

  // 退出登录
  const loginOut = async () => {
    try {
      await api.LoginOut({ userId: userId.value });
      resetUserState();
    } catch (error) {
      console.error("退出登录请求出错", error);
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
    storage.remove("token");
    storage.remove("userId");
  };

  // 返回 store 的内容
  return {
    // 状态
    token,
    userId,
    userInfo,
    
    // 计算属性
    avatar,
    name,
    
    // 方法
    login,
    refreshToken,
    updateUserInfo,
    uploadUserAvatar,
    handleGetUserInfo,
    loginOut,
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
