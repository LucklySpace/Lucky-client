<template>
  <div
    :id="`message-invite-${message.messageId}`"
    v-memo="[message, message.isOwner]"
    :aria-label="`${$t('invite.ariaLabelPrefix')}: ${parsedBody?.groupName || ''} ${$t('invite.ariaLabelFrom')} ${
      parsedBody?.inviterName || ''
    }`"
    :class="['bubble', { owner: message.isOwner }]"
    class="invite-bubble"
    role="group"
  >
    <!-- 气泡主体 -->
    <div class="invite-bubble__inner" role="button" tabindex="0">
      <!-- 左侧：群头像（可选） -->
      <div v-if="parsedBody?.groupAvatar" class="invite-bubble__left">
        <img :alt="parsedBody.groupName" :src="parsedBody.groupAvatar" class="invite-bubble__avatar" />
      </div>

      <!-- 主体信息 -->
      <div class="invite-bubble__content">
        <div class="invite-bubble__header">
          <div class="invite-bubble__title" v-html="highlight(parsedBody?.groupName)"></div>
        </div>

        <!-- 操作区域：根据状态显示 -->
        <div role="toolbar">
          <div v-if="parsedBody?.approveStatus === 0" class="invite-bubble__actions">
            <div v-if="parsedBody?.userId == messageStore.getOwnerId">
              <el-button
                :aria-label="$t('invite.accept')"
                class="invite-bubble__action-btn"
                size="small"
                type="primary"
                @click.stop="handleApprove(true)"
              >
                {{ $t("invite.accept") }}
              </el-button>
              <el-button
                :aria-label="$t('invite.decline')"
                class="invite-bubble__action-btn"
                size="small"
                @click.stop="handleApprove(false)"
              >
                {{ $t("invite.decline") }}
              </el-button>
            </div>

            <span v-else class="invite-bubble__actions--pending">{{ $t("invite.status.pending") }}</span>
          </div>
          <div v-else class="invite-bubble__status">
            <span v-if="parsedBody?.approveStatus === 1" class="invite-bubble__status--accepted">{{
                $t("invite.status.accepted")
              }}</span>
            <span v-else-if="parsedBody?.approveStatus === 2" class="invite-bubble__status--declined">{{
                $t("invite.status.declined")
              }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { useMessageStore } from "@/store/modules/message";
  import { ElMessage } from "element-plus";
  import { computed } from "vue";
  import { escapeHtml } from "@/utils/Strings";
  import { useI18n } from "vue-i18n";

  const props = defineProps({
    message: {
      type: Object,
      required: true
    }
  });

  const { t } = useI18n();
  const messageStore = useMessageStore();

  // parsedBody：计算属性，解析后返回对象
  const parsedBody = computed(() => parseBody(props.message.messageBody));

  // 接受或拒绝邀请
  async function handleApprove(flag: boolean = true) {
    try {
      const bodyUpdate = {
        ...parseBody(props.message.messageBody),
        approveStatus: flag ? 1 : 2
      };
      await messageStore.handleApproveGroupInvite(bodyUpdate);
      ElMessage.success(
        flag
          ? t("invite.msg.joined", { name: bodyUpdate.groupName || bodyUpdate.groupId || "" })
          : t("invite.msg.declined")
      );
      messageStore.handleUpdateMessage(props.message, {
        messageBody: JSON.stringify(bodyUpdate)
      });
    } catch (err) {
      console.error("failed", err);
      ElMessage.error(flag ? t("invite.err.accept") : t("invite.err.decline"));
    }
  }

  // 解析 messageBody（兼容 string 或 object）
  function parseBody(raw: any) {
    if (!raw) return null;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return { ...parsed, approveStatus: parsed.approveStatus ?? 0 }; // 默认待处理状态
      } catch {
        return { approveStatus: 1 };
      }
    }
    return { ...raw, approveStatus: raw.approveStatus ?? 0 }; // 确保 status 默认值
  }

  // 高亮函数：简单安全的关键字高亮
  function highlight(text?: string) {
    if (!text) return "";
    return escapeHtml(String(text));
  }

  // 更新消息状态
  function patchMessageLocalStatus(approveStatus: "accepted" | "declined") {
    try {
    } catch (e) {
      console.warn("patchMessageLocalStatus failed", e);
    }
  }
</script>

<style lang="scss" scoped>
  $bubble-bg: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  $bubble-border: rgba(20, 33, 64, 0.06);
  $text-primary: #0f1724;
  $text-muted: #6b7280;
  $primary-color: #409eff;
  $success-color: #2ecc71;
  $danger-color: #e74c3c;
  $pending-color: #999;
  $bubble-width: 280px;

  .invite-bubble {
    max-width: $bubble-width;
    margin: 5px 0;
    display: flex;
    align-items: flex-start;

    &.owner {
      justify-content: flex-end;
    }

    &__inner {
      display: flex;
      gap: 12px;
      background: $bubble-bg;
      border: 1px solid $bubble-border;
      box-shadow: 0 6px 18px rgba(16, 24, 40, 0.06);
      padding: 10px;
      border-radius: 12px;
      cursor: pointer;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
      width: $bubble-width;
    }

    &__left {
      flex: 0 0 56px;
      display: flex;
      align-items: center;
      justify-content: center;

      .invite-bubble__avatar {
        width: 56px;
        height: 56px;
        border-radius: 8px;
        object-fit: cover;
        border: 1px solid rgba(0, 0, 0, 0.04);
        box-shadow: 0 4px 10px rgba(11, 22, 39, 0.04);
      }
    }

    &__content {
      flex: 1 1 auto;
      min-width: 0;

      .invite-bubble__header {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .invite-bubble__title {
        font-size: 16px;
        font-weight: 600;
        color: $text-primary;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .invite-bubble__actions {
        margin-top: 10px;
        display: flex;
        gap: 2px;
        align-items: center;

        &--pending {
          margin-top: 6px;
          color: $pending-color;
          font-size: 13px;
          font-weight: 500;
        }
      }

      .invite-bubble__action-btn {
        padding: 6px 10px;
        height: 30px;
        font-size: 13px;
        border-radius: 8px;
        transition: background-color 0.2s ease;

        &.el-button--primary {
          background-color: $primary-color;
          border-color: $primary-color;

          &:hover {
            background-color: #66b1ff;
          }
        }

        &:not(.el-button--primary) {
          background-color: transparent;
          border-color: #dcdcdc;
          color: $text-muted;

          &:hover {
            background-color: #f5f5f5;
          }
        }
      }

      .invite-bubble__status {
        margin-top: 16px;
        font-size: 13px;

        &--accepted {
          color: $success-color;
          font-weight: 500;
        }

        &--declined {
          color: $danger-color;
          font-weight: 500;
        }
      }
    }

    &:hover .invite-bubble__inner {
      //   transform: translateY(-2px);
      box-shadow: 0 8px 28px rgba(16, 24, 40, 0.08);
    }

    @media (max-width: 480px) {
      &__left {
        flex: 0 0 48px;

        .invite-bubble__avatar {
          width: 48px;
          height: 48px;
        }
      }
      &__inner {
        padding: 12px;
      }
      &__title {
        font-size: 15px;
      }
      &__action-btn {
        padding: 5px 10px;
        font-size: 12px;
      }
      &__status {
        font-size: 12px;
      }
    }
  }
</style>
