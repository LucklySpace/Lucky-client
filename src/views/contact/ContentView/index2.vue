<template>
  <div class="contact-container">
    <el-card v-show="Object.keys(friendInfo).length > 0" shadow="always" style="width: 500px;height: 250px;">
      <el-row style="height: 80px;">
        <el-col :span="5">
          <img :src="friendInfo.avatar" class="contact-container-avatar"></img>
        </el-col>
        <el-col :span="19">
          <div class="contact-container-info-username">
            {{ friendInfo.name }} &nbsp
            <svg style="height: 20px;width: 20px;">
              <use v-if="friendInfo.userSex == 0" xlink:href="#icon-nanxing" />
              <use v-else-if="friendInfo.userSex == 1" xlink:href="#icon-nvxing" />
            </svg>

            <!-- <svg-icon v-if="friendInfo.userSex == 0" :name="'#icon-nanxing'" />
            <svg-icon v-else-if="friendInfo.userSex == 1"  :name="'#icon-nvxing'" /> -->

          </div>
          <div v-if="friendInfo.name" class="contact-container-info">
            昵称： {{ friendInfo.name }}
          </div>
          <div v-if="friendInfo.friendId" class="contact-container-info">
            用户ID: {{ friendInfo.friendId }}
          </div>
          <div v-if="friendInfo.location" class="contact-container-info">
            地区: {{ friendInfo.location }}
          </div>
        </el-col>
      </el-row>
      <el-row v-if="friendInfo.name" style="margin-top: 10px;">
        <el-col :span="24">
          <div class="contact-container-info">
            备注: {{ friendInfo.name }}
          </div>

        </el-col>
      </el-row>
      <el-row v-if="friendInfo.selfSignature">
        <el-col :span="24">
          <div class="contact-container-signature">
            个人签名:{{ friendInfo.selfSignature }}
          </div>
        </el-col>
      </el-row>
      <br><br><br>
      <el-row>

        <el-col :span="24">
          <el-button @click="handleSendMessage(friendInfo)">
            <i class="iconfont icon-huihua" style="font-size: 20px;"></i> &nbsp&nbsp发送消息
          </el-button>
          <!-- <el-button v-else @click="handleAddFriend">
    <i class="iconfont icon-tianjiahaoyou" style="font-size: 18px;"></i> &nbsp&nbsp添加好友
  </el-button> -->
        </el-col>
        <!-- <el-col :span="24">
    发送消息
  </el-col>
  <el-col :span="24">
    发送消息
  </el-col> -->
      </el-row>
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { useRouter } from "vue-router";
  import { useFriendsStore } from "@/store/modules/friends";
  import { useChatMainStore } from "@/store/modules/chat";
  import { useMessageStore } from "@/store/modules/message";


  const router = useRouter();
  const chatStore = useChatMainStore();
  const messageStore = useMessageStore();
  const friendStore = useFriendsStore();

  const friendInfo = computed(() => {
    return friendStore.shipInfo ? friendStore.shipInfo : {};
  });


  const handleSendMessage = async (friendInfo: any) => {
    // 更新当前聊天对象
    await chatStore.handleCurrentChangeByTarget(friendInfo, 1003);

    // 获取消息总数
    messageStore.handleGetMessageCount();

    // 更新消息列表
    messageStore.handleGetMessageList(chatStore.currentChat);

    // 更新预览窗口url
    messageStore.handleSearchMessageUrl(chatStore.currentChat);

    router.push("/message");
  };


</script>


<style lang="scss" scoped>
  .chat-container {
    top: 100px
  }


  .contact-container-avatar {
    position: relative;
    width: 60px;
    height: 60px;
    background-color: #ccc;
    border-radius: 3px;
    margin: 5px;
  }

  .contact-container-info {
    display: block;
    font-size: 12px;
    color: #999;
    padding: 2px;
  }

  .contact-container-signature {
    display: block;
    font-size: 14px;
    color: #999;
    padding: 2px;
    margin-top: 10px;
    // border-top: 1px solid #ccc;
  }

  .contact-container-info-username {
    display: block;
    font-size: 15px;
    color: black;
  }
</style>