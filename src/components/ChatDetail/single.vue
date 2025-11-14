<template>
  <div class="single-container">
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <!-- 好友信息区域 -->
      <div class="friend-info no-select">
        <el-row :gutter="20" align="middle">
          <el-col :span="6">
            <span ref="popRef" class="friend-avatar" @click="onClickOutside">
              <Avatar
                :avatar="singleInfo.avatar"
                :name="singleInfo.remark || singleInfo.name"
                :width="50"
                :borderRadius="6"
              ></Avatar>
            </span>
          </el-col>
        </el-row>
      </div>

      <el-divider />

      <!-- 备注表单 -->
      <el-form-item :label="$t('search.addFriend.remarkLabel')" prop="remark" class="remark-form">
        <div v-if="!isEditingRemark" class="remark-display" @click="startEditRemark">
          {{ form.remark || singleInfo.name || $t("common.noData") }}
        </div>
        <el-input
          v-else
          ref="remarkInputRef"
          v-model="form.remark"
          size="small"
          @blur="saveRemark"
          @keyup.enter="saveRemark"
        />
      </el-form-item>

      <el-divider />

      <!-- 底部操作按钮 -->
      <div class="friend-actions">
        <!-- 查找历史聊天记录 -->
        <el-form-item>
          <button type="button" class="full-width-btn" @click="switchHistoryMessage">
            <span>{{ $t(`chat.toolbar.history`) }}</span>
            <span>
              <el-icon><ArrowRight /></el-icon>
            </span>
          </button>
        </el-form-item>

        <el-divider />

        <!-- 消息免打扰 -->
        <el-form-item class="switch-form-item">
          <div class="switch-row">
            <span class="switch-label">{{ $t(`chat.toolbar.mute`) }}</span>
            <el-switch v-model="messageMute" class="switch-btn" @change="onMuteChange" />
          </div>
        </el-form-item>

        <!-- 置顶 -->
        <el-form-item class="switch-form-item">
          <div class="switch-row">
            <span class="switch-label">{{ $t(`chat.toolbar.pin`) }}</span>
            <el-switch v-model="top" class="switch-btn" @change="onTopChange" />
          </div>
        </el-form-item>
      </div>

      <el-divider />

      <div class="friend-actions">
        <el-form-item class="danger">
          <el-button class="full-width-btn danger-btn" link @click="handleClearFriendMessage">
            {{ $t(`dialog.clearChatLog`) }}
          </el-button>
        </el-form-item>

        <el-divider />

        <el-form-item class="danger">
          <el-button class="danger-btn full-width-btn" link @click="handleDeleteContact">
            {{ $t(`contacts.delete`) }}
          </el-button>
        </el-form-item>
      </div>
    </el-form>
  </div>
  <HistoryDialog :visible="historyDialogParam.showDialog" title="聊天历史记录" @handleClose="toggleHistoryDialog" />
  <el-popover ref="InfoRef" :virtual-ref="popRef" placement="right-end" trigger="click" virtual-triggering width="240">
    <UserPopover :contact="userInfo"></UserPopover>
  </el-popover>
</template>

<script lang="ts" setup>
  import { ElMessageBox, ElMessage, FormInstance, FormRules } from "element-plus";
  import { useFriendsStore } from "@/store/modules/friends";
  import { useChatStore } from "@/store/modules/chat";
  import HistoryDialog from "@/components/History/index.vue";
  import Chats from "@/database/entity/Chats";
  import Avatar from "@/components/Avatar/index.vue";
  import UserPopover from "@/components/UserPopover/index.vue";
  import { globalEventBus } from "@/hooks/useEventBus";
  import { CHAT_CHANGED } from "@/constants/events";
  import { MAX_REMARK_LEN } from "@/constants";
  import type { PopoverInstance } from "element-plus";

  const { t: $t } = useI18n();
  const chatStore = useChatStore();
  const friendStore = useFriendsStore();

  // 表单相关
  const formRef = ref<FormInstance>();
  const remarkInputRef = ref<HTMLInputElement>();

  const form = ref({
    remark: ""
  });

  const rules = ref<FormRules>({
    remark: [{ required: false, message: "", trigger: "blur" }]
  });

  // 对方用户ID使用当前会话的 toId
  const fromId = computed(() => String(chatStore.currentChat?.toId ?? ""));

  const userInfo = ref();

  // 事件定义
  const emit = defineEmits(["handleDeleteContact", "handleClearFriendMessage"]);

  // 当前会话好友信息
  const singleInfo = computed(() => {
    const { currentChat } = chatStore;
    return {
      userId: currentChat?.toId,
      name: currentChat?.name,
      avatar: currentChat?.avatar,
      remark: (currentChat as any)?.remark
    };
  });

  //展示弹窗
  const InfoRef = ref<PopoverInstance>();
  const popRef = ref();
  const onClickOutside = async () => {
    InfoRef.value?.hide();
  };

  //备注功能
  const isEditingRemark = ref(false);

  const startEditRemark = () => {
    isEditingRemark.value = true;
    form.value.remark = singleInfo.value.remark ?? singleInfo.value.name ?? "";
    nextTick(() => {
      remarkInputRef.value?.focus();
    });
  };

  //用来实现修改备注的功能
  const saveRemark = async () => {
    const next = (form.value.remark || "").trim();
    if (!next) {
      ElMessage.warning($t("errors.remark.empty"));
      return cancelEdit();
    }
    if (next.length > MAX_REMARK_LEN) {
      ElMessage.error($t("errors.remark.tooLong"));
      return;
    }

    try {
      await friendStore.updateFriendRemark(fromId.value, next);
      isEditingRemark.value = false;
      ElMessage.success("备注保存成功");
    } catch (error) {
      console.error("保存备注失败:", error);
      ElMessage.error("保存备注失败");
      isEditingRemark.value = true;
    }
  };

  const cancelEdit = () => {
    isEditingRemark.value = false;
    form.value.remark = singleInfo.value.remark ?? singleInfo.value.name ?? "";
  };

  //查找聊天信息
  const switchHistoryMessage = () => {
    historyDialogParam.value.showDialog = true;
  };
  const historyDialogParam = ref({ showDialog: false });
  const toggleHistoryDialog = () => {
    historyDialogParam.value.showDialog = !historyDialogParam.value.showDialog;
  };

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
  const onTopChange = (newVal: any) => {
    const boolVal = !!newVal;
    const item = currentItem.value || { isTop: 0 };
    (item as any).isTop = boolVal ? 0 : 1;
    chatStore.handlePinChat(item as Chats);
  };

  //消息免打扰
  const messageMute = ref(currentItem.value?.isMute === 1);
  const onMuteChange = (newVal: any) => {
    const boolVal = !!newVal;
    const item = currentItem.value || { isMute: 0 };
    if (item) {
      (item as any).isMute = boolVal ? 0 : 1;
      chatStore.handleMuteChat(item as Chats);
    }
  };
  // 封装用户信息加载，减少对 watch 的依赖
  const loadUserInfo = async () => {
    const id = chatStore.currentChat?.toId;
    if (!id) return;
    userInfo.value = await friendStore.handleGetContactInfo(id);
    form.value.remark = userInfo.value?.remark ?? "";
  };

  // 首次加载一次
  onMounted(() => {
    loadUserInfo();
  });

  // 可选：订阅全局聊天变更，替代 fromId 的 watch
  const onBusChatChanged = (payload: any) => {
    // 仅在当前会话发生变化时刷新
    if (payload && String(payload.chatId) === String(chatStore.currentChat?.chatId)) {
      loadUserInfo();
    }
  };
  onMounted(() => globalEventBus.on(CHAT_CHANGED as any, onBusChatChanged as any));
  onUnmounted(() => globalEventBus.off(CHAT_CHANGED as any, onBusChatChanged as any));

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
      .catch(() => {});
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
      .catch(() => {});
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

    :deep(.el-form-item) {
      margin-bottom: 0;
    }
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
      display: inline-block;
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
  .remark-form {
    padding: 5px 8px;
    .remark-display {
      color: var(--main-text-color);
      cursor: pointer;
      min-height: 20px;

      &:hover {
        color: #409eff;
      }
    }
  }

  /* 操作按钮区域 */
  .friend-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--main-text-color);
    width: 100%;

    :deep(.el-form-item) {
      display: flex;
      width: 100%;
      .el-form-item__content {
        flex: 1;
      }
    }

    //普通样式
    button.full-width-btn {
      width: 100%;
      height: auto;
      padding: 5px 8px;

      display: flex;
      justify-content: space-between;
      align-items: center;

      border: none;
      background: transparent;
      font-weight: 400;
    }
    :deep(.el-form-item:not(.danger)) {
      display: flex;
      width: 100%;
      .el-form-item__content {
        flex: 1;
      }
    }
    :deep(.el-form-item.danger) {
      width: auto;
      .el-form-item__content {
        flex: initial;
      }
    }
    .danger-btn {
      color: var(--main-red-color);
      font-weight: 400;
      text-align: center;
    }

    .el-button.danger-btn.full-width-btn {
      display: flex;
      align-items: center;
      font-weight: 500;
    }

    .switch-form-item {
      width: 100%;

      :deep(.el-form-item__content) {
        margin-right: 0;
      }
      .switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 5px 8px;

        .switch-label {
          font-size: 14px;
          font-weight: 400;
          color: var(--main-text-color);
        }

        .switch-btn {
          cursor: pointer;
          --el-switch-button-size: 16px;
          --el-switch-width: 36px;
        }
      }
    }
  }

  :deep(.el-divider) {
    margin: 15px 2px;
  }
</style>
