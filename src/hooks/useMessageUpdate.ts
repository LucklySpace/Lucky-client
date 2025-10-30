import { emitTo, listen } from "@tauri-apps/api/event";
import { useChatMainStore } from "@/store/modules/chat";
import { useMessageStore } from "@/store/modules/message";

const chatStore = useChatMainStore();
const messageStore = useMessageStore();


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
    messageStore.handleReset();

    // 更新当前消息
    await chatStore.handleChangeCurrentChat(item);

    // 更新消息列表
    messageStore.handleGetMessageList(item);

    // 更新已读状态
    chatStore.handleUpdateReadStatus(item);

    // 获取消息总数
    messageStore.handleGetMessageCount();

    // 更新预览窗口url
    messageStore.handleSearchMessageUrl(item);

    chatStore.handleJumpToChat();
  };

  onBeforeMount(() => {
    listenOfNotify();
  });

  return {
    emitToMain,
    messageUpdate
  };

}
