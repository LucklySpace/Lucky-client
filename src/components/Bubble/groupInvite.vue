<template>
  <div :id="`message-invite-${message.messageId}`"
    v-memo="[message.messageId, message.isOwner, parsedBody?.approveStatus]"
    :class="['invite-bubble', { 'invite-bubble--owner': message.isOwner }]">
    <div class="invite-bubble__card" role="article">
      <!-- 群信息主体 -->
      <div class="invite-bubble__main">
        <Avatar v-if="parsedBody?.groupAvatar" :avatar="parsedBody.groupAvatar" :border-radius="8"
          :name="parsedBody.groupName" :width="48" class="invite-bubble__avatar" />
        <div class="invite-bubble__info">
          <h3 class="invite-bubble__name" v-text="parsedBody?.groupName || $t('business.group.title')" />
        </div>
      </div>

      <!-- 操作区 -->
      <div class="invite-bubble__footer">
        <!-- 待处理：仅被邀请人可见按钮 -->
        <template v-if="isPending">
          <div v-if="isInvitee" class="invite-bubble__actions">
            <el-button class="invite-bubble__btn invite-bubble__btn--primary" size="small" type="primary"
              @click.stop="handleApprove(true)">
              {{ $t("business.invite.status.accepted") }}
            </el-button>
            <el-button class="invite-bubble__btn" size="small" @click.stop="handleApprove(false)">
              {{ $t("business.invite.status.declined") }}
            </el-button>
          </div>
          <span v-else class="invite-bubble__status invite-bubble__status--pending">
            {{ $t("business.invite.status.pending") }}
          </span>
        </template>

        <!-- 已处理状态 -->
        <div v-else class="invite-bubble__status" :class="statusClass">
          <el-icon v-if="isAccepted">
            <CircleCheck />
          </el-icon>
          <el-icon v-else>
            <CircleClose />
          </el-icon>
          <span>{{ statusText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import Avatar from "@/components/Avatar/index.vue";
import { FriendRequestStatus } from "@/constants";
import { useChatStore } from "@/store/modules/chat";
import { CircleCheck, CircleClose } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

// ===================== 类型定义 =====================

interface GroupInviteBody {
  groupId: string;
  groupName?: string;
  groupAvatar?: string;
  inviterId?: string;
  inviterName?: string;
  userId?: string; // 被邀请人 ID
  approveStatus?: number; // 0: 待处理, 1: 已接受, 2: 已拒绝
}

interface Message {
  messageId: string;
  messageBody: string | GroupInviteBody;
  isOwner?: boolean;
}

// ===================== Props & Emits =====================

const props = defineProps<{
  message: Message;
}>();

// ===================== 状态管理 =====================

const { t } = useI18n();
const chatStore = useChatStore();
const { PENDING, ACCEPTED, REJECTED } = FriendRequestStatus;

// ===================== 计算属性 =====================

/** 解析消息体 */
const parsedBody = computed<GroupInviteBody | null>(() => {
  const raw = props.message.messageBody;
  if (!raw) return null;

  try {
    const body = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      ...body,
      approveStatus: body.approveStatus ?? PENDING.code
    };
  } catch {
    return null;
  }
});

/** 状态判断 */
const isPending = computed(() => parsedBody.value?.approveStatus === PENDING.code);
const isAccepted = computed(() => parsedBody.value?.approveStatus === ACCEPTED.code);
const isDeclined = computed(() => parsedBody.value?.approveStatus === REJECTED.code);

/** 是否为当前用户被邀请 */
const isInvitee = computed(() => {
  const currentUserId = chatStore.getOwnerId;
  return String(parsedBody.value?.userId) === String(currentUserId);
});

/** 状态样式类 */
const statusClass = computed(() => ({
  "invite-bubble__status--accepted": isAccepted.value,
  "invite-bubble__status--declined": isDeclined.value,
}));

/** 状态文本 */
const statusText = computed(() => {
  if (isAccepted.value) return t("business.invite.status.accepted");
  if (isDeclined.value) return t("business.invite.status.declined");
  return t("business.invite.status.pending");
});

// ===================== 方法 =====================

/**
 * 接受或拒绝邀请
 */
async function handleApprove(accept: boolean) {
  const body = parsedBody.value;
  if (!body || !isPending.value) return;

  try {
    const status = accept ? ACCEPTED.code : REJECTED.code;
    const bodyUpdate = { ...body, approveStatus: status };

    // 调用 store 处理
    await chatStore.handleApproveGroupInvite(bodyUpdate);

    // 提示语
    const successMsg = accept
      ? t("business.invite.messages.joined", { name: body.groupName || body.groupId })
      : t("business.invite.messages.declined");
    ElMessage.success(successMsg);

    // 更新本地消息显示
    chatStore.handleUpdateMessage(props.message, {
      messageBody: JSON.stringify(bodyUpdate)
    });
  } catch (err) {
    console.error("Group invite approval failed:", err);
    ElMessage.error(accept ? t("business.invite.errors.acceptFailed") : t("business.invite.errors.declineFailed"));
  }
}
</script>

<style lang="scss" scoped>
.invite-bubble {
  display: flex;
  margin: 8px 0;
  width: 100%;

  &--owner {
    justify-content: flex-end;
  }

  &__card {
    width: 260px;
    background: var(--header-bg-color, #ffffff);
    border: 1px solid var(--main-border-color, rgba(0, 0, 0, 0.08));
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    transition: all 0.2s ease;

    &:hover {
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
    }
  }

  &__main {
    display: flex;
    padding: 12px;
    gap: 12px;
    align-items: center;
  }

  &__avatar {
    flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
    color: var(--header-font-color, #1a1a1a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__desc {
    margin: 0;
    font-size: 12px;
    color: var(--content-message-font-color, #999);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__footer {
    padding: 8px 12px;
  }

  &__actions {
    display: flex;
    gap: 8px;
  }

  &__btn {
    flex: 1;
    height: 28px;
    font-size: 12px;
    border-radius: 6px;

    &--primary {
      background-color: var(--side-bg-color, #409eff);
      border-color: var(--side-bg-color, #409eff);
    }
  }

  &__status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 500;
    height: 28px;

    &--pending {
      color: var(--content-message-font-color, #999);
    }

    &--accepted {
      color: var(--success-color, #67c23a);
    }

    &--declined {
      color: var(--main-red-color, #f56c6c);
    }

    .el-icon {
      font-size: 16px;
    }
  }
}
</style>
