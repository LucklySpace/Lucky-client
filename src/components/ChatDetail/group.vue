<template>
  <el-scrollbar :height="chatHeight">
    <div class="group-container">
      <!-- 顶层表单容器：承载整个页面块（参照 single.vue 的组织形式） -->
      <el-form :model="groupInfoData" label-position="top" @submit.prevent>
        <!-- 搜索群成员 -->
        <el-form-item class="search-members" :label="$t('chat.groupChat.searchMembers')">
          <el-input
            v-model="searchText"
            class="input-with-select"
            clearable
            :placeholder="$t('chat.groupChat.searchMembers')"
          >
            <template #append>
              <el-button icon="el-icon-search"></el-button>
            </template>
          </el-input>
        </el-form-item>

        <!-- 群成员列表 -->
        <el-form-item class="members-list" :label="$t('chat.groupChat.members')">
          <el-row :gutter="20">
            <!-- 群成员 -->
            <el-col v-for="item in displayedMembers" :key="item.userId" :span="6">
              <!-- 保持你的头像样式与组件 -->
              <span class="member-avatar">
                <Avatar :avatar="item.avatar" :name="item.name" :width="35" :borderRadius="2"></Avatar>
              </span>
              <div :title="item.name ?? ''" class="member-name">{{ item.name }}</div>
            </el-col>

            <!-- 添加按钮 -->
            <el-col :span="6">
              <el-button class="member-btn" style="margin-bottom: 3px" @click="handleInviteDialog">
                <i class="iconfont icon-jia" style="margin-left: -5px"></i>
              </el-button>
              <div class="member-name">{{ $t("actions.add") }}</div>
            </el-col>
          </el-row>

          <!-- 折叠按钮 -->
          <el-button v-if="filteredMembers.length > 16" class="group-footer" link type="primary" @click="toggleExpand">
            {{ isExpanded ? $t("chat.groupChat.collapse") : $t("chat.groupChat.viewMore") }}
          </el-button>
        </el-form-item>

        <el-divider></el-divider>

        <!-- 群聊名称 -->
        <el-form-item :label="$t('chat.groupChat.groupName')" class="group-header">
          <!-- 群聊名称编辑区域 -->
          <div class="editable-field" @click="startEditGroupName" v-if="!isEditingGroupName">
            <span class="field-text">{{ groupInfoData.name }}</span>
            <el-icon class="edit-icon"><Edit /></el-icon>
          </div>
          <!-- 编辑输入框 -->
          <div v-else class="edit-field" v-click-outside="checkAndCancelEditGroupName">
            <el-input
              ref="groupNameInputRef"
              v-model="editingGroupName"
              :placeholder="groupInfoData.name"
              @keydown.enter.prevent="saveGroupInfo"
              size="small"
            />
          </div>
        </el-form-item>

        <!-- 群公告 -->
        <el-form-item :label="$t('chat.groupChat.groupNotice')" class="group-notice">
          <div class="group-notice-display" @click="startEditGroupNotice" v-if="!isEditingGroupNotice">
            {{ groupInfoData.notification?.trim() ? groupInfoData.notification : $t("group.noAnnouncement") }}
          </div>
          <div v-else class="el-textarea" v-click-outside="checkAndCancelEditGroupNotice">
            <el-input
              ref="groupNoticeRef"
              type="textarea"
              :rows="3"
              style="width: 240px"
              v-model="editingGroupNotice"
              :placeholder="groupInfoData.notification"
              @keydown.enter.prevent="saveGroupInfo"
            />
          </div>
        </el-form-item>

        <el-divider></el-divider>

        <!-- 底部操作（保持你的 class 与内容，仅用 form-item 承载） -->
        <div class="group-footer">
          <el-form-item style="margin-bottom: 0">
            <button class="ordinary-btn" @click="switchHistoryMessage">
              <span>{{ $t("chat.toolbar.history") }}</span>
              <span
                ><el-icon><ArrowRight /></el-icon
              ></span>
            </button>
          </el-form-item>

          <el-divider />

          <el-form-item class="switch-form-item" style="margin-bottom: 0">
            <div class="ordinary-btn">
              <span class="switch-label">{{ $t("chat.toolbar.mute") }}</span>
              <span><el-switch v-model="messageMute" class="switch-btn" /></span>
            </div>
          </el-form-item>

          <el-form-item class="switch-form-item" style="margin-bottom: 0">
            <div class="ordinary-btn">
              <span class="switch-label">{{ $t("chat.toolbar.pin") }}</span>
              <el-switch v-model="top" class="switch-btn" />
            </div>
          </el-form-item>
        </div>

        <el-divider></el-divider>

        <div class="group-footer">
          <el-form-item style="margin-bottom: 0" class="danger">
            <button link class="danger-btn" @click="handleClearGroupMessage">
              {{ $t("dialog.clearChatLog") }}
            </button>
          </el-form-item>

          <el-divider />

          <el-form-item class="danger">
            <button link class="danger-btn" @click="handleQuitGroup">
              {{ $t("contacts.deleteGroup") }}
            </button>
          </el-form-item>
        </div>
      </el-form>

      <!-- 原有弹窗保持不变 -->
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
        @handleClose="toggleHistoryDialog"
      />
    </div>
  </el-scrollbar>
</template>

<script lang="ts" setup>
  import SelectContact from "@/components/SelectContact/index.vue";
  import { reactive } from 'vue';
  import { ElMessageBox, ElMessage } from "element-plus";
  import { useChatStore } from "@/store/modules/chat";
  import { useFriendsStore } from "@/store/modules/friends";
  import { IMessageType } from "@/constants";
  import Chats from "@/database/entity/Chats";
  import HistoryDialog from "@/components/History/index.vue";
  import { ClickOutside as vClickOutside } from "element-plus";
  import Avatar from "@/components/Avatar/index.vue";
  import { globalEventBus } from "@/hooks/useEventBus";
  import { CHAT_CHANGED, GROUP_RENAMED } from "@/constants/events";

  const chatStore = useChatStore();
  const friendStore = useFriendsStore();

  const emit = defineEmits(["handleQuitGroup", "handleClearGroupMessage"]);

  const searchText = ref("");
  const isExpanded = ref(false);
  const inviteDialogVisible = ref(false);

  //

  //获取聊天框高度
  const chatHeight = computed(() => {
    return window.innerHeight - 120;
  });

  /**
   * 获取群详情
   * —— 改为 reactive（变量名不变）
   */
  const groupInfoData = reactive({
    name: "",
    notification: "暂无"
  });

  // 事件处理器（用于 EventBus 订阅/反订阅）
  const onBusGroupRenamed = (payload: any) => {
    if (payload && chatStore.currentChat && String(payload.groupId) === String(chatStore.currentChat.chatId)) {
      nextTick(() => {
        groupInfoData.name = payload.groupName ?? groupInfoData.name;
      });
    }
  };

  const onBusChatChanged = (payload: any) => {
    if (payload && chatStore.currentChat && String(payload.chatId) === String(chatStore.currentChat.chatId)) {
      nextTick(() => {
        if (payload.name !== undefined) groupInfoData.name = payload.name;
        if (payload.notification !== undefined) groupInfoData.notification = payload.notification || "暂无";
      });
    }
  };

  // 更新群组信息的函数
  function updateGroupInfoData() {
    const currentChat = chatStore.currentChat;
    if (currentChat && currentChat.chatType == IMessageType.GROUP_MESSAGE.code) {
      groupInfoData.name = currentChat.name ?? "未知用户";
      groupInfoData.notification = (currentChat as any).notification || "暂无";
    }
  }

  // 组件挂载时初始化群组信息
  onMounted(() => {
    updateGroupInfoData();

    globalEventBus.on(GROUP_RENAMED as any, onBusGroupRenamed as any);
    globalEventBus.on(CHAT_CHANGED as any, onBusChatChanged as any);
  });

  onUnmounted(() => {
    globalEventBus.off(GROUP_RENAMED as any, onBusGroupRenamed as any);
    globalEventBus.off(CHAT_CHANGED as any, onBusChatChanged as any);
  });

  // 监听 currentChat 的变化
  watch(
    () => chatStore.currentChat?.chatId,
    () => nextTick(() => updateGroupInfoData()),
    { immediate: true }
  );

  /**
   * 获取群成员
   */
  const filteredMembers = computed(() => {
    const raw = (chatStore as any).currentChatGroupMemberMap; // 可能是 ref
    const source: any = raw?.value ?? raw;
    let members: any[] = [];
    if (Array.isArray(source)) members = source;
    else if (source && typeof source === 'object') members = Object.values(source);

    const q = searchText.value.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m: any) => (m?.name || '').toLowerCase().includes(q));
  });

  /** 显示成员 */
  const displayedMembers = computed(() => {
    return isExpanded.value ? filteredMembers.value : filteredMembers.value.slice(0, 15);
  });

  /** 控制展开 */
  const toggleExpand = () => {
    isExpanded.value = !isExpanded.value;
  };

  const handleInviteDialog = () => {
    inviteDialogVisible.value = !inviteDialogVisible.value;
  };

  /** 邀请群成员 */
  const handleAddGroupMember = (arr: any) => {
    if (arr && arr.length <= 0) return;
    chatStore.handleAddGroupMember(arr, true);
  };

  //编辑群聊名称
  const isEditingGroupName = ref(false);
  const editingGroupName = ref("");
  const groupNameInputRef = ref();

  const startEditGroupName = () => {
    isEditingGroupName.value = true;
    editingGroupName.value = groupInfoData.name;
    nextTick(() => {
      if (groupNameInputRef.value) {
        groupNameInputRef.value.focus();
      }
    });
  };

  // 编辑发布群公告
  const isEditingGroupNotice = ref(false);
  const editingGroupNotice = ref(groupInfoData.notification ?? "");

  // 更新群聊信息
  const saveGroupInfo = async () => {
    // 后端 groupId 使用服务端群ID；本地更新需要 chatId，store 内部将按 chatId 处理
    const chatId = chatStore.currentChat?.chatId;
    const groupId = chatStore.currentChat?.toId;
    if (!chatId || !groupId) return;

    const updateData: {
      groupId: string; // 服务端群ID
      chatId?: string; // 本地会话ID
      groupName?: string;
      notification?: string;
    } = { groupId, chatId };

    if (editingGroupName.value.trim() && editingGroupName.value !== groupInfoData.name) {
      updateData.groupName = editingGroupName.value;
    }
    if (editingGroupNotice.value.trim() && editingGroupNotice.value !== groupInfoData.notification) {
      updateData.notification = editingGroupNotice.value;
    }

    if (!updateData.groupName && !updateData.notification) {
      isEditingGroupName.value = false;
      isEditingGroupNotice.value = false;
      return;
    }

    try {
      await chatStore.updateGroupInfo(updateData as any);
      if (updateData.groupName) groupInfoData.name = updateData.groupName;
      if (updateData.notification) groupInfoData.notification = updateData.notification;
      isEditingGroupName.value = false;
      isEditingGroupNotice.value = false;
      ElMessage.success("群信息已更新");
    } catch (e) {
      ElMessage.error("更新失败");
    }
  };

  const checkAndCancelEditGroupName = () => {
    if (editingGroupName.value.trim() && editingGroupName.value !== groupInfoData.name) {
      ElMessageBox.confirm("检测到群名称有更改，是否保存更改？", "提示", {
        confirmButtonText: "保存",
        cancelButtonText: "不保存",
        type: "warning"
      })
        .then(() => saveGroupInfo())
        .catch(() => cancelEditGroupName());
    } else {
      cancelEditGroupName();
    }
  };

  const cancelEditGroupName = () => {
    isEditingGroupName.value = false;
    editingGroupName.value = groupInfoData.name;
  };

  const startEditGroupNotice = () => {
    isEditingGroupNotice.value = true;
    editingGroupNotice.value = groupInfoData.notification ?? "";
  };
  const checkAndCancelEditGroupNotice = () => {
    if (editingGroupNotice.value.trim() && editingGroupNotice.value !== groupInfoData.notification) {
      ElMessageBox.confirm("检测到群公告有更改，是否保存更改？", "提示", {
        confirmButtonText: "保存",
        cancelButtonText: "不保存",
        type: "warning"
      })
        .then(() => {
          saveGroupInfo();
        })
        .catch(() => {
          cancelEditGroupNotice();
        });
    } else {
      cancelEditGroupNotice();
    }
  };
  const cancelEditGroupNotice = () => {
    isEditingGroupNotice.value = false;
    editingGroupNotice.value = groupInfoData.notification ?? "";
  };

  //查找聊天信息
  const switchHistoryMessage = () => {
    historyDialogParam.showDialog = true;
  };
  const historyDialogParam = reactive({ showDialog: false });
  const toggleHistoryDialog = () => {
    historyDialogParam.showDialog = !historyDialogParam.showDialog;
  };

  //置顶聊天
  const currentItem = computed(() => {
    const { currentChat } = chatStore;
    const chatId = currentChat?.chatId;
    if (!chatId) return null;
    return chatStore.getChatById(chatId);
  });

  const top = computed<boolean>({
    get: () => (currentItem.value?.isTop ?? 0) === 1,
    set: (_v: boolean) => {
      if (currentItem.value) chatStore.handlePinChat(currentItem.value as Chats);
    }
  });

  //消息免打扰
  const messageMute = computed<boolean>({
    get: () => (currentItem.value?.isMute ?? 0) === 1,
    set: (_v: boolean) => {
      if (currentItem.value) chatStore.handleMuteChat(currentItem.value as Chats);
    }
  });

  const handleClearGroupMessage = () => {
    ElMessageBox.confirm("确定清空该群聊的聊天记录？", "提示", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning"
    })
      .then(() => {
        emit("handleClearGroupMessage");
      })
      .catch(() => {});
  };

  const handleQuitGroup = () => {
    ElMessageBox.confirm("确定退出群聊?", "退出群聊", {
      distinguishCancelAndClose: true,
      confirmButtonText: "确认",
      cancelButtonText: "取消"
    })
      .then(() => {
        emit("handleQuitGroup");
      })
      .catch(() => {});
  };
</script>

<!-- 样式保持备份版 -->
<style lang="scss" scoped>
  /* 定义滚动条宽度 */
  @mixin scroll-bar($width: 6px) {
    &::-webkit-scrollbar-track {
      border-radius: 10px;
      background-color: #ddd;
    }
    &::-webkit-scrollbar {
      width: thin;
      height: 10px;
      color: none;
      background-color: transparent;
      transition: opacity 0.3s ease;
    }
    &::-webkit-scrollbar-thumb {
      border-radius: 10px;
      background-color: rgba(155, 155, 155, 0.2);
    }
  }

  .group-container {
    padding: 18px;
    overflow-x: hidden;
    overflow-y: auto;
    @include scroll-bar();

    &::-webkit-scrollbar-thumb {
      &:hover {
        background-color: rgba(155, 155, 155, 0.2);
      }
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
    overflow-y: auto; /* 改为 auto */
    @include scroll-bar();
  }

  .group-header {
    /* 群聊名称编辑区域样式 */
    .editable-field {
      display: flex;
      align-items: center;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s ease;

      .field-text {
        border: none;
        flex: 1;
        font-size: 14px;
        color: var(--main-text-color);
        word-break: break-all;
      }

      .edit-icon {
        margin-left: 8px;
        color: #999;
        font-size: 12px;
      }
    }

    /* 编辑输入框容器样式 */
    .edit-field {
      width: 100%;
      padding: 4px 0;
      .el-input {
        margin-bottom: 8px;
        :deep(.el-input__inner) {
          font-size: 14px;
          padding: 1px 1px;
          border-radius: 4px;
          border: 1px solid transparent;
        }
      }
    }

    /* 群公告样式 */
    .group-notice {
      /* 群公告显示样式 */
      .group-notice-display {
        font-size: 13px;
        color: #666;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .el-textarea {
        :deep(.el-textarea__inner) {
          font-size: 13px;
          color: #666;
          border-radius: 4px;
          border: 1px solid #dcdfe6;

          &:focus {
            border-color: #409eff;
            box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
          }
        }
      }
    }

    /* 表单项目样式 */
    .group-title {
      :deep(.el-form-item) {
        .el-form-item__label {
          font-size: 13px;
          color: #666;
          padding: 0 0 6px 0;
        }
      }
    }
  }

  .search-members {
    margin-bottom: 20px;
  }

  .members-list {
    margin-bottom: 20px;
  }

  .group-footer {
    // margin-top: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;

    :deep(.el-form-item) {
      display: flex;
      width: 100%;
      .el-form-item__content {
        flex: 1;
      }
    }
    //普通样式
    .ordinary-btn {
      display: flex;
      border: none;
      height: auto;
      padding: 5px 8px;
      background: transparent;
      align-items: center;
      justify-content: space-between;
      color: var(--main-text-color);
      font-weight: 400;
      width: 100%;

      // 开关行（消息免打扰、置顶聊天）

      .switch-label {
        font-size: 14px;
        color: var(--main-text-color);
      }
      .switch-btn {
        cursor: pointer;
        --el-switch-button-size: 16px;
        --el-switch-width: 36px;
      }
    }
    :deep(.el-form-item:not(.danger)) {
      display: flex;
      width: 100%;
      .el-form-item__content {
        flex: 1;
      }
    }
    :deep(.el-form-item.danger) {
      width: auto; // 1. 允许 el-form-item 本身宽度自适应
      .el-form-item__content {
        flex: initial; // 2. 阻止内容区伸展，让其包裹按钮即可
      }
    }
    .danger-btn {
      color: var(--main-red-color);
      text-align: center;
      font-weight: 500;

      border: none;
      background: transparent;
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
