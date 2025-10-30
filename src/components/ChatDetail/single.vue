<template>
  <div class="single-container">
    <!-- 好友信息区域 -->
    <div class="friend-info no-select">
      <el-row :gutter="20" align="middle">
        <el-col :span="6">
          <el-image :alt="singleInfo.name" :src="singleInfo.avatar || defaultImg" class="friend-avatar" fit="cover" />
          <!-- <div class="friend-name">{{ singleInfo.name }}</div> -->
        </el-col>
      </el-row>
    </div>

    <!-- <el-divider />

     好友备注
    <div class="friend-remark">
      <el-form :model="singleForm" label-width="80px" label-position="top">
        <el-form-item label="备注">
           展示模式 
          <p v-if="!isEditing" class="remark-text" @click="startEdit">
            {{ singleInfo.name || "点击添加备注" }}
          </p>

          编辑模式
          <el-input
            v-else
            v-model="singleInfo.name"
            placeholder="请输入备注"
            ref="remarkInputRef"
            @blur="saveEdit"
            @keyup.enter="saveEdit"
          />
        </el-form-item>
      </el-form>
    </div> -->

    <el-divider />

    <!-- 底部操作按钮 -->
    <div class="friend-actions">
      <!-- 查找历史聊天记录 -->
      <button class="ordinary-btn"@click="switchHistoryMessage">
        <span class="left">{{ $t(`chat.toolbar.history`) }}</span>
        <span class="right"><el-icon><ArrowRight /></el-icon></span>
      </button>
      <el-divider />
      <!-- 消息免打扰 -->
      <button class="ordinary-btn">
        <span class="switch-label">{{ $t(`settings.notification.mute`) }}</span>
        <el-switch v-model="messageMute" class="switch-btn" />
      </button>
      <!-- 置顶 -->
      <button class="ordinary-btn">
        <span class="switch-label">{{ $t(`chat.toolbar.pin`) }}</span>
        <el-switch v-model="top" class="switch-btn" />
      </button>
    </div>
    <el-divider />
    <div class="friend-actions">
      <el-button 
        class="danger-btn" 
        link 
        @click="handleClearFriendMessage">
        {{ $t(`dialog.clearChatLog`) }}
    </el-button>
      <el-divider />
      <el-button 
       class="danger-btn"
       link 
       @click="handleDeleteContact">
       {{ $t(`contacts.delete`) }}
      </el-button>
    </div>
  </div>
  <HistoryDialog :visible="historyDialogParam.showDialog" title="聊天历史记录" @handleClose="toggleHistoryDialog" />

</template>

<script lang="ts" setup>
  import { computed, ref, watch } from "vue";
  import { ElMessageBox } from "element-plus";
  import { useChatMainStore } from "@/store/modules/chat";
  import defaultImg from "@/assets/avatar/default.jpg";
  import HistoryDialog from "@/components/History/index.vue";
  import Chats from "@/database/entity/Chats";

  const chatStore = useChatMainStore();

  // 事件定义
  const emit = defineEmits([
    "handleDeleteContact", 
    "handleClearFriendMessage"
  ]);

  // 表单数据（预留：可用于备注编辑等扩展）
  const singleForm = ref({});

  const isEditing = ref(false);
  const remarkInputRef = ref();

  // 当前会话好友信息
  const singleInfo = computed(() => {
    const { currentChat } = chatStore;
    return {
      userId: currentChat?.id,
      name: currentChat?.name,
      avatar: currentChat?.avatar
    };
  });

  function startEdit() {
    isEditing.value = true;
    nextTick(() => {
      remarkInputRef.value?.focus(); // 自动聚焦
    });
  }

  function saveEdit() {
    isEditing.value = false;
    // TODO: 这里可以调用接口保存备注，比如：
    // await api.updateRemark(singleInfo.value.name)
  }

  //查找聊天信息
  const switchHistoryMessage = () => {
    historyDialogParam.value.showDialog = true;
  };
  const historyDialogParam = ref({showDialog: false})
  const toggleHistoryDialog = () => {
    historyDialogParam.value.showDialog = !historyDialogParam.value.showDialog;
  }
  
  //置顶会话
  //通过监听开关值的变化调动store中的函数
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


  /**
   *清空聊天记录
   */
  const handleClearFriendMessage = () => {
    ElMessageBox.confirm("确定清空该好友的聊天记录？", "提示", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning"
    })
      .then(() => {
        emit("handleClearFriendMessage");
      })
      .catch(() => {
      });
  };

  /**
   * 删除好友
   */
  const handleDeleteContact = () => {
    ElMessageBox.confirm("确定删除该好友？", "删除好友", {
      distinguishCancelAndClose: true,
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "error"
    })
      .then(() => {
        emit("handleDeleteContact");
      })
      .catch(() => {
      });
  };
</script>

<style lang="scss" scoped>
  /* 滚动条样式 */
  @mixin scroll-bar($width: 8px) {
    &::-webkit-scrollbar {
      width: $width;
      background-color: transparent;
    }
    &::-webkit-scrollbar-thumb {
      border-radius: 10px;
      background-color: rgba(0, 0, 0, 0.2);
    }
    &::-webkit-scrollbar-track {
      background-color: transparent;
    }
  }

  /* 容器整体 */
  .single-container {
    padding: 18px;
    overflow-y: auto;
    overflow-x: hidden;
    @include scroll-bar();
  }

  /* 好友信息区域 */
  .friend-info {
    margin-bottom: 20px;

    .friend-avatar {
      width: 50px;
      height: 50px;
      border: 1px solid #eee;
      border-radius: 6px;
      object-fit: cover;
    }

    .friend-name {
      margin-top: 8px;
      font-size: 14px;
      text-align: center;
      color: #333;
      font-weight: 500;
    }
  }

  /* 备注区域 */
  .friend-remark {
    margin-bottom: 20px;

    .remark-text {
      margin: 0;
      font-size: 13px;
      color: #666;
    }
  }
  /* 操作按钮区域 */
  .friend-actions {
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
      color: var(--main-red-color);
      font-weight: 500;
      text-align: center;
    }
  }

  :deep(.el-divider) {
    margin: 15px 2px;
  }
</style>
