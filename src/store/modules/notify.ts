import { StoresEnum } from "@/constants";


/**
 * 通知
 */
export const useMainStore = defineStore(StoresEnum.NOTIFY, {
  // State类似于组件中的data
  state: () => {
    return {
      messageList: [] // 聊天消息列表
    };
  },
  // Getters类似于组件中的计算属性
  getters: {},
  // Actions 相当于组件中的 methods
  actions: {},
  persist: [
    {
      key: `${StoresEnum.NOTIFY}_local`,
      paths: [],
      storage: localStorage
    },
    {
      key: `${StoresEnum.NOTIFY}_session`,
      paths: [],
      storage: sessionStorage
    }
  ]
});