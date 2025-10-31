<template>
  <div class="group-container">
    <!-- 搜索群成员 -->
    <div class="search-members">
      <el-input 
        v-model="searchText" 
        class="input-with-select" 
        clearable 
        :placeholder="$t('chat.groupChat.searchMembers')">
        <el-button slot="append" icon="el-icon-search"></el-button>
      </el-input>
    </div>

    <!-- 群成员列表 -->
    <div class="members-list">
      <el-row :gutter="20">
        <!-- 群成员 -->
        <el-col v-for="(item, index) in displayedMembers" :key="item.userId" :span="6">
          <el-image
            :alt="item.name"
            :src="item.avatar"
            class="member-avatar"
            fit="cover"
            @error="onAvatarError"
          ></el-image>
          <div :title="item.name ?? ''" class="member-name">{{ item.name }}</div>
        </el-col>
        <!-- 添加按钮 -->
        <el-col :span="6">
          <el-button class="member-btn" style="margin-bottom: 3px" @click="handleInviteDialog">
            <i class="iconfont icon-jia" style="margin-left: -5px"></i>
          </el-button>
          <div class="member-name">{{ $t('actions.add') }}</div>
        </el-col>
      </el-row>
      <!-- 折叠按钮 -->
      <el-button 
        v-if="filteredMembers.length > 16" 
        class="group-footer" 
        link 
        type="primary" 
        @click="toggleExpand">
        {{ isExpanded ? $t('chat.groupChat.collapse') : $t('chat.groupChat.viewMore') }}
      </el-button>
    </div>

    <el-divider></el-divider>

    <!-- 群聊名称和群公告表单 -->
    <div class="group-header">
      <div class="group-title">
        <el-form :model="groupInfo" label-position="top" label-width="80px">
          <el-form-item :label="$t('chat.groupChat.groupName')">
            <p>{{ groupInfo.name }}</p>
            <!-- <el-input v-model="groupInfo.groupName" placeholder="请输入群聊名称"></el-input> -->
          </el-form-item>
          <el-form-item :label="$t('chat.groupChat.groupNotice')">
            <p>{{ groupInfo.notice }}</p>
            <!-- <el-input type="textarea" :rows="3" v-model="groupInfo.groupNotice" placeholder="请输入群公告">
                        </el-input>  -->
          </el-form-item>
        </el-form>
      </div>
    </div>

    <el-divider></el-divider>

    <!-- 底部操作 -->
    <div class="group-footer">
      <button class="ordinary-btn" @click="switchHistoryMessage">
        <span class="left">{{ $t('chat.toolbar.history') }}</span>
        <span class="right"><el-icon><ArrowRight /></el-icon></span>
      </button>
      <el-divider />
      <button class="ordinary-btn">
        <span class="switch-label">
          {{ $t('settings.notification.mute') }}
        </span>
        <el-switch v-model="messageMute" class="switch-btn" />
      </button>
      <button class="ordinary-btn">
        <span class="switch-label">{{ $t('chat.toolbar.pin') }}</span>
        <el-switch v-model="top" class="switch-btn" />
      </button>
    </div>

    <div class="group-footer">
      <el-button link class="danger-btn" @click="handleClearGroupMessage">
        {{ $t('dialog.clearChatLog') }}
      </el-button>
      <el-divider></el-divider>
      <el-button link class="danger-btn" @click="handleQuitGroup">
        {{ $t('contacts.deleteGroup') }}
      </el-button>
    </div>
  </div>

  <el-dialog
    :destroy-on-close="true"
    :model-value="inviteDialogVisible"
    class="status_change"
    :title="$t('search.invite.title')"
    width="550"
  >
    <SelectContact @handleAddGroupMember="handleAddGroupMember" @handleClose="handleInviteDialog"></SelectContact>
  </el-dialog>

  <HistoryDialog 
    :visible="historyDialogParam.showDialog" 
    :title="$t('chat.toolbar.history')" 
    @handleClose="toggleHistoryDialog" />

</template>

<script lang="ts" setup>
  import SelectContact from "@/components/SelectContact/index.vue";
  import { ElMessageBox } from "element-plus";
  import { useChatMainStore } from "@/store/modules/chat";
  import { useMessageStore } from "@/store/modules/message";
  import { IMessageType } from "@/constants";

  import defaultImg from "@/assets/avatar/default.jpg";
  import { ref, effect, computed } from 'vue'
  import Chats from "@/database/entity/Chats";
  import HistoryDialog from "@/components/History/index.vue";

  const chatStore = useChatMainStore();
  const messageStore = useMessageStore();

  const emit = defineEmits([
     "handleQuitGroup",
     "handleClearGroupMessage"
    ]);

  onMounted(() => {
    // init();
  });

  const searchText = ref("");
  const isExpanded = ref(false);
  const inviteDialogVisible = ref(false);

  function onAvatarError(e: Event) {
    const img = e.target as HTMLImageElement;
    if (img) img.src = defaultImg;
  }

  /**
   * 获取群详情
   */
  const groupInfo = computed(() => {
    const { currentChat } = chatStore;
    if (currentChat?.chatType == IMessageType.GROUP_MESSAGE.code) {
      return { name: currentChat?.name, notice: "" };
    }
    return {};
  });

  /**
   * 获取群成员
   */
  const filteredMembers = computed(() => {
    const { currentChatGroupMemberMap } = chatStore;
    const searchTextValue = searchText.value.trim().toLowerCase();
    let members = Object.values(currentChatGroupMemberMap);
    // 根据搜索文本过滤群成员
    if (!searchTextValue) {
      return members;
    }
    return members.filter((member: any) => member.name.includes(searchTextValue));
  });

  /**
   * 显示成员
   */
  const displayedMembers = computed(() => {
    // 根据 isExpanded 状态返回全部或部分群成员
    return isExpanded.value ? filteredMembers.value : filteredMembers.value.slice(0, 15);
  });

  /**
   * 控制展开
   */
  const toggleExpand = () => {
    isExpanded.value = !isExpanded.value;
  };

  const handleInviteDialog = () => {
    // 实现添加成员的逻辑
    inviteDialogVisible.value = !inviteDialogVisible.value;
  };

  /**
   * 邀请群成员
   * @param {*} arr
   */
  const handleAddGroupMember = (arr: any) => {
    if (arr && arr.length <= 0) return;
    // 实现添加成员的逻辑
    messageStore.handleAddGroupMember(arr, true);
  };

  //查找聊天信息
  //查找聊天信息
  const switchHistoryMessage = () => {
    historyDialogParam.value.showDialog = true;
  };
  const historyDialogParam = ref({showDialog: false})
  const toggleHistoryDialog = () => {
    historyDialogParam.value.showDialog = !historyDialogParam.value.showDialog;
  }

  //置顶聊天
  //获取会话对象
    const currentItem = computed(() => {
      const { currentChat } = chatStore;
      const chatId = currentChat?.chatId;
      if (!chatId) return null;
      return chatStore.getChatById(chatId);
    });

    const top = ref(currentItem.value?.isTop === 1);
    // 监听 currentItem 变化，同步到本地 ref
    watch(
      () => top.value,
      (newVal) => {
        const item = currentItem.value || {isTop: 0};
          item.isTop = newVal ? 0 : 1
          chatStore.handlePinChat(item as Chats);
      },
    );

    //消息免打扰
    const messageMute = ref(currentItem.value?.isMute === 1);
      // 监听 messageMute 变化，同步到 store
      watch(
        () => messageMute.value,
        (newVal) => {
          const item = currentItem.value|| {isMute: 0};
          if (item) {
            item.isMute = newVal ? 0 : 1;
            chatStore.handleMuteChat(item as Chats);
          }
        }
      );
  const handleClearGroupMessage = () => {
    // 实现清空聊天记录的逻辑
    ElMessageBox.confirm("确定清空该群聊的聊天记录？", "提示", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning"
    })
      .then(() => {
        emit("handleClearGroupMessage");
      })
      .catch(() => {
      });
  };

  const handleQuitGroup = () => {
    ElMessageBox.confirm("确定退出群聊?", "退出群聊", {
      distinguishCancelAndClose: true,
      confirmButtonText: "确认",
      cancelButtonText: "取消"
    })
      .then(() => {
        emit("handleQuitGroup");

        // ElMessage({
        //     type: 'info',
        //     message: 'Changes saved. Proceeding to a new route.',
        // })
      })
      .catch(action => {
        // ElMessage({
        //     type: 'info',
        //     message:
        //         action === 'cancel'
        //             ? 'Changes discarded. Proceeding to a new route.'
        //             : 'Stay in the current route',
        // })
      });

    // 实现退出群聊的逻辑
  };
</script>

<style lang="scss" scoped>
  /* 定义滚动条宽度 */
  @mixin scroll-bar($width: 8px) {
    /* 隐藏滚动条按钮 */
    &::-webkit-scrollbar-button {
      display: none;
    }

    /* 背景色为透明 */
    &::-webkit-scrollbar-track {
      border-radius: 10px;
      background-color: transparent;
    }

    &::-webkit-scrollbar {
      width: $width;
      background-color: transparent;
    }

    &::-webkit-scrollbar-thumb {
      border-radius: 10px;
      background-color: rgba(0, 0, 0, 0.2);
    }
  }

  :deep(.el-divider) {
    position: relative;
    margin: 15px 2px;
  }

  p {
    margin: 0;
    font-size: 13px;
    color: #888;
  }

  .group-container {
    padding: 18px;
    overflow-x: hidden;
    overflow-y: scroll;
    @include scroll-bar();
  }

  .group-header {
    margin-bottom: 20px;
  }

  .search-members {
    margin-bottom: 20px;
  }

  .members-list {
    margin-bottom: 20px;
  }

  .group-footer {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    align-items: center; 
    width: 100%;

    //普通样式
    .ordinary-btn {
       display: flex;
       border: none;
       background: transparent;
       align-items: center;
       justify-content: space-between; 
       color: var(--main-text-color);
       font-weight: 400;
       width: 100%;
       .left {
          text-align: left;
        }
        .right {
          text-align: right;
        }
        // 开关行（消息免打扰、置顶聊天）
        .switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          .switch-label {
            font-size: 14px;
            font-weight: 500;
            color: var(--main-text-color);
          }
          .switch-btn {
            cursor: pointer;
            --el-switch-button-size: 16px;
            --el-switch-width: 36px;
          }
        }
      }

    .danger-btn {
      display: block;
      color: var(--main-red-color);
      font-weight: 500;
      text-align: center;
    }

  }

  .member-avatar {
    width: 35px;
    height: 35px;
    border: 1px solid #eee;
    border-radius: 2px;
    object-fit: cover;
    margin: 0 auto;
    display: block;
  }

  .member-btn {
    width: 35px;
    height: 35px;
    border: 1px solid #eee;
    border-radius: 2px;
    object-fit: cover;
    display: block;
    margin: 0 auto;
  }

  .member-name {
    height: 20px;
    line-height: 20px;
    margin-top: 5px;
    font-size: 12px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .add-btn {
    width: 35px;
    height: 35px;
    font-size: 20px;
    line-height: 35px;
    text-align: center;
    border: none;
    background-color: #409eff;
    color: white;
  }

  .add-btn i {
    margin-right: 0;
  }

  .expand-btn {
    margin-top: 10px;
    cursor: pointer;
  }

  :deep(.el-dialog__header) {
    padding-bottom: 0px;
  }

  .status_change {
    .el-dialog__header {
      padding-bottom: 0px;
    }
  }
</style>
