import { StoresEnum } from "@/constants";
import api from "@/api/index";
import { CreateMainWindow } from "@/windows/main";
import { HideLoginWindow } from "@/windows/login";
//import { storage } from '@/utils/Storage'
import { storage } from "@/utils/Storage";
import defaultImg from "@/assets/avatar/default.jpg";

interface State {
  token: string;
  userId: any | null;
  userInfo: any;
}

export const useUserStore = defineStore(StoresEnum.USER, {
  state: (): State => ({
    token: "",
    userId: "",
    userInfo: {}
  }),

  getters: {
    // 获取用户头像，如果没有设置头像，则返回默认头像
    avatar: state => state.userInfo?.avatar ?? defaultImg,

    // 用户名称
    name: state => state.userInfo?.name || ""
  },

  actions: {
    // 用户登录
    async login(loginForm: any) {
      try {
        const res: any = await api.Login(loginForm);
        if (res) {
          // 保存用户信息到本地存储
          this.token = res.accessToken;
          this.userId = res.userId;
          this.saveToStorage();

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
    },

    // 刷新token
    async refreshToken() {
      try {
        const res: any = await api.RefreshToken();
        if (res) {
          this.token = res.token;
          this.saveToStorage();
        } else {
          console.error("获取用户token失败", res?.message);
        }
      } catch (error) {
        console.error("获取用户token出错", error);
      }
    },

    // 更新用户信息
    async updateUserInfo(profile: any) {
      const res: any = await api.UpdateUserInfo(profile);
      if (res) {
        this.handleGetUserInfo();
      } else {
        console.error("更新用户信息失败", res?.message);
      }
    },

    // 上传用户头像
    async uploadUserAvatar(file: File) {
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
    },

    // 获取用户信息
    async handleGetUserInfo() {
      try {
        const res: any = await api.GetUserInfo({ userId: this.userId });
        if (res) {
          this.userInfo = res;
        } else {
          console.error("获取用户信息失败", res?.message);
        }
      } catch (error) {
        console.error("获取用户信息请求出错", error);
      }
    },

    // 退出登录
    async loginOut() {
      try {
        await api.LoginOut({ userId: this.userId });
        this.resetUserState();
      } catch (error) {
        console.error("退出登录请求出错", error);
      }
    },

    // 将用户信息保存到本地存储
    saveToStorage() {
      storage.set("token", this.token);
      storage.set("userId", this.userId);
    },

    // 重置用户状态
    resetUserState() {
      this.token = "";
      this.userId = "";
      this.userInfo = {};
      storage.remove("token");
      storage.remove("userId");
    }
  },
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
