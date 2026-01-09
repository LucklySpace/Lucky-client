import { defineStore } from "pinia";
import { ref } from "vue";
import { StoresEnum } from "@/constants";

/**
 * 通知 Store
 * 管理应用内的通知和消息列表
 */
export const useNotifyStore = defineStore(
  StoresEnum.NOTIFY,
  () => {
    /**
     * 聊天消息列表
     */
    const messageList = ref<any[]>([]);

    /**
     * 添加消息到列表
     * @param message 消息对象
     */
    function addMessage(message: any) {
      messageList.value.push(message);
    }

    /**
     * 清空消息列表
     */
    function clearMessages() {
      messageList.value = [];
    }

    /**
     * 移除指定消息
     * @param messageId 消息 ID
     */
    function removeMessage(messageId: string) {
      const index = messageList.value.findIndex(msg => msg.messageId === messageId);
      if (index !== -1) {
        messageList.value.splice(index, 1);
      }
    }

    return {
      // State
      messageList,

      // Actions
      addMessage,
      clearMessages,
      removeMessage
    };
  },
  {
    persist: [
      {
        key: `${StoresEnum.NOTIFY}_session`,
        paths: ["messageList"],
        storage: sessionStorage
      }
    ]
  }
);