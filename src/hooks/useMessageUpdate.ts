import { emitTo, listen } from "@tauri-apps/api/event";
import { useChatStore } from "@/store/modules/chat";

const chatMessageStore = useChatStore();


export function useListenWindowMessage() {

  // 发送消息到主窗口
  const emitToMain = async (item: any) => {
    await emitTo("main", "main-loaded", { type: "chat", data: item });
  };

  // 监听主窗口消息
  const listenOfNotify = async () => {
    await listen("main-loaded", (event) => {
      let data: any = event.payload;
      messageUpdate(data.data);
    });
  };

  const messageUpdate = async (item: any) => {

    // 重置消息store
    chatMessageStore.handleResetMessage();

    // 更新当前消息
    await chatMessageStore.handleChangeCurrentChat(item);

    // 更新消息列表
    chatMessageStore.handleGetMessageList(item);

    // 更新已读状态
    chatMessageStore.handleUpdateReadStatus(item);

    // 获取消息总数
    chatMessageStore.handleGetMessageCount();

    // 更新预览窗口url
    chatMessageStore.handleSearchMessageUrl(item);

    chatMessageStore.handleJumpToChat();
  };

  onBeforeMount(() => {
    listenOfNotify();
  });

  return {
    emitToMain,
    messageUpdate
  };

}