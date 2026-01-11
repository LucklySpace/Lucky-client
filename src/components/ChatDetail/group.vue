<template>
  <el-scrollbar :height="chatHeight">
    <div class="group-container">
      <el-form :model="groupInfoData" label-position="top" @submit.prevent>
        <!-- 搜索群成员 -->
        <div class="search-section">
          <el-input v-model="ui.search" class="group-search" clearable
            :placeholder="$t('chat.groupChat.searchMembers')">
          </el-input>
        </div>

        <!-- 群成员网格 -->
        <div class="members-section">
          <div class="section-header">
            <span>{{ $t('chat.groupChat.members') }} ({{ filteredMembers.length }})</span>
          </div>
          <div class="members-grid">
            <div v-for="item in displayedMembers" :key="item.userId" class="member-item">
              <Avatar class="member-avatar" :avatar="item.avatar" :name="item.name" :width="42" :borderRadius="6" />
              <div class="member-name" :title="item.name">{{ item.name }}</div>
            </div>
            <!-- 添加成员按钮 -->
            <div class="member-item clickable" @click="handleInviteDialog">
              <div class="add-btn">
                <el-icon>
                  <Plus />
                </el-icon>
              </div>
              <div class="member-name">{{ $t("actions.add") }}</div>
            </div>
          </div>
          <div v-if="filteredMembers.length > 15" class="expand-btn-wrapper">
            <el-button link type="primary" @click="toggleExpand">
              {{ ui.members.expanded ? $t("chat.groupChat.collapse") : $t("chat.groupChat.viewMore") }}
            </el-button>
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- 基本设置 -->
        <div class="settings-section">
          <div class="setting-item" :class="{ clickable: isOwner }" @click="startEditGroupName">
            <span class="label">{{ $t('chat.groupChat.groupName') }}</span>
            <div class="content">
              <template v-if="!ui.edit.name.editing">
                <span class="value">{{ groupInfoData.name }}</span>
                <el-icon v-if="isOwner" class="arrow-icon">
                  <ArrowRight />
                </el-icon>
              </template>
              <el-input v-else ref="groupNameInputRef" v-model="ui.edit.name.value" size="small"
                @blur="checkAndCancelEditGroupName" @keydown.enter.prevent="saveGroupInfo" @click.stop />
            </div>
          </div>

          <div class="setting-item" :class="{ clickable: canEditNotice }" @click="startEditGroupNotice">
            <span class="label">{{ $t('chat.groupChat.groupNotice') }}</span>
            <div class="content notice-content">
              <template v-if="!ui.edit.notice.editing">
                <span class="value notice-text">{{ groupInfoData.notification || $t("group.noAnnouncement") }}</span>
                <el-icon v-if="canEditNotice" class="arrow-icon">
                  <ArrowRight />
                </el-icon>
              </template>
              <el-input v-else ref="groupNoticeRef" v-model="ui.edit.notice.value" type="textarea" :rows="3"
                @blur="checkAndCancelEditGroupNotice" @click.stop />
            </div>
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- 交互设置 -->
        <div class="settings-section">
          <div class="setting-item clickable" @click="switchHistoryMessage">
            <span class="label">{{ $t('chat.toolbar.history') }}</span>
            <div class="content">
              <el-icon class="arrow-icon">
                <ArrowRight />
              </el-icon>
            </div>
          </div>

          <div class="setting-item">
            <span class="label">{{ $t('chat.toolbar.mute') }}</span>
            <div class="content">
              <el-switch v-model="ui.switches.mute" class="custom-switch" />
            </div>
          </div>

          <div class="setting-item">
            <span class="label">{{ $t('chat.toolbar.pin') }}</span>
            <div class="content">
              <el-switch v-model="ui.switches.top" class="custom-switch" />
            </div>
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- 危险操作 -->
        <div class="danger-section">
          <div class="danger-item clickable" @click="handleClearGroupMessage">
            {{ $t("dialog.clearChatLog") }}
          </div>
          <div class="danger-item clickable" @click="handleQuitGroup">
            {{ isOwner ? $t("contacts.deleteGroup") : $t("contacts.quitGroup") }}
          </div>
        </div>
      </el-form>

      <!-- 弹窗 -->
      <el-dialog v-model="ui.dialogs.invite" :destroy-on-close="true" class="invite-dialog"
        :title="$t('search.invite.title')" width="550px">
        <SelectContact @handleAddGroupMember="handleAddGroupMember" @handleClose="handleInviteDialog"></SelectContact>
      </el-dialog>

      <HistoryDialog :visible="ui.dialogs.history" :title="$t('chat.toolbar.history')"
        @handleClose="toggleHistoryDialog" />
    </div>
  </el-scrollbar>
</template>

<script lang="ts" setup>
import SelectContact from "@/components/SelectContact/index.vue";
import { reactive, computed, onMounted, onUnmounted, nextTick, ref } from "vue";
import { ElMessageBox, ElMessage } from "element-plus";
import { useChatStore } from "@/store/modules/chat";
import { IMessageType } from "@/constants";
import Chats from "@/database/entity/Chats";
import HistoryDialog from "@/components/History/index.vue";
import Avatar from "@/components/Avatar/index.vue";
import { globalEventBus } from "@/hooks/useEventBus";
import { Events } from "@/constants";
import { useI18n } from "vue-i18n";

const { t: $t } = useI18n();
const chatStore = useChatStore();
const emit = defineEmits(["handleQuitGroup", "handleClearGroupMessage"]);

const ui = reactive({
  search: "",
  members: { expanded: false },
  dialogs: { invite: false, history: false },
  edit: {
    name: { editing: false, value: "" },
    notice: { editing: false, value: "" }
  },
  switches: {} as any
});

const chatHeight = computed(() => window.innerHeight - 60);

const groupInfoData = reactive({
  name: "",
  notification: ""
});

const myMember = computed(() => {
  const raw = (chatStore as any).currentChatGroupMemberMap;
  const source: any = Array.isArray(raw?.value ?? raw) ? raw?.value ?? raw : Object.values(raw?.value ?? raw ?? {});
  const me = String(chatStore.getOwnerId || "");
  return source.find((m: any) => String(m?.userId ?? m?.id) === me);
});

const myRole = computed<number>(() => {
  const m = myMember.value as any;
  const roleLike = m?.role ?? m?.memberRole ?? m?.roleType ?? 0;
  const n = Number(roleLike);
  return Number.isFinite(n) ? n : 0;
});

const isAdmin = computed(() => myRole.value === 1);
const isOwner = computed(() => {
  const currentChat = chatStore.currentChat;
  if (!currentChat) return false;
  const me = chatStore.getOwnerId;
  return currentChat.ownerId === me;
});
const canEditNotice = computed(() => isOwner.value || isAdmin.value);

const onNoPermission = () => {
  ElMessage.warning($t("chat.groupChat.noPermission"));
};

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
      if (payload.notification !== undefined) groupInfoData.notification = payload.notification || "";
    });
  }
};

const onBusGroupNoticeChanged = (payload: any) => {
  if (!payload) return;
  const cid = chatStore.currentChat?.chatId;
  const target = payload.chatId ?? payload.groupId;
  if (!cid || (target && String(target) !== String(cid))) return;
  nextTick(() => {
    if (payload.content !== undefined) groupInfoData.notification = payload.content || "";
  });
};

function updateGroupInfoData() {
  const currentChat = chatStore.currentChat;
  if (currentChat && currentChat.chatType == IMessageType.GROUP_MESSAGE.code) {
    groupInfoData.name = currentChat.name ?? "";
    groupInfoData.notification = (currentChat as any).notification || "";
  }
}

onMounted(() => {
  updateGroupInfoData();
  globalEventBus.on(Events.GROUP_RENAMED as any, onBusGroupRenamed as any);
  globalEventBus.on(Events.CHAT_CHANGED as any, onBusChatChanged as any);
  globalEventBus.on(Events.GROUP_NOTICE_CHANGED as any, onBusGroupNoticeChanged as any);
});

onUnmounted(() => {
  globalEventBus.off(Events.GROUP_RENAMED as any, onBusGroupRenamed as any);
  globalEventBus.off(Events.CHAT_CHANGED as any, onBusChatChanged as any);
  globalEventBus.off(Events.GROUP_NOTICE_CHANGED as any, onBusGroupNoticeChanged as any);
});

const filteredMembers = computed(() => {
  const raw = (chatStore as any).currentChatGroupMemberMap;
  const source: any = raw?.value ?? raw;
  let members: any[] = [];
  if (Array.isArray(source)) members = source;
  else if (source && typeof source === "object") members = Object.values(source);

  const q = ui.search.trim().toLowerCase();
  if (!q) return members;
  return members.filter((m: any) => (m?.name || "").toLowerCase().includes(q));
});

const displayedMembers = computed(() =>
  ui.members.expanded ? filteredMembers.value : filteredMembers.value.slice(0, 14)
);

const toggleExpand = () => {
  ui.members.expanded = !ui.members.expanded;
};

const handleInviteDialog = () => {
  ui.dialogs.invite = !ui.dialogs.invite;
};

const handleAddGroupMember = (arr: any) => {
  if (arr && arr.length <= 0) return;
  chatStore.handleAddGroupMember(arr, true);
};

const groupNameInputRef = ref();
const startEditGroupName = () => {
  if (isOwner.value) {
    ui.edit.name.editing = true;
    ui.edit.name.value = groupInfoData.name;
    nextTick(() => groupNameInputRef.value?.focus());
  } else {
    ElMessage.warning("只有群主才能修改群名称");
  }
};

const saveGroupInfo = async () => {
  const chatId = chatStore.currentChat?.chatId;
  const groupId = chatStore.currentChat?.toId;
  if (!chatId || !groupId) return;

  const updateData: any = { groupId, chatId };
  let hasChange = false;

  if (ui.edit.name.editing && ui.edit.name.value.trim() && ui.edit.name.value !== groupInfoData.name) {
    updateData.groupName = ui.edit.name.value;
    hasChange = true;
  }
  if (ui.edit.notice.editing && ui.edit.notice.value.trim() !== groupInfoData.notification) {
    if (!canEditNotice.value) {
      onNoPermission();
    } else {
      updateData.notification = ui.edit.notice.value;
      hasChange = true;
    }
  }

  if (!hasChange) {
    ui.edit.name.editing = false;
    ui.edit.notice.editing = false;
    return;
  }

  try {
    await chatStore.updateGroupInfo(updateData);
    if (updateData.groupName) groupInfoData.name = updateData.groupName;
    if (updateData.notification !== undefined) groupInfoData.notification = updateData.notification;
    ui.edit.name.editing = false;
    ui.edit.notice.editing = false;
    ElMessage.success("群信息已更新");
  } catch (e) {
    ElMessage.error("更新失败");
  }
};

const checkAndCancelEditGroupName = () => {
  if (ui.edit.name.value.trim() && ui.edit.name.value !== groupInfoData.name) {
    ElMessageBox.confirm("是否保存群名称更改？", "提示", {
      confirmButtonText: "保存",
      cancelButtonText: "取消",
      type: "warning"
    }).then(() => saveGroupInfo()).catch(() => {
      ui.edit.name.editing = false;
      ui.edit.name.value = groupInfoData.name;
    });
  } else {
    ui.edit.name.editing = false;
  }
};

const startEditGroupNotice = () => {
  if (!canEditNotice.value) {
    onNoPermission();
    return;
  }
  ui.edit.notice.editing = true;
  ui.edit.notice.value = groupInfoData.notification;
};

const checkAndCancelEditGroupNotice = () => {
  if (ui.edit.notice.value !== groupInfoData.notification) {
    ElMessageBox.confirm("是否保存群公告更改？", "提示", {
      confirmButtonText: "保存",
      cancelButtonText: "取消",
      type: "warning"
    }).then(() => saveGroupInfo()).catch(() => {
      ui.edit.notice.editing = false;
      ui.edit.notice.value = groupInfoData.notification;
    });
  } else {
    ui.edit.notice.editing = false;
  }
};

const switchHistoryMessage = () => ui.dialogs.history = true;
const toggleHistoryDialog = () => ui.dialogs.history = !ui.dialogs.history;

const currentItem = computed(() => {
  const { currentChat } = chatStore;
  const chatId = currentChat?.chatId;
  return chatId ? chatStore.getChatById(chatId) : null;
});

const top = computed({
  get: () => currentItem.value?.isTop === 1,
  set: () => { if (currentItem.value) chatStore.handlePinChat(currentItem.value as Chats); }
});

const messageMute = computed({
  get: () => currentItem.value?.isMute === 1,
  set: () => { if (currentItem.value) chatStore.handleMuteChat(currentItem.value as Chats); }
});

ui.switches = { top, mute: messageMute };

const handleClearGroupMessage = () => {
  ElMessageBox.confirm("确定清空该群聊的聊天记录？", "提示", {
    confirmButtonText: "确认",
    cancelButtonText: "取消",
    type: "warning"
  }).then(() => emit("handleClearGroupMessage")).catch(() => { });
};

const handleQuitGroup = () => {
  const title = isOwner.value ? "解散群聊" : "退出群聊";
  const msg = isOwner.value ? "确定解散该群聊？" : "确定退出群聊？";
  ElMessageBox.confirm(msg, title, {
    confirmButtonText: "确认",
    cancelButtonText: "取消",
    type: "warning"
  }).then(() => emit("handleQuitGroup")).catch(() => { });
};
</script>

<style lang="scss" scoped>
.group-container {
  height: 100%;
  background-color: #f8f9fa;
}

.search-section {
  padding: 15px 20px;
  background-color: #fff;

  .group-search {
    :deep(.el-input__wrapper) {
      background-color: #f0f2f5;
      box-shadow: none;
      border-radius: 8px;

      &.is-focus {
        background-color: #fff;
        box-shadow: 0 0 0 1px #409eff inset;
      }
    }
  }
}

.members-section {
  padding: 10px;
  background-color: #fff;

  .section-header {
    font-size: 14px;
    color: #888;
    margin-bottom: 15px;
    padding-left: 5px;
  }

  .members-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 15px 10px;

    .member-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      cursor: pointer;

      .member-name {
        font-size: 12px;
        color: #666;
        width: 100%;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .add-btn {
        width: 42px;
        height: 42px;
        border: 1px dashed #ccc;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #999;
        font-size: 20px;
        transition: all 0.2s;

        &:hover {
          border-color: #409eff;
          color: #409eff;
        }
      }
    }
  }

  .expand-btn-wrapper {
    text-align: center;
    margin-top: 15px;
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
      white-space: nowrap;
      margin-top: 2px;
    }

    .content {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #888;
      font-size: 14px;
      max-width: 70%;
      text-align: right;

      &.notice-content {
        flex-direction: column;
        align-items: flex-end;
        width: 100%;
      }

      .value {
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        line-clamp: 1;
        -webkit-box-orient: vertical;

        &.notice-text {
          -webkit-line-clamp: 3;
          line-clamp: 3;
          text-align: right;
          line-height: 1.4;
        }
      }

      .arrow-icon {
        font-size: 14px;
        color: #ccc;
        flex-shrink: 0;
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

:deep(.invite-dialog) {
  .el-dialog__header {
    padding-bottom: 10px;
  }

  .el-dialog__body {
    padding: 0;
  }
}
</style>
