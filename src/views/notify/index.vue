<template>
  <div id="new-msg-list-div" class="new-msg-list-div no-select">
    <div class="content-div">
      <div class="title">{{ $t("notifications.newMessages", { count: totalNumber }) }}</div>

      <div v-if="chatStore.getHaveMessageChat.length" class="list-div">
        <div v-for="(item, index) in chatStore.getHaveMessageChat" :key="item.name" class="list-item"
          @click="onRead(item)">
          <el-row height="48" style="width: 100%">
            <el-col :span="6">
              <div class="avator-div">
                <Avatar :avatar="item.avatar || ' '" :name="item.name" :width="35" :borderRadius="5" class="avator" />
              </div>
            </el-col>

            <el-col :span="14">
              <div class="name-div">
                <span class="name">{{ item.name }}</span>
              </div>
            </el-col>

            <el-col :span="4">
              <div class="content">
                <div class="msg-num">{{ item.unread }}</div>
              </div>
            </el-col>
          </el-row>
        </div>
      </div>
    </div>
    <div class="footer" @click="handleIgnoreAll">{{ $t("notifications.ignoreAll") }}</div>
  </div>
</template>

<script lang="ts" setup>
import { StoresEnum } from "@/constants/index";
import { useChatStore } from "@/store/modules/chat";
import Avatar from "@/components/Avatar/index.vue";
import { hideNotifyWindow } from "@/windows/notify";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import Chats from "@/database/entity/Chats";

const chatStore = useChatStore();

const { sendTo } = useTauriEvent();

/**
 * 计算未读消息总数
 */
const totalNumber = computed(() => {
  // 计算总数
  return chatStore.getHaveMessageChat.reduce((total: number, item: any) => total + item.unread, 0);
});

async function onRead(item: Chats) {
  sendTo(StoresEnum.MAIN, "notify-win-click", { chatId: item.chatId });
}

/**
 * 忽略全部消息
 */
function handleIgnoreAll() {
  // 忽略全部消息
  chatStore.handleIgnoreAll();
  // 隐藏通知窗口
  hideNotifyWindow();
}

// 组件挂载时执行
onMounted(() => {
  //createListDom()
  //updateTitleNumber()
});
</script>

<style lang="scss" scoped>
@use "@/assets/style/scss/index.scss" as *;

.new-msg-list-div {
  border-top-left-radius: 5px;
  border-top-right-radius: 5px;
  border: solid 1px #dedede;
  border-bottom: none;
  background-color: #fff;
  overflow-y: auto;
  scrollbar-width: none;
  font-size: 12px;
  cursor: context-menu;
}

.new-msg-list-div .content-div {
  border-bottom: solid 1px #dedede;
}

.new-msg-list-div .content-div .title {
  line-height: 35px;
  height: 35px;
  font-weight: bold;
  padding: 0 20px;
}

.new-msg-list-div .content-div .list-div {
  max-height: 288px;
  /* 6 * 48px */
  overflow-y: auto;
  /* 添加滚动条 */
  @include scroll-bar();
}

.list-item {
  padding: 1px 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 45px;
  border-bottom: solid 1px #eee;
  cursor: pointer;

  .avator-div {
    width: 35px;
    height: 35px;
    overflow: hidden;

    .avator {
      width: 100%;
      height: 100%;
    }
  }

  .name-div {
    padding: 0 10px;
    align-items: center;

    .name {
      height: 35px;
      line-height: 35px;
      display: inline-block;
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;

    .msg-num {
      color: #fff;
      background-color: red;
      padding: 0 4px;
      border-radius: 10px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-width: 20px;
      //height: 20px;
      font-size: 12px;
      line-height: 16px;
    }
  }
}

.new-msg-list-div .content-div .list-div .list-item:hover {
  background-color: #e8e8e8;
}

.new-msg-list-div .footer {
  height: 35px;
  line-height: 35px;
  padding: 0 20px;
  text-align: right;
  color: #586cb1;
  cursor: pointer;
}
</style>
