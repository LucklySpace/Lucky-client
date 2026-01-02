<template>
  <div class="contact-page-shell" role="region">
    <el-card 
      v-show="hasGroup" 
      :body-style="{ padding: '18px' }" 
      aria-live="polite" 
      class="contact-card group-card"
      shadow="hover"
    >
      <!-- 顶部：头像 + 基本信息 -->
      <el-row align="middle" class="card-top">
        <el-col :span="6" class="avatar-col no-select">
          <Avatar 
            :avatar="avatarSrc || ''" 
            :name="displayName" 
            :width="84" 
            :borderRadius="6" 
            backgroundColor="#ffb36b" 
          />
        </el-col>

        <el-col :span="18" class="meta-col">
          <div class="meta-row">
            <div class="name-and-meta">
              <div class="name">{{ displayName }}</div>
              <div class="meta-tags">
                <span class="tag">{{ groupTypeText }}</span>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <el-divider class="card-divider" />

      <!-- 群详情 -->
      <div class="info-section">
        <!-- 成员数 -->
        <div class="info-row">
          <strong class="no-select">{{ $t("group.memberLabel") }}</strong>
          <span>{{ groupInfo.memberCount ?? $t("group.unknown") }}</span>
        </div>

        <!-- 群描述 -->
        <div v-if="groupInfo.description" class="info-row signature">
          <strong class="no-select">{{ $t("group.descriptionLabel") }} </strong>
          <span>{{ groupInfo.description }}</span>
        </div>

        <!-- 群公告（从 chats 读取） -->
        <div class="info-row" v-if="groupNoticeText">
          <strong class="no-select">{{ $t('chat.groupChat.groupNotice') }}</strong>
          <span>{{ groupNoticeText }}</span>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="actions-row">
        <el-space>
          <el-button type="primary" @click="handleEnterGroup">
            {{ $t("group.enterGroup") }} 
          </el-button>
        </el-space>
      </div>
    </el-card>

    <div v-show="!hasGroup" class="empty-note">
      {{ $t("group.noSelectionOrEmpty") }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useFriendsStore } from "@/store/modules/friends";
import { useChatStore } from "@/store/modules/chat";
import { IMessageType } from "@/constants";
import Avatar from "@/components/Avatar/index.vue";

interface GroupInfo {
  groupId?: string;
  ownerId?: string;
  groupType?: number;
  groupName?: string;
  applyJoinType?: number;
  avatar?: string;
  memberCount?: number;
  description?: string;
}

const { t } = useI18n();
const router = useRouter();
const chatStore = useChatStore();
const friendStore = useFriendsStore();

// 计算属性：从 store 中读取 Info
const groupInfo = computed<GroupInfo>(() => friendStore.shipInfo ?? {});

// 关联到 chats 的该群会话
const relatedChat = computed(() => {
  const gid = groupInfo.value.groupId;
  if (!gid) return null;
  return chatStore.chatList.find(c => String(c.chatId) === String(gid)) || null;
});

// 展示名：优先用 chats.name，其次回退 groupInfo.groupName
const displayName = computed(() => {
  return relatedChat.value?.name ?? groupInfo.value.groupName ?? '';
});

// 是否存在有效群数据
const hasGroup = computed(() => {
  const g = groupInfo.value;
  return !!(g && g.groupId);
});

/* Avatar 回退逻辑 */
const avatarSrc = ref<string | undefined>(relatedChat.value?.avatar ?? groupInfo.value.avatar);

watch(
  () => [relatedChat.value?.avatar, groupInfo.value.avatar],
  ([chatAvatar, infoAvatar]) => {
    avatarSrc.value = chatAvatar ?? infoAvatar;
  }
);

/* 群类型文本 */
const groupTypeText = computed(() => {
  switch (groupInfo.value.groupType) {
    case 1: return t("group.type.normal");
    case 2: return t("group.type.private");
    default: return t("group.type.default");
  }
});

// 群公告文本
const groupNoticeText = computed(() => {
  const txt = relatedChat.value?.notification;
  return (txt || '').trim();
});

/* 进入群聊 */
async function handleEnterGroup() {
  if (!groupInfo.value.groupId) return;

  await chatStore.handleChangeCurrentChatByTarget(groupInfo.value, IMessageType.GROUP_MESSAGE.code);

  // 重置消息并获取
  chatStore.handleResetMessage();
  await chatStore.handleGetMessageCount();
  if (chatStore.currentChat) {
    await chatStore.handleGetMessageList(chatStore.currentChat);
  }

  // 跳转到消息页面
  router.push("/message");
}
</script>

<style lang="scss" scoped>
/* 样式复用 contacts 的风格 */
.contact-page-shell {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-bg-color-page);
  padding: 20px;
  box-sizing: border-box;
}

.contact-card {
  width: 100%;
  max-width: 480px;
  border-radius: 12px;
  
  :deep(.el-card__body) {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

.card-top {
  padding-bottom: 8px;
}

.avatar-col {
  display: flex;
  justify-content: center;
}

.meta-col {
  padding-left: 12px;
}

.meta-row {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 84px;
}

.name-and-meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  
  .name {
    font-size: 20px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 6px;
  }

  .meta-tags {
    display: flex;
    gap: 8px;
    
    .tag {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      background-color: var(--el-fill-color);
      color: var(--el-text-color-secondary);
    }
  }
}

.card-divider {
  margin: 8px 0 !important;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
}

.info-row {
  display: flex;
  align-items: center;
  font-size: 14px;
  min-height: 24px;
  
  strong {
    width: 80px;
    color: var(--el-text-color-regular);
    font-weight: normal;
    flex-shrink: 0;
  }
  
  span {
    color: var(--el-text-color-primary);
    word-break: break-all;
  }

  &.signature {
    align-items: flex-start;
  }
}

.actions-row {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.empty-note {
  color: var(--el-text-color-placeholder);
  font-size: 14px;
}
</style>
