<template>
  <div class="single-container">
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <!-- 头部个人信息区 -->
      <div class="header-section no-select">
        <div class="avatar-wrapper" ref="popRef" @click="toggleAvatarPopover">
          <Avatar :avatar="singleInfo.avatar" :name="singleInfo.remark || singleInfo.name" :width="64"
            :borderRadius="8" />
        </div>
        <div class="info-details">
          <div class="main-name">{{ singleInfo.remark || singleInfo.name }}</div>
          <div v-if="singleInfo.remark" class="sub-name">昵称: {{ singleInfo.name }}</div>
        </div>
      </div>

      <div class="section-divider"></div>

      <!-- 设置区域 -->
      <div class="settings-section">
        <!-- 备注设置 -->
        <div class="setting-item clickable" @click="startEditRemark">
          <span class="label">{{ $t('search.addFriend.remarkLabel') }}</span>
          <div class="content">
            <template v-if="!isEditingRemark">
              <span class="value">{{ form.remark || singleInfo.name || $t('common.noData') }}</span>
              <el-icon class="arrow-icon">
                <ArrowRight />
              </el-icon>
            </template>
            <el-input v-else ref="remarkInputRef" v-model="form.remark" size="small" class="remark-input"
              @blur="cancelEdit" @keyup.enter="saveRemark" @click.stop />
          </div>
        </div>

        <div class="setting-item clickable" @click="switchHistoryMessage">
          <span class="label">{{ $t('chat.toolbar.history') }}</span>
          <div class="content">
            <el-icon class="arrow-icon">
              <ArrowRight />
            </el-icon>
          </div>
        </div>
      </div>

      <div class="section-divider"></div>

      <!-- 交互控制区域 -->
      <div class="settings-section">
        <div class="setting-item">
          <span class="label">{{ $t('chat.toolbar.mute') }}</span>
          <div class="content">
            <el-switch v-model="messageMute" class="custom-switch" />
          </div>
        </div>

        <div class="setting-item">
          <span class="label">{{ $t('chat.toolbar.pin') }}</span>
          <div class="content">
            <el-switch v-model="top" class="custom-switch" />
          </div>
        </div>
      </div>

      <div class="section-divider"></div>

      <!-- 危险操作区域 -->
      <div class="danger-section">
        <div class="danger-item clickable" @click="handleClearFriendMessage">
          {{ $t('dialog.clearChatLog') }}
        </div>
        <div class="danger-item clickable" @click="handleDeleteContact">
          {{ $t('contacts.delete') }}
        </div>
      </div>
    </el-form>
  </div>

  <HistoryDialog :visible="historyDialogParam.showDialog" :title="$t('chat.toolbar.history')"
    @handleClose="toggleHistoryDialog" />

  <el-popover ref="InfoRef" :virtual-ref="popRef" placement="right-end" trigger="click" virtual-triggering width="240">
    <UserPopover :contact="userInfo" />
  </el-popover>
</template>

<script lang="ts" setup>
import { ElMessageBox, ElMessage, FormInstance, FormRules } from 'element-plus';
import { useFriendsStore } from '@/store/modules/friends';
import { useChatStore } from '@/store/modules/chat';
import HistoryDialog from '@/components/History/index.vue';
import Chats from '@/database/entity/Chats';
import Avatar from '@/components/Avatar/index.vue';
import UserPopover from '@/components/UserPopover/index.vue';
import { globalEventBus } from '@/hooks/useEventBus';
import { CHAT_CHANGED, FRIEND_REMARK_UPDATED } from '@/constants/events';
import { MAX_REMARK_LEN } from '@/constants';
import type { PopoverInstance } from 'element-plus';

const { t: $t } = useI18n();
const chatStore = useChatStore();
const friendStore = useFriendsStore();

const formRef = ref<FormInstance>();
const remarkInputRef = ref<HTMLInputElement>();

const form = ref({
  remark: ''
});

const rules = ref<FormRules>({
  remark: [{ required: false, message: '', trigger: 'blur' }]
});

const fromId = computed(() => String(chatStore.currentChat?.toId ?? ''));
const userInfo = ref<any>();
const emit = defineEmits(['handleDeleteContact', 'handleClearFriendMessage']);

const singleInfo = computed(() => {
  const { currentChat } = chatStore;
  return {
    userId: currentChat?.toId,
    name: currentChat?.name,
    avatar: currentChat?.avatar,
    remark: (currentChat as any)?.remark
  };
});

const InfoRef = ref<PopoverInstance>();
const popRef = ref<HTMLElement | null>(null);
const toggleAvatarPopover = () => {
  const pop = InfoRef.value as any;
  if (pop?.popperRef?.isShow) pop.hide?.();
  else pop?.show?.();
};

const isEditingRemark = ref(false);

const startEditRemark = () => {
  isEditingRemark.value = true;
  form.value.remark = singleInfo.value.remark ?? singleInfo.value.name ?? '';
  nextTick(() => {
    remarkInputRef.value?.focus();
  });
};

const saveRemark = async () => {
  const next = (form.value.remark || '').trim();
  if (!next) {
    ElMessage.warning($t('errors.remark.empty'));
    return cancelEdit();
  }
  if (next.length > MAX_REMARK_LEN) {
    ElMessage.error($t('errors.remark.tooLong', { max: MAX_REMARK_LEN }));
    return;
  }
  try {
    await friendStore.updateFriendRemark(fromId.value, next);
    isEditingRemark.value = false;
    ElMessage.success('备注保存成功');
  } catch (error) {
    console.error('保存备注失败:', error);
    ElMessage.error('保存备注失败');
  }
};

const cancelEdit = () => {
  isEditingRemark.value = false;
  form.value.remark = singleInfo.value.remark ?? singleInfo.value.name ?? '';
};

const historyDialogParam = ref({ showDialog: false });
const switchHistoryMessage = () => {
  historyDialogParam.value.showDialog = true;
};
const toggleHistoryDialog = () => {
  historyDialogParam.value.showDialog = !historyDialogParam.value.showDialog;
};

const currentItem = computed(() => {
  const { currentChat } = chatStore;
  const chatId = currentChat?.chatId;
  if (!chatId) return null;
  return chatStore.getChatById(chatId);
});

const top = computed({
  get: () => currentItem.value?.isTop === 1,
  set: () => {
    if (currentItem.value) chatStore.handlePinChat(currentItem.value as Chats);
  }
});

const messageMute = computed({
  get: () => currentItem.value?.isMute === 1,
  set: () => {
    if (currentItem.value) chatStore.handleMuteChat(currentItem.value as Chats);
  }
});

const loadUserInfo = async () => {
  const id = chatStore.currentChat?.toId;
  if (!id) return;
  userInfo.value = await friendStore.handleGetContactInfo(id);
  form.value.remark = userInfo.value?.remark ?? '';
};

const onBusChatChanged = (payload: any) => {
  if (payload && String(payload.chatId) === String(chatStore.currentChat?.chatId)) {
    loadUserInfo();
  }
};
const onRemarkUpdated = (payload: any) => {
  const id = String(chatStore.currentChat?.toId ?? '');
  if (payload && String(payload.friendId) === id) loadUserInfo();
};

onMounted(() => {
  loadUserInfo();
  globalEventBus.on(CHAT_CHANGED as any, onBusChatChanged as any);
  globalEventBus.on(FRIEND_REMARK_UPDATED as any, onRemarkUpdated as any);
});
onUnmounted(() => {
  globalEventBus.off(CHAT_CHANGED as any, onBusChatChanged as any);
  globalEventBus.off(FRIEND_REMARK_UPDATED as any, onRemarkUpdated as any);
});

const handleClearFriendMessage = () => {
  ElMessageBox.confirm('确定清空该好友的聊天记录？', '提示', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      emit('handleClearFriendMessage');
    })
    .catch(() => { });
};

const handleDeleteContact = () => {
  ElMessageBox.confirm('确定删除该好友？', '删除好友', {
    distinguishCancelAndClose: true,
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'error'
  })
    .then(() => {
      emit('handleDeleteContact');
    })
    .catch(() => { });
};
</script>

<style lang="scss" scoped>
.single-container {
  height: 100%;
  background-color: #f8f9fa;
  overflow-y: auto;
  overflow-x: hidden;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 10px;
    background-color: rgba(0, 0, 0, 0.1);
  }
}

.header-section {
  padding: 30px 20px;
  background-color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;

  .avatar-wrapper {
    cursor: pointer;
    transition: transform 0.2s;

    &:hover {
      transform: scale(1.05);
    }
  }

  .info-details {
    text-align: center;

    .main-name {
      font-size: 18px;
      font-weight: 600;
      color: #333;
      margin-bottom: 4px;
    }

    .sub-name {
      font-size: 13px;
      color: #888;
    }
  }
}

.section-divider {
  height: 12px;
  background-color: #f0f2f5;
}

.settings-section {
  background-color: #fff;

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    border-bottom: 1px solid #f0f2f5;
    min-height: 30px;

    &:last-child {
      border-bottom: none;
    }

    &.clickable {
      cursor: pointer;

      &:active {
        background-color: #f5f5f5;
      }
    }

    .label {
      font-size: 14px;
      color: #333;
    }

    .content {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #888;
      font-size: 14px;
      max-width: 60%;

      .value {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .arrow-icon {
        font-size: 14px;
        color: #ccc;
      }

      .remark-input {
        :deep(.el-input__inner) {
          text-align: right;
        }
      }
    }
  }
}

.danger-section {
  background-color: #fff;

  .danger-item {
    padding: 14px 20px;
    text-align: center;
    font-size: 15px;
    color: #ff4d4f;
    border-bottom: 1px solid #f0f2f5;
    cursor: pointer;

    &:last-child {
      border-bottom: none;
    }

    &:active {
      background-color: #fff1f0;
    }
  }
}

.custom-switch {
  --el-switch-on-color: #409eff;
}
</style>
