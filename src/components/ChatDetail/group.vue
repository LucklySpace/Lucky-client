<template>
  <el-scrollbar :height="chatHeight">
    <div class="group-container">
      <el-form :model="groupInfoData" label-position="top" @submit.prevent>
        <!-- 搜索群成员 -->
        <div class="search-section">
          <el-input
            v-model="ui.search"
            class="group-search"
            clearable
            :placeholder="$t('business.group.members.search')"
          >
          </el-input>
        </div>

        <!-- 群成员网格 -->
        <div class="members-section">
          <div class="section-header">
            <span>{{ $t("business.group.members.title") }} ({{ filteredMembers.length }})</span>
          </div>
          <div class="members-grid">
            <div
              v-for="item in displayedMembers"
              :key="item.userId"
              class="member-item"
              @click="handleMemberClick(item)"
              @contextmenu.prevent="handleMemberContext($event, item)"
            >
              <div class="avatar-wrapper">
                <Avatar class="member-avatar" :avatar="item.avatar" :name="item.name" :width="42" :borderRadius="6" />
              </div>
              <div class="member-name" :title="item.name">{{ item.alias || item.name }}</div>
            </div>
            <!-- 添加成员按钮 -->
            <div v-if="canInvite" class="member-item clickable" @click="handleInviteDialog">
              <div class="add-btn">
                <el-icon>
                  <Plus />
                </el-icon>
              </div>
              <div class="member-name">{{ $t("common.actions.add") }}</div>
            </div>
            <!-- 移除成员按钮（仅管理员可见） -->
            <div
              v-if="hasAdminPermission && filteredMembers.length > 1"
              class="member-item clickable"
              @click="ui.dialogs.removeMember = true"
            >
              <div class="add-btn remove-btn">
                <el-icon>
                  <Minus />
                </el-icon>
              </div>
              <div class="member-name">移除</div>
            </div>
          </div>
          <div v-if="filteredMembers.length > 15" class="expand-btn-wrapper">
            <el-button link type="primary" @click="toggleExpand">
              {{ ui.members.expanded ? $t("business.group.members.collapse") : $t("business.group.members.viewMore") }}
            </el-button>
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- 基本设置 -->
        <div class="settings-section">
          <div class="setting-item" :class="{ clickable: isOwner }" @click="startEditGroupName">
            <span class="label">{{ $t("business.group.details.name") }}</span>
            <div class="content">
              <template v-if="!ui.edit.name.editing">
                <span class="value">{{ groupInfoData.name }}</span>
                <el-icon v-if="isOwner" class="arrow-icon">
                  <ArrowRight />
                </el-icon>
              </template>
              <el-input
                v-else
                ref="groupNameInputRef"
                v-model="ui.edit.name.value"
                size="small"
                @blur="checkAndCancelEditGroupName"
                @keydown.enter.prevent="saveGroupInfo"
                @click.stop
              />
            </div>
          </div>

          <div class="setting-item" :class="{ clickable: canEditNotice }" @click="startEditGroupNotice">
            <span class="label">{{ $t("business.group.details.notice") }}</span>
            <div class="content notice-content">
              <template v-if="!ui.edit.notice.editing">
                <span class="value notice-text">{{
                  groupInfoData.notification || $t("business.group.notice.empty")
                }}</span>
                <el-icon v-if="canEditNotice" class="arrow-icon">
                  <ArrowRight />
                </el-icon>
              </template>
              <el-input
                v-else
                ref="groupNoticeRef"
                v-model="ui.edit.notice.value"
                type="textarea"
                :rows="3"
                @blur="checkAndCancelEditGroupNotice"
                @click.stop
              />
            </div>
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- 群管理设置（仅管理员可见） -->
        <div v-if="hasAdminPermission" class="settings-section">
          <div class="section-title">群管理</div>

          <div class="setting-item clickable" @click="ui.dialogs.joinMode = true">
            <span class="label">加入方式</span>
            <div class="content">
              <span class="value">{{ joinModeText }}</span>
              <el-icon class="arrow-icon">
                <ArrowRight />
              </el-icon>
            </div>
          </div>

          <div class="setting-item">
            <span class="label">全员禁言</span>
            <div class="content">
              <el-switch v-model="muteAllSwitch" class="custom-switch" @change="onMuteAllSwitchChange" />
            </div>
          </div>

          <div v-if="isOwner" class="setting-item clickable" @click="ui.dialogs.transferOwner = true">
            <span class="label">移交群主</span>
            <div class="content">
              <el-icon class="arrow-icon">
                <ArrowRight />
              </el-icon>
            </div>
          </div>
        </div>

        <div v-if="hasAdminPermission" class="section-divider"></div>

        <!-- 交互设置 -->
        <div class="settings-section">
          <div class="setting-item clickable" @click="switchHistoryMessage">
            <span class="label">{{ $t("pages.chat.toolbar.history") }}</span>
            <div class="content">
              <el-icon class="arrow-icon">
                <ArrowRight />
              </el-icon>
            </div>
          </div>

          <div class="setting-item">
            <span class="label">{{ $t("pages.chat.toolbar.mute") }}</span>
            <div class="content">
              <el-switch v-model="ui.switches.mute" class="custom-switch" />
            </div>
          </div>

          <div class="setting-item">
            <span class="label">{{ $t("pages.chat.toolbar.pin") }}</span>
            <div class="content">
              <el-switch v-model="ui.switches.top" class="custom-switch" />
            </div>
          </div>
        </div>

        <div class="section-divider"></div>

        <!-- 危险操作 -->
        <div class="danger-section">
          <div class="danger-item clickable" @click="handleClearGroupMessage">
            {{ $t("components.dialog.clearChat.title") }}
          </div>
          <div class="danger-item clickable" @click="handleQuitGroup">
            {{ isOwner ? $t("pages.contacts.actions.delete") : $t("business.group.actions.leave") }}
          </div>
        </div>
      </el-form>

      <!-- 邀请成员弹窗 -->
      <el-dialog
        v-model="ui.dialogs.invite"
        :destroy-on-close="true"
        class="invite-dialog"
        :title="$t('components.search.inviteMembers')"
        width="550px"
      >
        <SelectContact @handleAddGroupMember="handleAddGroupMember" @handleClose="handleInviteDialog"></SelectContact>
      </el-dialog>

      <!-- 历史消息弹窗 -->
      <HistoryDialog
        :visible="ui.dialogs.history"
        :title="$t('pages.chat.toolbar.history')"
        @handleClose="toggleHistoryDialog"
      />

      <!-- 成员操作弹窗 -->
      <el-dialog v-model="ui.dialogs.memberAction" title="成员管理" width="320px" class="member-action-dialog">
        <div v-if="selectedMember" class="member-action-content">
          <div class="member-info">
            <Avatar :avatar="selectedMember.avatar" :name="selectedMember.name" :width="48" :borderRadius="8" />
            <div class="member-detail">
              <div class="name">{{ selectedMember.alias || selectedMember.name }}</div>
              <div class="role-text">{{ getRoleText(selectedMember.role) }}</div>
            </div>
          </div>
          <div
            v-if="
              selectedMember && canMuteMember(selectedMember) && selectedMember.mute === GroupMuteStatus.NORMAL.code
            "
            class="mute-duration"
          >
            <span class="mute-label">禁言时长</span>
            <el-select v-model="ui.muteDurationSec" size="small" class="mute-select">
              <el-option v-for="opt in muteOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </div>
          <div class="action-list">
            <!-- 设置管理员（仅群主可操作非群主成员） -->
            <div v-if="isOwner && selectedMember.role !== 0" class="action-item" @click="handleSetAdmin">
              <el-icon>
                <User />
              </el-icon>
              <span>{{ selectedMember.role === 1 ? "取消管理员" : "设为管理员" }}</span>
            </div>
            <!-- 禁言（管理员可操作普通成员） -->
            <div v-if="canMuteMember(selectedMember)" class="action-item" @click="handleMuteMember">
              <el-icon>
                <MuteNotification />
              </el-icon>
              <span>{{ selectedMember.mute === 0 ? "取消禁言" : "禁言" }}</span>
            </div>
            <!-- 踢出（管理员可操作普通成员，群主可操作所有非群主） -->
            <div v-if="canKickMember(selectedMember)" class="action-item danger" @click="handleKickMember">
              <el-icon>
                <Delete />
              </el-icon>
              <span>移出群聊</span>
            </div>
          </div>
        </div>
      </el-dialog>

      <!-- 移交群主弹窗 -->
      <el-dialog v-model="ui.dialogs.transferOwner" title="移交群主" width="400px" class="transfer-dialog">
        <div class="transfer-content">
          <p class="transfer-tip">选择新群主后，你将成为普通成员</p>
          <el-scrollbar max-height="300px">
            <div class="transfer-list">
              <div
                v-for="member in transferableMembers"
                :key="member.userId"
                class="transfer-item"
                :class="{ selected: ui.selectedTransferMember === member.userId }"
                @click="ui.selectedTransferMember = member.userId"
              >
                <Avatar :avatar="member.avatar" :name="member.name" :width="36" :borderRadius="6" />
                <span class="name">{{ member.alias || member.name }}</span>
                <el-icon v-if="ui.selectedTransferMember === member.userId" class="check-icon">
                  <Check />
                </el-icon>
              </div>
            </div>
          </el-scrollbar>
        </div>
        <template #footer>
          <el-button @click="ui.dialogs.transferOwner = false">取消</el-button>
          <el-button type="primary" :disabled="!ui.selectedTransferMember" @click="confirmTransferOwner"
            >确认移交
          </el-button>
        </template>
      </el-dialog>

      <!-- 设置加入方式弹窗 -->
      <el-dialog v-model="ui.dialogs.joinMode" title="加入群聊方式" width="340px" class="join-mode-dialog">
        <div class="join-mode-content">
          <div
            v-for="mode in joinModeOptions"
            :key="mode.value"
            class="mode-item"
            :class="{ selected: groupInfoData.joinMode === mode.value }"
            @click="handleJoinModeChange(mode.value)"
          >
            <div class="mode-info">
              <div class="mode-label">{{ mode.label }}</div>
              <div class="mode-desc">{{ mode.desc }}</div>
            </div>
            <el-icon v-if="groupInfoData.joinMode === mode.value" class="check-icon">
              <Check />
            </el-icon>
          </div>
        </div>
      </el-dialog>

      <!-- 移除成员弹窗 -->
      <el-dialog v-model="ui.dialogs.removeMember" title="移除成员" width="400px" class="remove-member-dialog">
        <div class="remove-content">
          <el-input v-model="ui.removeSearch" placeholder="搜索成员" clearable class="remove-search" />
          <el-scrollbar max-height="300px">
            <div class="remove-list">
              <div
                v-for="member in removableMembers"
                :key="member.userId"
                class="remove-item"
                :class="{ selected: ui.selectedRemoveMembers.includes(member.userId) }"
                @click="toggleRemoveMember(member.userId)"
              >
                <el-checkbox :model-value="ui.selectedRemoveMembers.includes(member.userId)" @click.stop />
                <Avatar :avatar="member.avatar" :name="member.name" :width="36" :borderRadius="6" />
                <span class="name">{{ member.alias || member.name }}</span>
              </div>
            </div>
          </el-scrollbar>
        </div>
        <template #footer>
          <el-button @click="ui.dialogs.removeMember = false">取消</el-button>
          <el-button type="danger" :disabled="!ui.selectedRemoveMembers.length" @click="confirmRemoveMembers">
            移除 {{ ui.selectedRemoveMembers.length ? `(${ui.selectedRemoveMembers.length})` : "" }}
          </el-button>
        </template>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script lang="ts" setup>
  import Avatar from "@/components/Avatar/index.vue";
  import HistoryDialog from "@/components/History/index.vue";
  import SelectContact from "@/components/SelectContact/index.vue";
  import { Events, GroupJoinMode, GroupMemberRole, GroupMuteStatus, MessageType } from "@/constants";
  import Chats from "@/database/entity/Chats";
  import { globalEventBus } from "@/hooks/useEventBus";
  import { useChatStore } from "@/store/modules/chat";
  import { useGroupStore, type GroupMember } from "@/store/modules/group";
  import { ElMessage, ElMessageBox } from "element-plus";
  import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from "vue";
  import { useI18n } from "vue-i18n";

  const { t: $t } = useI18n();
  const chatStore = useChatStore();
  const groupStore = useGroupStore();
  const emit = defineEmits(["handleQuitGroup", "handleClearGroupMessage"]);

  // ==================== 状态管理 ====================
  const ui = reactive({
    search: "",
    removeSearch: "",
    members: { expanded: false },
    dialogs: {
      invite: false,
      history: false,
      memberAction: false,
      transferOwner: false,
      joinMode: false,
      removeMember: false,
    },
    edit: {
      name: { editing: false, value: "" },
      notice: { editing: false, value: "" },
    },
    switches: {} as any,
    selectedTransferMember: "",
    selectedRemoveMembers: [] as string[],
    muteDurationSec: 2592000,
  });

  const muteOptions = [
    { value: 600, label: "10分钟" },
    { value: 3600, label: "1小时" },
    { value: 43200, label: "12小时" },
    { value: 86400, label: "1天" },
    { value: 259200, label: "3天" },
    { value: 604800, label: "7天" },
    { value: 2592000, label: "30天" },
  ];

  const selectedMember = ref<GroupMember | null>(null);
  const chatHeight = computed(() => window.innerHeight - 60);

  const groupInfoData = reactive<{
    name: string;
    notification: string;
    joinMode: number;
  }>({
    name: "",
    notification: "",
    joinMode: GroupJoinMode.APPROVAL.code as number,
  });

  // ==================== 权限计算 ====================
  const isOwner = computed(() => groupStore.getIsOwner);
  const hasAdminPermission = computed(() => groupStore.getHasAdminPermission);
  const canEditNotice = computed(() => groupStore.getHasAdminPermission);
  const canInvite = computed(() => true); // 所有成员都可以邀请

  // ==================== 成员列表 ====================
  const filteredMembers = computed(() => {
    const members = groupStore.getMemberList;
    const q = ui.search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m: any) => (m?.name || "").toLowerCase().includes(q) || (m?.alias || "").toLowerCase().includes(q)
    );
  });

  const displayedMembers = computed(() =>
    ui.members.expanded ? filteredMembers.value : filteredMembers.value.slice(0, 14)
  );

  // 可移交群主的成员列表（排除自己）
  const transferableMembers = computed(() => {
    const ownerId = groupStore.getOwnerId;
    return groupStore.getMemberList.filter(m => m.userId !== ownerId);
  });

  // 可移除的成员列表
  const removableMembers = computed(() => {
    const ownerId = groupStore.getOwnerId;
    const currentRole = groupStore.getCurrentRole;
    const q = ui.removeSearch.trim().toLowerCase();

    return groupStore.getMemberList.filter(m => {
      // 不能移除自己
      if (m.userId === ownerId) return false;
      // 群主可以移除所有人，管理员只能移除普通成员
      if (currentRole === GroupMemberRole.OWNER.code) {
        return !q || (m.name || "").toLowerCase().includes(q);
      }
      if (currentRole === GroupMemberRole.ADMIN.code) {
        return m.role === GroupMemberRole.MEMBER.code && (!q || (m.name || "").toLowerCase().includes(q));
      }
      return false;
    });
  });

  // ==================== 群设置相关 ====================
  const joinModeOptions = [
    { value: GroupJoinMode.FREE.code, label: "自由加入", desc: "任何人都可以直接加入" },
    { value: GroupJoinMode.APPROVAL.code, label: "需要验证", desc: "需要群主或管理员同意" },
    { value: GroupJoinMode.FORBIDDEN.code, label: "禁止加入", desc: "不允许新成员加入" },
  ];

  const joinModeText = computed(() => {
    const mode = joinModeOptions.find(m => m.value === groupInfoData.joinMode);
    return mode?.label || "需要验证";
  });

  const muteAllSwitch = computed({
    get: () => groupStore.getIsMuteAll,
    set: () => {},
  });

  // ==================== 成员操作权限判断 ====================
  const canKickMember = (member: GroupMember) => {
    if (!member || member.userId === groupStore.getOwnerId) return false;
    const currentRole = groupStore.getCurrentRole;
    // 群主可以踢除任何非群主成员
    if (currentRole === GroupMemberRole.OWNER.code) return member.role !== GroupMemberRole.OWNER.code;
    // 管理员只能踢除普通成员
    if (currentRole === GroupMemberRole.ADMIN.code) return member.role === GroupMemberRole.MEMBER.code;
    return false;
  };

  const canMuteMember = (member: GroupMember) => {
    if (!member || member.userId === groupStore.getOwnerId) return false;
    const currentRole = groupStore.getCurrentRole;
    // 群主可以禁言任何非群主成员
    if (currentRole === GroupMemberRole.OWNER.code) return member.role !== GroupMemberRole.OWNER.code;
    // 管理员只能禁言普通成员
    if (currentRole === GroupMemberRole.ADMIN.code) return member.role === GroupMemberRole.MEMBER.code;
    return false;
  };

  const getRoleText = (role?: number) => {
    switch (role) {
      case GroupMemberRole.OWNER.code:
        return "群主";
      case GroupMemberRole.ADMIN.code:
        return "管理员";
      default:
        return "成员";
    }
  };

  // ==================== 事件处理 ====================
  const onNoPermission = () => {
    ElMessage.warning($t("business.group.empty.noSelection"));
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
    if (currentChat && currentChat.chatType == MessageType.GROUP_MESSAGE.code) {
      groupInfoData.name = currentChat.name ?? "";
      groupInfoData.notification = (currentChat as any).notification || "";
      groupInfoData.joinMode = groupStore.info?.applyJoinType ?? GroupJoinMode.APPROVAL.code;
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

  // ==================== 成员操作 ====================
  const toggleExpand = () => {
    ui.members.expanded = !ui.members.expanded;
  };

  const handleInviteDialog = () => {
    ui.dialogs.invite = !ui.dialogs.invite;
  };

  const handleAddGroupMember = async (arr: any) => {
    if (!arr?.length) return;
    const groupId = chatStore.currentChat?.toId;
    if (!groupId) return;

    await groupStore.inviteMembers({
      groupId: String(groupId),
      memberIds: arr.map((m: any) => m.friendId || m.userId || m),
      type: 1,
    });
    ui.dialogs.invite = false;
    ElMessage.success("邀请已发送");
  };

  const handleMemberClick = (member: GroupMember) => {
    // 点击自己不弹窗
    if (member.userId === groupStore.getOwnerId) return;
    // 非管理员不显示管理弹窗
    if (!hasAdminPermission.value) return;

    selectedMember.value = member;
    ui.dialogs.memberAction = true;
  };

  const handleMemberContext = (event: MouseEvent, member: GroupMember) => {
    event.preventDefault();
    handleMemberClick(member);
  };

  const handleSetAdmin = async () => {
    if (!selectedMember.value) return;
    const groupId = chatStore.currentChat?.toId;
    if (!groupId) return;

    const isCurrentAdmin = selectedMember.value.role === GroupMemberRole.ADMIN.code;
    const newRole = isCurrentAdmin ? GroupMemberRole.MEMBER.code : GroupMemberRole.ADMIN.code;

    const result = await groupStore.setAdmin({
      groupId: String(groupId),
      targetUserId: selectedMember.value.userId,
      role: newRole as number,
    });

    if (result) {
      ElMessage.success(isCurrentAdmin ? "已取消管理员" : "已设为管理员");
      ui.dialogs.memberAction = false;
    }
  };

  const handleMuteMember = async () => {
    if (!selectedMember.value) return;
    const groupId = chatStore.currentChat?.toId;
    if (!groupId) return;

    const isMuted = selectedMember.value.mute === GroupMuteStatus.MUTED.code;

    const result = await groupStore.muteMember({
      groupId: String(groupId),
      targetUserId: selectedMember.value.userId,
      mute: (isMuted ? GroupMuteStatus.NORMAL.code : GroupMuteStatus.MUTED.code) as number,
      muteDuration: isMuted ? 0 : ui.muteDurationSec,
    });

    if (result) {
      ElMessage.success(isMuted ? "已取消禁言" : "已禁言该成员");
      ui.dialogs.memberAction = false;
    }
  };

  const handleKickMember = async () => {
    if (!selectedMember.value) return;

    await ElMessageBox.confirm(
      `确定将 ${selectedMember.value.alias || selectedMember.value.name} 移出群聊？`,
      "移出群聊",
      { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" }
    );

    const groupId = chatStore.currentChat?.toId;
    if (!groupId) return;

    const result = await groupStore.kickMember({
      groupId: String(groupId),
      targetUserId: selectedMember.value.userId,
    });

    if (result) {
      ElMessage.success("已移出群聊");
      ui.dialogs.memberAction = false;
    }
  };

  const toggleRemoveMember = (userId: string) => {
    const idx = ui.selectedRemoveMembers.indexOf(userId);
    if (idx === -1) {
      ui.selectedRemoveMembers.push(userId);
    } else {
      ui.selectedRemoveMembers.splice(idx, 1);
    }
  };

  const confirmRemoveMembers = async () => {
    if (!ui.selectedRemoveMembers.length) return;

    await ElMessageBox.confirm(`确定移除选中的 ${ui.selectedRemoveMembers.length} 名成员？`, "移除成员", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    const groupId = chatStore.currentChat?.toId;
    if (!groupId) return;

    let successCount = 0;
    for (const userId of ui.selectedRemoveMembers) {
      const result = await groupStore.kickMember({
        groupId: String(groupId),
        targetUserId: userId,
      });
      if (result) successCount++;
    }

    if (successCount > 0) {
      ElMessage.success(`已移除 ${successCount} 名成员`);
      ui.selectedRemoveMembers = [];
      ui.dialogs.removeMember = false;
    }
  };

  // ==================== 群设置操作 ====================
  const handleJoinModeChange = async (mode: number) => {
    const groupId = chatStore.currentChat?.toId;
    if (!groupId) return;

    const result = await groupStore.setJoinMode(String(groupId), mode);
    if (result) {
      groupInfoData.joinMode = mode;
      ElMessage.success("加入方式已更新");
      ui.dialogs.joinMode = false;
    }
  };

  const onMuteAllSwitchChange = (val: string | number | boolean) => {
    handleMuteAllChange(Boolean(val));
  };

  const handleMuteAllChange = async (value: boolean) => {
    const groupId = chatStore.currentChat?.toId;
    if (!groupId) return;

    const muteStatus = value ? GroupMuteStatus.MUTED.code : GroupMuteStatus.NORMAL.code;
    const result = await groupStore.setMuteAll(String(groupId), muteStatus as number);
    if (result) {
      ElMessage.success(value ? "已开启全员禁言" : "已关闭全员禁言");
    }
  };

  const confirmTransferOwner = async () => {
    if (!ui.selectedTransferMember) return;

    const member = transferableMembers.value.find(m => m.userId === ui.selectedTransferMember);
    if (!member) return;

    await ElMessageBox.confirm(
      `确定将群主移交给 ${member.alias || member.name}？移交后你将成为普通成员。`,
      "移交群主",
      { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" }
    );

    const groupId = chatStore.currentChat?.toId;
    if (!groupId) return;

    const result = await groupStore.transferOwner({
      groupId: String(groupId),
      targetUserId: ui.selectedTransferMember,
    });

    if (result) {
      ElMessage.success("群主已移交");
      ui.dialogs.transferOwner = false;
      ui.selectedTransferMember = "";
    }
  };

  // ==================== 群名称和公告编辑 ====================
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

    let hasChange = false;
    const params: any = { groupId: String(groupId) };

    if (ui.edit.name.editing && ui.edit.name.value.trim() && ui.edit.name.value !== groupInfoData.name) {
      params.groupName = ui.edit.name.value;
      hasChange = true;
    }
    if (ui.edit.notice.editing && ui.edit.notice.value.trim() !== groupInfoData.notification) {
      if (!canEditNotice.value) {
        onNoPermission();
      } else {
        params.notification = ui.edit.notice.value;
        hasChange = true;
      }
    }

    if (!hasChange) {
      ui.edit.name.editing = false;
      ui.edit.notice.editing = false;
      return;
    }

    try {
      const result = await groupStore.updateGroupInfo(params, chatId);
      if (result) {
        if (params.groupName) groupInfoData.name = params.groupName;
        if (params.notification !== undefined) groupInfoData.notification = params.notification;
        ElMessage.success("群信息已更新");
      }
      ui.edit.name.editing = false;
      ui.edit.notice.editing = false;
    } catch (e) {
      ElMessage.error("更新失败");
    }
  };

  const checkAndCancelEditGroupName = () => {
    if (ui.edit.name.value.trim() && ui.edit.name.value !== groupInfoData.name) {
      ElMessageBox.confirm("是否保存群名称更改？", "提示", {
        confirmButtonText: "保存",
        cancelButtonText: "取消",
        type: "warning",
      })
        .then(() => saveGroupInfo())
        .catch(() => {
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
        type: "warning",
      })
        .then(() => saveGroupInfo())
        .catch(() => {
          ui.edit.notice.editing = false;
          ui.edit.notice.value = groupInfoData.notification;
        });
    } else {
      ui.edit.notice.editing = false;
    }
  };

  // ==================== 其他操作 ====================
  const switchHistoryMessage = () => (ui.dialogs.history = true);
  const toggleHistoryDialog = () => (ui.dialogs.history = !ui.dialogs.history);

  const currentItem = computed(() => {
    const { currentChat } = chatStore;
    const chatId = currentChat?.chatId;
    return chatId ? chatStore.getChatById(chatId) : null;
  });

  const top = computed({
    get: () => currentItem.value?.isTop === 1,
    set: () => {
      if (currentItem.value) chatStore.handlePinChat(currentItem.value as Chats);
    },
  });

  const messageMute = computed({
    get: () => currentItem.value?.isMute === 1,
    set: () => {
      if (currentItem.value) chatStore.handleMuteChat(currentItem.value as Chats);
    },
  });

  ui.switches = { top, mute: messageMute };

  const handleClearGroupMessage = () => {
    ElMessageBox.confirm("确定清空该群聊的聊天记录？", "提示", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning",
    })
      .then(() => emit("handleClearGroupMessage"))
      .catch(() => {});
  };

  const handleQuitGroup = () => {
    const title = isOwner.value ? "解散群聊" : "退出群聊";
    const msg = isOwner.value ? "确定解散该群聊？" : "确定退出群聊？";
    ElMessageBox.confirm(msg, title, {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning",
    })
      .then(() => emit("handleQuitGroup"))
      .catch(() => {});
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

        .avatar-wrapper {
          position: relative;
        }

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

          &.remove-btn:hover {
            border-color: #f56c6c;
            color: #f56c6c;
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

    .section-title {
      padding: 12px 16px 8px;
      font-size: 13px;
      color: #999;
    }

    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
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
      }

      .content {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #888;
        font-size: 14px;
        max-width: 60%;
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

  // 弹窗样式
  :deep(.invite-dialog),
  :deep(.member-action-dialog),
  :deep(.transfer-dialog),
  :deep(.join-mode-dialog),
  :deep(.remove-member-dialog) {
    .el-dialog__header {
      padding-bottom: 10px;
      border-bottom: 1px solid #f0f2f5;
    }

    .el-dialog__body {
      padding: 16px 20px;
    }
  }

  // 成员操作弹窗
  .member-action-content {
    .member-info {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid #f0f2f5;

      .member-detail {
        .name {
          font-size: 16px;
          font-weight: 500;
          color: #333;
        }

        .role-text {
          font-size: 12px;
          color: #999;
          margin-top: 4px;
        }
      }
    }

    .mute-duration {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 8px 0;
      .mute-label {
        font-size: 13px;
        color: #666;
        white-space: nowrap;
      }
      .mute-select {
        width: 160px;
      }
    }
    .action-list {
      padding-top: 8px;

      .action-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 8px;
        cursor: pointer;
        border-radius: 6px;
        transition: background-color 0.2s;

        &:hover {
          background-color: #f5f5f5;
        }

        &.danger {
          color: #f56c6c;
        }

        .el-icon {
          font-size: 18px;
        }
      }
    }
  }

  // 移交群主弹窗
  .transfer-content {
    .transfer-tip {
      color: #999;
      font-size: 13px;
      margin-bottom: 16px;
    }

    .transfer-list {
      .transfer-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        cursor: pointer;
        border-radius: 6px;
        transition: background-color 0.2s;

        &:hover {
          background-color: #f5f5f5;
        }

        &.selected {
          background-color: #ecf5ff;
        }

        .name {
          flex: 1;
          font-size: 14px;
          color: #333;
        }

        .check-icon {
          color: #409eff;
          font-size: 18px;
        }
      }
    }
  }

  // 加入方式弹窗
  .join-mode-content {
    .mode-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 12px;
      cursor: pointer;
      border-radius: 8px;
      transition: background-color 0.2s;
      margin-bottom: 8px;

      &:last-child {
        margin-bottom: 0;
      }

      &:hover {
        background-color: #f5f5f5;
      }

      &.selected {
        background-color: #ecf5ff;
      }

      .mode-info {
        .mode-label {
          font-size: 14px;
          color: #333;
          font-weight: 500;
        }

        .mode-desc {
          font-size: 12px;
          color: #999;
          margin-top: 4px;
        }
      }

      .check-icon {
        color: #409eff;
        font-size: 18px;
      }
    }
  }

  // 移除成员弹窗
  .remove-content {
    .remove-search {
      margin-bottom: 12px;
    }

    .remove-list {
      .remove-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 8px;
        cursor: pointer;
        border-radius: 6px;
        transition: background-color 0.2s;

        &:hover {
          background-color: #f5f5f5;
        }

        &.selected {
          background-color: #fef0f0;
        }

        .name {
          flex: 1;
          font-size: 14px;
          color: #333;
        }
      }
    }
  }
</style>
